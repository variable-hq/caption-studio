import type { LlmSessionUsage, TranslationResult } from "@/ai/contracts";
import { emptyLlmSessionUsage, normalizeLlmSessionUsage } from "@/ai/usage";
import { isLanguageLocale } from "@/domain/languages";
import { json } from "@/experience/contracts";
import { CAPABILITY_TOKEN_PATTERN, HASH_HEX_PATTERN } from "@/http/tokens";
import {
  MAX_SESSION_OBSERVERS,
  MAX_TRANSCRIPTION_REQUESTS,
  normalizeCaptionStyle,
  normalizeTranslationRevision,
  type CaptionStyle,
  type ChannelStatus,
  type PublicCaptionEvent,
  type PublicCaptionRequest,
} from "@/live/contracts";

/**
 * `CaptionRoom`'s stored data shape and the pure operations on it: normalization,
 * validation, and derived-state checks that never touch `DurableObjectState`. Kept
 * separate from `caption-room.ts`'s orchestration (storage reads/writes, WebSocket
 * broadcast, journal archiving) so this half can be reasoned about - and in principle
 * tested - independent of the Durable Object runtime, the same split as
 * `src/live/output-buffer.ts` (pure engine) vs. `use-live-caption-session.ts` (stateful
 * wrapper) on the client side.
 */

export interface RemoteCommand {
  id: string;
  action: "pause" | "resume" | "clear";
  status: "pending" | "confirmed" | "failed";
  at: number;
}

/** A remote command the capture system has not acknowledged by then is reported unconfirmed so the phone unlocks. */
export const REMOTE_COMMAND_TIMEOUT_MS = 45_000;

export interface ArchiveEntry {
  id: string;
  startedAt: number;
  expiresAt: number;
  saved: boolean;
}

export interface ChannelConfiguration {
  sessionId?: string;
  /** Name written before sessionId; read by normalizeConfiguration and dropped on the next write. */
  serviceId?: string;
  saveHistory?: boolean;
  readerHash?: string;
  captionEpoch?: number;
  remoteHash?: string;
  /** Paired operator phones for this session, keyed by hashed Access identity. */
  remoteHashes?: Record<string, string>;
  /** Read-only workspace watchers for this session, keyed by hashed Access identity. */
  observers?: Record<string, string>;
  heartbeatAt?: number;
  remoteCommand?: RemoteCommand;
  tokenHash: string;
  encryptedToken: string;
  style: CaptionStyle;
  status: Exclude<ChannelStatus, "unconfigured">;
  lastSequence: number;
  sessionEventCount: number;
  /** Name written before sessionEventCount; read by normalizeConfiguration and dropped on the next write. */
  serviceEventCount?: number;
  transcriptionRequests: number;
  llmUsage: LlmSessionUsage;
  claimedTranscriptionAttempts: number[];
  claimedTranslationAttempts: number[];
  recordedTranslationAttempts: number[];
  inferenceAttemptFloor: number;
  translationRevision: number;
  lastTranslationRefreshRequestId?: string;
  controllerHash?: string;
  /** Access email of the operator who started the session, for the workspace rail. */
  controllerLabel?: string;
  viewerTokenHash?: string;
  startedAt?: number;
  expiresAt?: number;
}

export interface StartSessionRequest {
  readerHash?: string;
  saveHistory?: boolean;
  controllerHash: string;
  controllerLabel?: string;
  viewerTokenHash: string;
  style: CaptionStyle;
  takeover: boolean;
}

export interface TranslationAttemptRequest {
  controllerHash: string;
  transcriptionAttempt: number;
}

export interface RecordTranslationUsageRequest
  extends TranslationAttemptRequest,
    Pick<TranslationResult, "usage" | "rateLimit"> {}

export type MutationResult<T> =
  | { kind: "caption-cleared" }
  | { kind: "paused" }
  | { kind: "ok"; value: T; clear?: boolean; revokeViewers?: boolean }
  | { kind: "channel-not-configured" }
  | { kind: "channel-in-use"; expiresAt?: number }
  | { kind: "controller-replaced" }
  | { kind: "transcription-limit" }
  | { kind: "inference-attempt-used" }
  | { kind: "translation-session-refreshed"; translationRevision: number }
  | { kind: "inactive"; clear?: boolean }
  | { kind: "invalid" };

export type ViewerStreamEvent =
  | { type: "caption"; caption: PublicCaptionEvent }
  | { type: "clear" }
  | { type: "state"; status: ChannelStatus; expiresAt: string | null };

export const IDENTITY_KEY = /^operator:[a-f0-9]{64}$/u;

export function isActive(configuration: ChannelConfiguration) {
  return configuration.status === "live" || configuration.status === "paused";
}

export function normalizedAttempts(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((attempt): attempt is number =>
        Number.isSafeInteger(attempt) && attempt > 0 && attempt <= MAX_TRANSCRIPTION_REQUESTS,
      ))].slice(0, MAX_TRANSCRIPTION_REQUESTS)
    : [];
}

/**
 * Keeps at most `MAX_SESSION_OBSERVERS` credentials, one per hashed Access
 * identity. Insertion order is preserved, so the oldest identity is dropped
 * first once the cap is full.
 */
export function normalizedCredentialMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, hash]) =>
      IDENTITY_KEY.test(key) && typeof hash === "string" && HASH_HEX_PATTERN.test(hash))
    .slice(-MAX_SESSION_OBSERVERS) as [string, string][];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function withCredential(
  existing: Record<string, string> | undefined,
  identityKey: string,
  hash: string,
) {
  const next = { ...(existing ?? {}) };
  // Re-registering moves the identity to the end, so it is never evicted first.
  delete next[identityKey];
  next[identityKey] = hash;
  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SESSION_OBSERVERS))) {
    delete next[stale];
  }
  return next;
}

export function credentialMatches(map: Record<string, string> | undefined, hash: unknown) {
  return (
    typeof hash === "string" &&
    hash.length === 64 &&
    Object.values(map ?? {}).includes(hash)
  );
}

export function normalizeConfiguration(configuration: ChannelConfiguration) {
  const { serviceId, serviceEventCount, ...current } = configuration;
  return {
    ...current,
    sessionId: current.sessionId ?? serviceId,
    observers: normalizedCredentialMap(configuration.observers),
    remoteHashes: normalizedCredentialMap(configuration.remoteHashes),
    captionEpoch: normalizeTranslationRevision(configuration.captionEpoch),
    style: normalizeCaptionStyle(configuration.style ?? {}),
    status: ["idle", "live", "paused"].includes(configuration.status)
      ? configuration.status
      : "idle",
    lastSequence: Number.isSafeInteger(configuration.lastSequence)
      ? Math.max(0, configuration.lastSequence)
      : 0,
    sessionEventCount: Number.isSafeInteger(configuration.sessionEventCount)
      ? Math.max(0, configuration.sessionEventCount)
      : Number.isSafeInteger(serviceEventCount) ? Math.max(0, serviceEventCount!) : 0,
    transcriptionRequests: Number.isSafeInteger(configuration.transcriptionRequests)
      ? Math.max(0, configuration.transcriptionRequests)
      : 0,
    llmUsage: normalizeLlmSessionUsage(configuration.llmUsage),
    claimedTranscriptionAttempts: normalizedAttempts(configuration.claimedTranscriptionAttempts),
    inferenceAttemptFloor: Number.isSafeInteger(configuration.inferenceAttemptFloor)
      ? Math.max(0, configuration.inferenceAttemptFloor)
      // Pre-claim deployments cannot prove which older reservations already reached Groq.
      : Math.max(0, configuration.transcriptionRequests || 0),
    claimedTranslationAttempts: normalizedAttempts(configuration.claimedTranslationAttempts),
    recordedTranslationAttempts: normalizedAttempts(configuration.recordedTranslationAttempts),
    translationRevision: normalizeTranslationRevision(
      configuration.translationRevision,
    ),
  } satisfies ChannelConfiguration;
}

/** Reads a stored configuration with the pre-session field names mapped to the current ones. */
export function storedConfiguration(stored: ChannelConfiguration | undefined) {
  return stored ? normalizeConfiguration(stored) : undefined;
}

export function deactivate(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  current.status = "idle";
  current.sessionEventCount = 0;
  current.transcriptionRequests = 0;
  current.llmUsage = emptyLlmSessionUsage();
  current.claimedTranscriptionAttempts = [];
  current.inferenceAttemptFloor = 0;
  current.claimedTranslationAttempts = [];
  current.recordedTranslationAttempts = [];
  delete current.controllerHash;
  delete current.controllerLabel;
  delete current.viewerTokenHash;
  delete current.startedAt;
  delete current.expiresAt;
  delete current.lastTranslationRefreshRequestId;
  delete current.sessionId;
  delete current.readerHash;
  delete current.remoteHash;
  delete current.remoteHashes;
  delete current.observers;
  delete current.remoteCommand;
  delete current.heartbeatAt;
  delete current.saveHistory;
  return current;
}

export function sessionExpired(configuration: ChannelConfiguration) {
  return (
    isActive(configuration) &&
    typeof configuration.expiresAt === "number" &&
    configuration.expiresAt <= Date.now()
  );
}

export function controllerMatches(configuration: ChannelConfiguration, hash: unknown) {
  return (
    typeof hash === "string" &&
    hash.length === 64 &&
    hash === configuration.controllerHash
  );
}

export function websocketToken(request: Request, protocol: string) {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!protocols.includes(protocol)) return null;
  const token = protocols.find((value) => value !== protocol) ?? null;
  return token && CAPABILITY_TOKEN_PATTERN.test(token) ? token : null;
}

export function validCaptionBody(body: Partial<PublicCaptionRequest>) {
  return (
    typeof body.publicText === "string" &&
    body.publicText.length <= 2_000 &&
    typeof body.targetLanguage === "string" &&
    isLanguageLocale(body.targetLanguage) &&
    Number.isSafeInteger(body.translationRevision) &&
    Number(body.translationRevision) >= 0
  );
}

export function validTranslationAttemptBody<
  T extends Partial<TranslationAttemptRequest>,
>(body: T): body is T & TranslationAttemptRequest {
  return (
    typeof body.controllerHash === "string" &&
    body.controllerHash.length === 64 &&
    Number.isSafeInteger(body.transcriptionAttempt) &&
    Number(body.transcriptionAttempt) > 0 &&
    Number(body.transcriptionAttempt) <= MAX_TRANSCRIPTION_REQUESTS
  );
}

export function publicConfiguration(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  return {
    configured: true,
    serviceId: current.sessionId,
    saveHistory: current.saveHistory,
    controllerLabel: current.controllerLabel,
    encryptedToken: current.encryptedToken,
    status: current.status,
    style: current.style,
    startedAt: current.startedAt ?? null,
    expiresAt: current.expiresAt ?? null,
    lastSequence: current.lastSequence,
    transcriptionRequests: current.transcriptionRequests,
    llmUsage: current.llmUsage,
    translationRevision: current.translationRevision,
  };
}

export function viewerCaption(caption: PublicCaptionEvent) {
  return {
    sequence: caption.sequence,
    publicText: caption.publicText,
    targetLanguage: caption.targetLanguage,
    publishedAt: caption.publishedAt,
  };
}

/** Translates a `MutationResult`'s failure kinds into the matching HTTP error response. */
export function channelNotConfigured() {
  return json(
    { error: "Create the Main OBS channel first.", code: "channel_not_configured" },
    404,
  );
}

export function channelInUse(expiresAt?: number) {
  return json(
    {
      error: "The Main channel is already controlled by another operator.",
      code: "channel_in_use",
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    },
    409,
  );
}

export function controllerReplaced() {
  return json(
    {
      error: "Control of the Main channel moved to another operator.",
      code: "controller_replaced",
    },
    409,
  );
}

export function translationSessionRefreshed(translationRevision: number) {
  return json(
    {
      error:
        "The translation session was refreshed. Discard this caption and use the current translation settings.",
      code: "translation_session_refreshed",
      translationRevision,
    },
    409,
  );
}
