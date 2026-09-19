import type { LlmSessionUsage, TranslationResult } from "@/ai/contracts";
import {
  accumulateLlmSessionUsage,
  emptyLlmSessionUsage,
  normalizeLlmSessionUsage,
} from "@/ai/usage";
import { isLanguageLocale } from "@/domain/languages";
import {
  MAX_CAPTION_EVENTS,
  MAX_LIVE_SESSION_MS,
  MAX_MANUAL_CAPTION_CHARS,
  MAX_SERVICE_OBSERVERS,
  MAX_TRANSCRIPTION_REQUESTS,
  isLiveSessionControlAction,
  isTranslationRefreshRequestId,
  normalizeCaptionStyle,
  normalizeTranslationRevision,
  type CaptionStyle,
  type ChannelStatus,
  type LiveSessionControlRequest,
  type LiveSessionControlResponse,
  type PublicCaptionEvent,
  type PublicCaptionRequest,
} from "@/live/contracts";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";
import { rpc, type ExperienceEnvironment, type JournalState } from "@/experience/contracts";

interface RemoteCommand {
  id: string;
  action: "pause" | "resume" | "clear";
  status: "pending" | "confirmed" | "failed";
  at: number;
}
/** A remote command the capture computer has not acknowledged by then is reported unconfirmed so the phone unlocks. */
const REMOTE_COMMAND_TIMEOUT_MS = 45_000;
interface ArchiveEntry { id: string; startedAt: number; expiresAt: number; saved: boolean }

interface ChannelConfiguration {
  serviceId?: string;
  saveHistory?: boolean;
  readerHash?: string;
  captionEpoch?: number;
  remoteHash?: string;
  /** Paired operator phones for this service, keyed by hashed Access identity. */
  remoteHashes?: Record<string, string>;
  /** Read-only workspace watchers for this service, keyed by hashed Access identity. */
  observers?: Record<string, string>;
  heartbeatAt?: number;
  remoteCommand?: RemoteCommand;
  tokenHash: string;
  encryptedToken: string;
  style: CaptionStyle;
  status: Exclude<ChannelStatus, "unconfigured">;
  lastSequence: number;
  serviceEventCount: number;
  transcriptionRequests: number;
  llmUsage: LlmSessionUsage;
  claimedTranscriptionAttempts: number[];
  claimedTranslationAttempts: number[];
  recordedTranslationAttempts: number[];
  inferenceAttemptFloor: number;
  translationRevision: number;
  lastTranslationRefreshRequestId?: string;
  controllerHash?: string;
  /** Access email of the operator who started the service, for the workspace rail. */
  controllerLabel?: string;
  viewerTokenHash?: string;
  startedAt?: number;
  expiresAt?: number;
}

interface StartServiceRequest {
  readerHash?: string;
  saveHistory?: boolean;
  controllerHash: string;
  controllerLabel?: string;
  viewerTokenHash: string;
  style: CaptionStyle;
  takeover: boolean;
}

interface TranslationAttemptRequest {
  controllerHash: string;
  transcriptionAttempt: number;
}

interface RecordTranslationUsageRequest
  extends TranslationAttemptRequest,
    Pick<TranslationResult, "usage" | "rateLimit"> {}

type MutationResult<T> =
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

type ViewerStreamEvent =
  | { type: "caption"; caption: PublicCaptionEvent }
  | { type: "clear" }
  | { type: "state"; status: ChannelStatus; expiresAt: string | null };

const JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
};
const OVERLAY_PROTOCOL = "church-caption-v1";
const VIEWER_PROTOCOL = "church-caption-viewer-v1";
const OVERLAY_SOCKET_TAG = "overlay";
const VIEWER_SOCKET_TAG = "viewer";
const OBSERVER_SOCKET_TAG = "observer";
const MAX_VIEWER_CONNECTIONS = 250;
const MAX_OBSERVER_CONNECTIONS = 32;
const IDENTITY_KEY = /^operator:[a-f0-9]{64}$/u;
const CAPABILITY_TOKEN = /^[A-Za-z0-9_-]{43}$/;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function isActive(configuration: ChannelConfiguration) {
  return configuration.status === "live" || configuration.status === "paused";
}

function normalizedAttempts(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((attempt): attempt is number =>
        Number.isSafeInteger(attempt) && attempt > 0 && attempt <= MAX_TRANSCRIPTION_REQUESTS,
      ))].slice(0, MAX_TRANSCRIPTION_REQUESTS)
    : [];
}

/**
 * Keeps at most `MAX_SERVICE_OBSERVERS` credentials, one per hashed Access
 * identity. Insertion order is preserved, so the oldest identity is dropped
 * first when a ninth operator joins.
 */
function normalizedCredentialMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, hash]) =>
      IDENTITY_KEY.test(key) && typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash))
    .slice(-MAX_SERVICE_OBSERVERS) as [string, string][];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function withCredential(
  existing: Record<string, string> | undefined,
  identityKey: string,
  hash: string,
) {
  const next = { ...(existing ?? {}) };
  // Re-registering moves the identity to the end, so it is never evicted first.
  delete next[identityKey];
  next[identityKey] = hash;
  const keys = Object.keys(next);
  for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SERVICE_OBSERVERS))) {
    delete next[stale];
  }
  return next;
}

function credentialMatches(map: Record<string, string> | undefined, hash: unknown) {
  return (
    typeof hash === "string" &&
    hash.length === 64 &&
    Object.values(map ?? {}).includes(hash)
  );
}

function normalizeConfiguration(configuration: ChannelConfiguration) {
  return {
    ...configuration,
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
    serviceEventCount: Number.isSafeInteger(configuration.serviceEventCount)
      ? Math.max(0, configuration.serviceEventCount)
      : 0,
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

function deactivate(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  current.status = "idle";
  current.serviceEventCount = 0;
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
  delete current.serviceId;
  delete current.readerHash;
  delete current.remoteHash;
  delete current.remoteHashes;
  delete current.observers;
  delete current.remoteCommand;
  delete current.heartbeatAt;
  delete current.saveHistory;
  return current;
}

function serviceExpired(configuration: ChannelConfiguration) {
  return (
    isActive(configuration) &&
    typeof configuration.expiresAt === "number" &&
    configuration.expiresAt <= Date.now()
  );
}

function controllerMatches(configuration: ChannelConfiguration, hash: unknown) {
  return (
    typeof hash === "string" &&
    hash.length === 64 &&
    hash === configuration.controllerHash
  );
}

function websocketToken(request: Request, protocol: string) {
  const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!protocols.includes(protocol)) return null;
  const token = protocols.find((value) => value !== protocol) ?? null;
  return token && CAPABILITY_TOKEN.test(token) ? token : null;
}

function validCaptionBody(body: Partial<PublicCaptionRequest>) {
  return (
    typeof body.publicText === "string" &&
    body.publicText.length <= 2_000 &&
    typeof body.targetLanguage === "string" &&
    isLanguageLocale(body.targetLanguage) &&
    Number.isSafeInteger(body.translationRevision) &&
    Number(body.translationRevision) >= 0
  );
}

function validTranslationAttemptBody<
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

function publicConfiguration(configuration: ChannelConfiguration) {
  const current = normalizeConfiguration(configuration);
  return {
    configured: true,
    serviceId: current.serviceId,
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

function viewerCaption(caption: PublicCaptionEvent) {
  return {
    sequence: caption.sequence,
    publicText: caption.publicText,
    targetLanguage: caption.targetLanguage,
    publishedAt: caption.publishedAt,
  };
}

export class CaptionRoom {
  constructor(private readonly state: DurableObjectState, private readonly env?: ExperienceEnvironment) {}

  async fetch(request: Request) {
    if (!this.env?.SERMON_JOURNALS) return this.dispatch(request);
    return this.state.blockConcurrencyWhile(async () => {
      try { await this.flushJournals(); await this.reconcileJournalState(); }
      catch { return json({ error: "Service history is reconnecting. Retry shortly." }, 503); }
      const before = await this.state.storage.get<ChannelConfiguration>("configuration");
      const response = await this.dispatch(request);
      const after = await this.state.storage.get<ChannelConfiguration>("configuration");
      if (before?.serviceId && before.serviceId !== after?.serviceId) await this.queueJournal(before, true, Boolean(after?.serviceId));
      if (after?.serviceId && (before?.serviceId !== after.serviceId || before.captionEpoch !== after.captionEpoch ||
          before.status !== after.status || before.readerHash !== after.readerHash)) await this.queueJournal(after);
      try {
        await this.flushJournals();
        await this.state.storage.put("journal-configuration", after ?? null);
      }
      catch {
        if (after?.serviceId && before?.serviceId !== after.serviceId) {
          // The caller has not received its controller token. Release the failed start.
          await this.state.storage.put("configuration", deactivate(after));
          await this.state.storage.delete("latest");
          await this.queueJournal(after, true, true);
          this.broadcastPublic({ type: "clear" });
          this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
          this.closeViewerSockets(4002, "Live service could not start.");
        }
        return json({ error: "Service history is reconnecting. Retry shortly." }, 503);
      }
      return response;
    });
  }

  private async queueJournal(current: ChannelConfiguration, ended = false, revoked = false) {
    if (!this.env?.SERMON_JOURNALS || !current.serviceId || !current.readerHash) return;
    const archived = ended ? await this.state.storage.get<ArchiveEntry>(`archive:${current.serviceId}`) : undefined;
    const snapshot = {
      id: current.serviceId, startedAt: current.startedAt!, expiresAt: current.expiresAt!,
      saved: current.saveHistory === true, readerHash: current.readerHash,
      epoch: current.captionEpoch ?? 0, status: ended ? "ended" : current.status,
      ...(ended ? { endedAt: Math.min(Date.now(), current.expiresAt!, archived?.expiresAt ?? Infinity), revoked } : {}),
    } as JournalState;
    const pending = await this.state.storage.get<JournalState[]>("journal-sync") ?? [];
    await this.state.storage.put("journal-sync", [...pending.filter((item) => item.id !== snapshot.id), snapshot]);
    if (ended) await this.state.storage.put(`archive:${current.serviceId}`, {
      id: current.serviceId, startedAt: current.startedAt, expiresAt: snapshot.endedAt, saved: current.saveHistory,
    });
    await this.state.storage.setAlarm(Date.now() + 10_000);
  }

  private async flushJournals() {
    if (!this.env?.SERMON_JOURNALS) return;
    const pending = await this.state.storage.get<JournalState[]>("journal-sync") ?? [];
    for (const snapshot of pending) {
      const response = await rpc(this.env.SERMON_JOURNALS, snapshot.id, "/sync", snapshot);
      if (!response.ok && response.status !== 410) throw new Error("Sermon state synchronization failed.");
    }
    if (pending.length) await this.state.storage.delete("journal-sync");
  }

  private async reconcileJournalState() {
    const before = await this.state.storage.get<ChannelConfiguration>("journal-configuration");
    const after = await this.state.storage.get<ChannelConfiguration>("configuration");
    if (before?.serviceId && before.serviceId !== after?.serviceId) await this.queueJournal(before, true, Boolean(after?.serviceId));
    if (after?.serviceId && (before?.serviceId !== after.serviceId || before.captionEpoch !== after.captionEpoch ||
        before.status !== after.status || before.readerHash !== after.readerHash)) await this.queueJournal(after);
    await this.flushJournals();
    await this.state.storage.put("journal-configuration", after ?? null);
  }

  private async pruneArchives() {
    let after: string | undefined;
    let nextExpiry = Infinity;
    const kept: ArchiveEntry[] = [];
    do {
      const entries = await this.state.storage.list<ArchiveEntry>({ prefix: "archive:", limit: 500, startAfter: after });
      for (const [key, entry] of entries) {
        const expiry = entry.expiresAt + 7 * 86_400_000;
        if (expiry <= Date.now()) await this.state.storage.delete(key);
        else { nextExpiry = Math.min(nextExpiry, expiry); if (entry.saved) kept.push(entry); }
      }
      after = entries.size === 500 ? [...entries.keys()].at(-1) : undefined;
    } while (after);
    return { services: kept.sort((a, b) => b.startedAt - a.startedAt), nextExpiry };
  }

  private async experience(request: Request) {
    const action = new URL(request.url).pathname.split("/").at(-1);
    const body = await request.json() as { controllerHash?: string; remoteHash?: string; readerHash?: string;
      identityKey?: string; observerHash?: string;
      serviceId?: string; action?: "pause" | "resume" | "clear"; id?: string;
      capturing?: boolean; acknowledgement?: string; success?: boolean;
      transcriptionAttempt?: number; stage?: string; source?: unknown; sourceIds?: number[] };
    const stored = await this.expireServiceIfNeeded();
    if (!stored || !isActive(stored) || !stored.serviceId) return json({ error: "Service ended.", code: "service_inactive" }, 410);
    const current = normalizeConfiguration(stored);
    if (action === "remove-current") {
      if (body.serviceId !== current.serviceId) return json({ ignored: true });
      const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
      if (latest?.transcriptionAttempt && body.sourceIds?.includes(latest.transcriptionAttempt)) {
        current.captionEpoch = (current.captionEpoch ?? 0) + 1;
        await this.state.storage.put("configuration", current);
        await this.state.storage.delete("latest");
        this.broadcastPublic({ type: "clear" });
      }
      return json({ cleared: true });
    }
    if (action === "remote") {
      const paired = body.remoteHash === current.remoteHash ||
        credentialMatches(current.remoteHashes, body.remoteHash);
      if (body.serviceId !== current.serviceId || !body.remoteHash || !paired) return json({ error: "Remote pairing expired or replaced." }, 403);
      if (current.remoteCommand?.status === "pending" && Date.now() - current.remoteCommand.at > REMOTE_COMMAND_TIMEOUT_MS) {
        // Server-side effects (a pause, a clear) already applied; only the microphone acknowledgement is missing.
        const expired: RemoteCommand = { ...current.remoteCommand, status: "failed" };
        current.remoteCommand = expired;
        const history = await this.state.storage.get<RemoteCommand[]>("remote-history") ?? [];
        await this.state.storage.put("remote-history", history.map((item) => item.id === expired.id ? expired : item));
        await this.state.storage.put("configuration", current);
      }
      if (body.action) {
        if (!["pause", "resume", "clear"].includes(body.action) || !/^[a-zA-Z0-9-]{16,64}$/u.test(body.id ?? "")) return json({ error: "Invalid remote command." }, 400);
        const previous = await this.state.storage.get<RemoteCommand[]>("remote-history") ?? [];
        const duplicate = previous.find((command) => command.id === body.id);
        if (duplicate) return json({ command: duplicate, status: current.status, connected: Date.now() - (current.heartbeatAt ?? 0) < 15_000 });
        if (previous.length >= 1400) return json({ error: "Remote command limit reached. Pair the phone again." }, 429);
        if (current.remoteCommand?.status === "pending") return json({ error: "Wait for the pending command or reconnect the capture computer." }, 409);
        if (body.action === "resume" && Date.now() - (current.heartbeatAt ?? 0) >= 15_000) return json({ error: "Capture computer disconnected. Reconnect it before resuming." }, 409);
        if (body.action !== "resume") {
          current.captionEpoch = (current.captionEpoch ?? 0) + 1;
          if (body.action === "pause") {
            current.status = "paused";
            current.inferenceAttemptFloor = current.transcriptionRequests;
          }
          await this.state.storage.delete("latest");
          this.broadcastPublic({ type: "clear" });
          this.broadcastPublic({ type: "state", status: current.status, expiresAt: new Date(current.expiresAt!).toISOString() });
        }
        current.remoteCommand = { id: body.id!, action: body.action, status: "pending", at: Date.now() };
        await this.state.storage.put("remote-history", [...previous, current.remoteCommand]);
        await this.state.storage.put("configuration", current);
      }
      return json({ command: current.remoteCommand ?? null, status: current.status,
        connected: Date.now() - (current.heartbeatAt ?? 0) < 15_000 });
    }
    if (action === "observer") {
      if (!IDENTITY_KEY.test(body.identityKey ?? "") || !/^[a-f0-9]{64}$/u.test(body.observerHash ?? "")) {
        return json({ error: "Invalid watcher registration." }, 400);
      }
      current.observers = withCredential(current.observers, body.identityKey!, body.observerHash!);
      await this.state.storage.put("configuration", current);
      return json({
        serviceId: current.serviceId,
        saveHistory: current.saveHistory === true,
        controllerLabel: current.controllerLabel,
        status: current.status,
        startedAt: new Date(current.startedAt!).toISOString(),
        expiresAt: new Date(current.expiresAt!).toISOString(),
        translationRevision: current.translationRevision,
      });
    }
    if (action === "pair") {
      // Any workspace operator may pair a phone; each identity keeps its own remote.
      if (!IDENTITY_KEY.test(body.identityKey ?? "") || !/^[a-f0-9]{64}$/u.test(body.remoteHash ?? "")) {
        return json({ error: "Invalid pairing." }, 400);
      }
      current.remoteHashes = withCredential(current.remoteHashes, body.identityKey!, body.remoteHash!);
      // The single-remote credential from before per-identity pairing is retired here.
      delete current.remoteHash;
      await this.state.storage.put("configuration", current);
      return json({ serviceId: current.serviceId });
    }
    if (!controllerMatches(current, body.controllerHash)) return controllerReplaced();
    if (action === "reader-rotate") {
      if (!/^[a-f0-9]{64}$/u.test(body.readerHash ?? "")) return json({ error: "Invalid reader token." }, 400);
      current.readerHash = body.readerHash;
      await this.state.storage.put("configuration", current);
      return json({ serviceId: current.serviceId });
    }
    if (action === "host") {
      current.heartbeatAt = Date.now();
      if (body.acknowledgement && current.remoteCommand?.id === body.acknowledgement) {
        const command = current.remoteCommand;
        const matched = command.action === "pause" ? current.status === "paused" && body.capturing === false
          : command.action === "resume" ? current.status === "live" && body.capturing === true : true;
        command.status = body.success && matched ? "confirmed" : "failed";
        const history = await this.state.storage.get<RemoteCommand[]>("remote-history") ?? [];
        await this.state.storage.put("remote-history", history.map((item) => item.id === command.id ? command : item));
      }
      await this.state.storage.put("configuration", current);
      return json({ status: current.status, command: current.remoteCommand ?? null, epoch: current.captionEpoch });
    }
    if (action === "context") {
      const attempt = body.transcriptionAttempt;
      if (!Number.isSafeInteger(attempt) || !["transcription", "translation"].includes(body.stage ?? "") ||
          !(body.stage === "transcription" ? current.claimedTranscriptionAttempts : current.claimedTranslationAttempts).includes(attempt!)) return json({ error: "Inference attempt was not claimed." }, 403);
      if (current.status !== "live") return json({ error: "Service paused.", code: "service_paused" }, 409);
      return json({ serviceId: current.serviceId });
    }
    if (action === "source" && this.env?.SERMON_JOURNALS) {
      const source = body.source as { id?: number; translationRevision?: number } | undefined;
      if (!source || !current.claimedTranscriptionAttempts.includes(source.id!) ||
          source.id! <= current.inferenceAttemptFloor || source.translationRevision !== current.translationRevision) return json({ error: "Source attempt is no longer current." }, 409);
      return rpc(this.env.SERMON_JOURNALS, current.serviceId!, "/source", source);
    }
    if (action === "gap" && this.env?.SERMON_JOURNALS) return rpc(this.env.SERMON_JOURNALS, current.serviceId!, "/gap", {});
    return json({ error: "Unknown service action." }, 404);
  }

  private async dispatch(request: Request) {
    const url = new URL(request.url);

    if (url.pathname === "/internal/history" && request.method === "GET") {
      return json({ services: (await this.pruneArchives()).services });
    }
    if (url.pathname === "/internal/history/delete" && request.method === "POST") {
      const { id } = await request.json() as { id: string };
      if (!/^[a-f0-9-]{36}$/u.test(id)) return json({ error: "Invalid archive." }, 400);
      const current = await this.state.storage.get<ChannelConfiguration>("configuration");
      if (current?.serviceId === id && isActive(current) && !serviceExpired(current)) return json({ error: "End the service first." }, 409);
      await this.state.storage.delete(`archive:${id}`);
      return json({ deleted: true });
    }

    if (url.pathname.startsWith("/internal/experience/") && request.method === "POST") return this.experience(request);

    if (url.pathname === "/internal/channel" && request.method === "GET") {
      return this.getChannel();
    }
    if (url.pathname === "/internal/channel" && request.method === "POST") {
      return this.createChannel(request);
    }
    if (url.pathname === "/internal/rotate" && request.method === "POST") {
      return this.rotateChannel(request);
    }
    if (url.pathname === "/internal/connect" && request.method === "GET") {
      return this.connectOverlay(request);
    }
    if (
      url.pathname === "/internal/viewer/connect" &&
      request.method === "GET"
    ) {
      return this.connectViewer(request);
    }
    if (
      url.pathname === "/internal/viewer/rotate" &&
      request.method === "POST"
    ) {
      return this.replaceViewerLink(request);
    }
    if (url.pathname === "/internal/service" && request.method === "POST") {
      return this.startService(request);
    }
    if (url.pathname === "/internal/service" && request.method === "DELETE") {
      return this.endService(request);
    }
    if (url.pathname === "/internal/lease" && request.method === "POST") {
      return this.reserveTranscriptionAttempt(request);
    }
    if (
      url.pathname === "/internal/translation/claim" &&
      request.method === "POST"
    ) {
      return this.claimInferenceAttempt(request, "translation");
    }
    if (url.pathname === "/internal/transcription/claim" && request.method === "POST") {
      return this.claimInferenceAttempt(request, "transcription");
    }
    if (url.pathname === "/internal/usage" && request.method === "POST") {
      return this.recordTranslationUsage(request);
    }
    if (url.pathname === "/internal/caption" && request.method === "POST") {
      return this.publishCaption(request);
    }
    if (url.pathname === "/internal/style" && request.method === "POST") {
      return this.updateStyle(request);
    }
    if (url.pathname === "/internal/control" && request.method === "POST") {
      return this.controlService(request);
    }

    return json({ error: "Live-channel route not found." }, 404);
  }

  private async getChannel() {
    const configuration = await this.expireServiceIfNeeded();
    return configuration
      ? json(publicConfiguration(configuration))
      : json({ configured: false, status: "unconfigured" });
  }

  private async createChannel(request: Request) {
    const body = (await request.json()) as Partial<ChannelConfiguration>;
    if (
      typeof body.tokenHash !== "string" ||
      body.tokenHash.length !== 64 ||
      typeof body.encryptedToken !== "string" ||
      !body.encryptedToken
    ) {
      return json({ error: "Invalid OBS channel configuration." }, 400);
    }

    const configuration = await this.state.storage.transaction(
      async (transaction) => {
        const existing = await transaction.get<ChannelConfiguration>("configuration");
        if (existing) return normalizeConfiguration(existing);
        const created: ChannelConfiguration = {
          tokenHash: body.tokenHash!,
          encryptedToken: body.encryptedToken!,
          style: normalizeCaptionStyle(body.style ?? {}),
          status: "idle",
          lastSequence: 0,
          serviceEventCount: 0,
          transcriptionRequests: 0,
          llmUsage: emptyLlmSessionUsage(),
          claimedTranscriptionAttempts: [],
          inferenceAttemptFloor: 0,
          claimedTranslationAttempts: [],
          recordedTranslationAttempts: [],
          translationRevision: 0,
        };
        await transaction.put("configuration", created);
        return created;
      },
    );
    return json(publicConfiguration(configuration), 201);
  }

  private async rotateChannel(request: Request) {
    const body = (await request.json()) as Partial<ChannelConfiguration>;
    if (
      typeof body.tokenHash !== "string" ||
      body.tokenHash.length !== 64 ||
      typeof body.encryptedToken !== "string" ||
      !body.encryptedToken
    ) {
      return json({ error: "Invalid OBS channel credential." }, 400);
    }

    const result = await this.state.storage.transaction<
      MutationResult<ChannelConfiguration>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) configuration = deactivate(configuration);
      if (isActive(configuration)) {
        return { kind: "channel-in-use", expiresAt: configuration.expiresAt };
      }
      configuration.tokenHash = body.tokenHash!;
      configuration.encryptedToken = body.encryptedToken!;
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return { kind: "ok", value: configuration, clear: true };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "channel-in-use") return channelInUse(result.expiresAt);
    if (result.kind !== "ok") return json({ error: "OBS channel rotation failed." }, 500);

    this.broadcastOverlay({ type: "clear" });
    this.closeViewerSockets(4002, "Live service ended.");
    for (const socket of this.state.getWebSockets(OVERLAY_SOCKET_TAG)) {
      socket.close(4001, "OBS channel link rotated.");
    }
    return json(publicConfiguration(result.value));
  }

  private async connectOverlay(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const token = websocketToken(request, OVERLAY_PROTOCOL);
    const configuration = await this.expireServiceIfNeeded();
    if (
      !token ||
      !configuration ||
      (await captionTokenHash(token)) !== configuration.tokenHash
    ) {
      return json(
        { error: "The OBS channel link is invalid.", code: "invalid_overlay_key" },
        401,
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [OVERLAY_SOCKET_TAG]);
    server.serializeAttachment({ role: OVERLAY_SOCKET_TAG });
    const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
    server.send(
      JSON.stringify({
        type: "ready",
        status: configuration.status,
        expiresAt: configuration.expiresAt
          ? new Date(configuration.expiresAt).toISOString()
          : null,
        caption: latest ?? null,
        style: latest?.style ?? configuration.style,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": OVERLAY_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async connectViewer(request: Request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "A WebSocket upgrade is required." }, 426);
    }
    const token = websocketToken(request, VIEWER_PROTOCOL);
    const configuration = await this.expireServiceIfNeeded();
    const hash = token ? await captionTokenHash(token) : null;
    const observer = Boolean(
      hash &&
        configuration &&
        isActive(configuration) &&
        credentialMatches(configuration.observers, hash),
    );
    if (
      !hash ||
      !configuration ||
      !isActive(configuration) ||
      (!observer &&
        (!configuration.viewerTokenHash || hash !== configuration.viewerTokenHash))
    ) {
      return json(
        {
          error: "The mobile viewer link is invalid or expired.",
          code: "invalid_viewer_key",
        },
        401,
      );
    }
    const tag = observer ? OBSERVER_SOCKET_TAG : VIEWER_SOCKET_TAG;
    if (
      this.state.getWebSockets(tag).length >=
      (observer ? MAX_OBSERVER_CONNECTIONS : MAX_VIEWER_CONNECTIONS)
    ) {
      return json(
        { error: observer ? "The workspace watchers are at capacity." : "The mobile viewer is at capacity." },
        503,
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [tag]);
    server.serializeAttachment({ role: tag });
    const latest = await this.state.storage.get<PublicCaptionEvent>("latest");
    server.send(
      JSON.stringify({
        type: "ready",
        status: configuration.status,
        caption: latest ? viewerCaption(latest) : null,
      }),
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "sec-websocket-protocol": VIEWER_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async startService(request: Request) {
    const body = (await request.json()) as Partial<StartServiceRequest>;
    if (
      typeof body.controllerHash !== "string" ||
      body.controllerHash.length !== 64 ||
      typeof body.viewerTokenHash !== "string" ||
      body.viewerTokenHash.length !== 64 ||
      typeof body.takeover !== "boolean"
    ) {
      return json({ error: "Invalid live-service configuration." }, 400);
    }

    const result = await this.state.storage.transaction<
      MutationResult<ChannelConfiguration>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) configuration = deactivate(configuration);
      if (isActive(configuration) && !body.takeover) {
        return { kind: "channel-in-use", expiresAt: configuration.expiresAt };
      }

      const startedAt = Date.now();
      configuration.status = "live";
      configuration.serviceId = crypto.randomUUID();
      configuration.saveHistory = body.saveHistory === true;
      configuration.readerHash = body.readerHash;
      configuration.captionEpoch = 0;
      delete configuration.remoteHash;
      delete configuration.remoteHashes;
      delete configuration.observers;
      delete configuration.remoteCommand;
      delete configuration.heartbeatAt;
      configuration.controllerHash = body.controllerHash!;
      if (typeof body.controllerLabel === "string" && body.controllerLabel.trim()) {
        configuration.controllerLabel = body.controllerLabel.trim().slice(0, 120);
      } else delete configuration.controllerLabel;
      configuration.viewerTokenHash = body.viewerTokenHash!;
      configuration.startedAt = startedAt;
      configuration.expiresAt = startedAt + MAX_LIVE_SESSION_MS;
      configuration.serviceEventCount = 0;
      configuration.transcriptionRequests = 0;
      configuration.llmUsage = emptyLlmSessionUsage();
      configuration.claimedTranscriptionAttempts = [];
      configuration.inferenceAttemptFloor = 0;
      configuration.claimedTranslationAttempts = [];
      configuration.recordedTranslationAttempts = [];
      configuration.translationRevision += 1;
      delete configuration.lastTranslationRefreshRequestId;
      configuration.style = normalizeCaptionStyle(body.style ?? configuration.style);
      await transaction.put(`archive:${configuration.serviceId}`, {
        id: configuration.serviceId, startedAt, expiresAt: configuration.expiresAt,
        saved: configuration.saveHistory,
      });
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
        // Remote command IDs and their 1,400 ceiling are scoped to one service.
        transaction.delete("remote-history"),
      ]);
      return { kind: "ok", value: configuration, clear: true };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "channel-in-use") return channelInUse(result.expiresAt);
    if (result.kind !== "ok") return json({ error: "Live service could not start." }, 500);

    await this.state.storage.setAlarm(result.value.expiresAt!);
    // A new service invalidates every earlier audience link and watcher credential.
    this.closeViewerSockets(4003, "Mobile viewer link replaced.");
    this.broadcastPublic({ type: "clear" });
    this.broadcastPublic({
      type: "state",
      status: "live",
      expiresAt: new Date(result.value.expiresAt!).toISOString(),
    });
    this.broadcastOverlay({ type: "style", style: result.value.style });
    return json({
      status: result.value.status,
      serviceId: result.value.serviceId,
      saveHistory: result.value.saveHistory,
      startedAt: new Date(result.value.startedAt!).toISOString(),
      expiresAt: new Date(result.value.expiresAt!).toISOString(),
      translationRevision: result.value.translationRevision,
    });
  }

  private async replaceViewerLink(request: Request) {
    const body = (await request.json()) as {
      controllerHash?: string;
      viewerTokenHash?: string;
    };
    if (
      typeof body.viewerTokenHash !== "string" ||
      body.viewerTokenHash.length !== 64
    ) {
      return json({ error: "Invalid mobile viewer credential." }, 400);
    }

    const result = await this.state.storage.transaction<
      MutationResult<{ expiresAt: string }>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      const expired = serviceExpired(configuration);
      if (expired) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "inactive", clear: true };
      }
      if (!isActive(configuration)) return { kind: "inactive" };
      if (!controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      configuration.viewerTokenHash = body.viewerTokenHash!;
      await transaction.put("configuration", configuration);
      return {
        kind: "ok",
        value: {
          expiresAt: new Date(configuration.expiresAt!).toISOString(),
        },
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind !== "ok") {
      return json({ error: "The mobile viewer link could not be replaced." }, 500);
    }

    this.closeViewerSockets(4003, "Mobile viewer link replaced.", false);
    return json({ replaced: true, expiresAt: result.value.expiresAt });
  }

  private async endService(request: Request) {
    const body = (await request.json()) as { controllerHash?: string };
    const result = await this.state.storage.transaction<MutationResult<null>>(
      async (transaction) => {
        const stored = await transaction.get<ChannelConfiguration>("configuration");
        if (!stored) return { kind: "channel-not-configured" };
        let configuration = normalizeConfiguration(stored);
        if (serviceExpired(configuration)) configuration = deactivate(configuration);
        if (!isActive(configuration)) {
          await Promise.all([
            transaction.put("configuration", configuration),
            transaction.delete("latest"),
          ]);
          return { kind: "ok", value: null, clear: true };
        }
        if (!controllerMatches(configuration, body.controllerHash)) {
          return { kind: "controller-replaced" };
        }
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "ok", value: null, clear: true };
      },
    );

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    await this.state.storage.deleteAlarm();
    this.broadcastPublic({ type: "clear" });
    this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
    this.closeViewerSockets(4002, "Live service ended.");
    return new Response(null, { status: 204 });
  }

  private async publishCaption(request: Request) {
    const body = (await request.json()) as Partial<PublicCaptionRequest> & {
      controllerHash?: string;
    };
    const result = await this.state.storage.transaction<
      MutationResult<PublicCaptionEvent>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      const expired = serviceExpired(configuration);
      if (expired) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "inactive", clear: true };
      }
      if (!isActive(configuration)) return { kind: "inactive" };
      if (!controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      if (configuration.status !== "live") return { kind: "paused" };
      if (!validCaptionBody(body)) {
        return { kind: "invalid" };
      }
      if (body.translationRevision !== configuration.translationRevision) {
        return {
          kind: "translation-session-refreshed",
          translationRevision: configuration.translationRevision,
        };
      }
      if ((body.captionEpoch ?? 0) !== configuration.captionEpoch) return { kind: "caption-cleared" };
      if (configuration.serviceEventCount >= MAX_CAPTION_EVENTS) {
        return { kind: "invalid" };
      }

      const event: PublicCaptionEvent = {
        captionEpoch: configuration.captionEpoch,
        transcriptionAttempt: body.transcriptionAttempt,
        sequence: configuration.lastSequence + 1,
        publicText: body.publicText!,
        targetLanguage: body.targetLanguage!,
        style: normalizeCaptionStyle(body.style ?? configuration.style),
        translationRevision: body.translationRevision!,
        publishedAt: new Date().toISOString(),
      };
      configuration.lastSequence = event.sequence;
      configuration.serviceEventCount += 1;
      configuration.style = event.style;
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.put("latest", event),
      ]);
      return { kind: "ok", value: event };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "caption-cleared") return json({ error: "Caption predates Clear. Discard it.", code: "caption_cleared" }, 409);
    if (result.kind === "paused") return json({ error: "Service paused.", code: "service_paused" }, 409);
    if (result.kind === "translation-session-refreshed") {
      return translationSessionRefreshed(result.translationRevision);
    }
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is not accepting captions." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "Invalid public caption or service event limit reached." }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "The public caption could not be published." }, 500);
    }

    this.broadcastPublic({ type: "caption", caption: result.value });
    const current = await this.state.storage.get<ChannelConfiguration>("configuration");
    if (this.env?.SERMON_JOURNALS && current?.serviceId && body.reader && body.transcriptionAttempt) {
      try {
        const recorded = await rpc(this.env.SERMON_JOURNALS, current.serviceId, "/append", {
          ...body.reader, id: body.transcriptionAttempt, publicText: result.value.publicText,
          targetLanguage: result.value.targetLanguage, epoch: result.value.captionEpoch,
          translationRevision: result.value.translationRevision,
        });
        if (!recorded.ok) throw new Error("Reader append failed.");
      } catch {
        return json({ published: true, sequence: result.value.sequence, historyIncomplete: true });
      }
    }
    return json({
      published: true,
      sequence: result.value.sequence,
      translationRevision: result.value.translationRevision,
    });
  }

  private async reserveTranscriptionAttempt(request: Request) {
    const body = (await request.json()) as { controllerHash?: string };
    const result = await this.state.storage.transaction<
      MutationResult<{
        status: "live";
        expiresAt: string;
        transcriptionRequests: number;
        translationRevision: number;
        captionEpoch: number;
      }>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "inactive", clear: true };
      }
      if (!isActive(configuration)) return { kind: "inactive" };
      if (!controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      if (configuration.status !== "live") return { kind: "paused" };
      if (configuration.transcriptionRequests >= MAX_TRANSCRIPTION_REQUESTS) {
        return { kind: "transcription-limit" };
      }
      configuration.transcriptionRequests += 1;
      await transaction.put("configuration", configuration);
      return {
        kind: "ok",
        value: {
          status: "live",
          expiresAt: new Date(configuration.expiresAt!).toISOString(),
          transcriptionRequests: configuration.transcriptionRequests,
          translationRevision: configuration.translationRevision,
          captionEpoch: configuration.captionEpoch ?? 0,
        },
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "transcription-limit") {
      return json(
        {
          error: `The ${MAX_TRANSCRIPTION_REQUESTS}-request service limit has been reached.`,
          code: "transcription_limit_reached",
        },
        429,
      );
    }
    if (result.kind === "paused") return json({ error: "Service paused.", code: "service_paused" }, 409);
    if (result.kind !== "ok") {
      return json({ error: "Transcription reservation failed." }, 500);
    }
    return json({ valid: true, ...result.value });
  }

  private async claimInferenceAttempt(request: Request, stage: "transcription" | "translation") {
    const body = (await request.json()) as Partial<TranslationAttemptRequest>;
    if (!validTranslationAttemptBody(body)) {
      return json({ error: "Invalid inference attempt.", code: `invalid_${stage}_attempt` }, 400);
    }
    const transcriptionAttempt = body.transcriptionAttempt;

    const result = await this.state.storage.transaction<MutationResult<null>>(
      async (transaction) => {
        const stored = await transaction.get<ChannelConfiguration>("configuration");
        if (!stored) return { kind: "channel-not-configured" };
        let configuration = normalizeConfiguration(stored);
        if (serviceExpired(configuration)) {
          configuration = deactivate(configuration);
          await Promise.all([
            transaction.put("configuration", configuration),
            transaction.delete("latest"),
          ]);
          return { kind: "inactive", clear: true };
        }
        if (!isActive(configuration)) {
          return { kind: "inactive" };
        }
        if (!controllerMatches(configuration, body.controllerHash)) {
          return { kind: "controller-replaced" };
        }
        if (configuration.status !== "live") return { kind: "paused" };
        if (transcriptionAttempt > configuration.transcriptionRequests || transcriptionAttempt <= configuration.inferenceAttemptFloor) {
          return { kind: "invalid" };
        }
        const attempts = stage === "transcription"
          ? configuration.claimedTranscriptionAttempts
          : configuration.claimedTranslationAttempts;
        if (attempts.includes(transcriptionAttempt)) {
          return { kind: "inference-attempt-used" };
        }
        attempts.push(transcriptionAttempt);
        await transaction.put("configuration", configuration);
        return { kind: "ok", value: null };
      },
    );

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is not accepting inference.", code: "service_inactive" }, 410);
    }
    if (result.kind === "inference-attempt-used") {
      return json(
        {
          error: `This reserved attempt already requested ${stage}.`,
          code: `${stage}_attempt_used`,
        },
        409,
      );
    }
    if (result.kind === "paused") return json({ error: "Service paused.", code: "service_paused" }, 409);
    if (result.kind === "invalid") {
      return json({ error: "Inference does not match a current reserved attempt.", code: `invalid_${stage}_attempt` }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "Inference authorization failed." }, 500);
    }
    return json({ claimed: true });
  }

  private async recordTranslationUsage(request: Request) {
    const body = (await request.json()) as Partial<RecordTranslationUsageRequest>;
    if (!validTranslationAttemptBody(body)) {
      return json({ error: "Invalid translation usage record." }, 400);
    }
    const transcriptionAttempt = body.transcriptionAttempt;

    const result = await this.state.storage.transaction<
      MutationResult<LlmSessionUsage>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      if (serviceExpired(configuration)) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return { kind: "inactive", clear: true };
      }
      if (!isActive(configuration)) return { kind: "inactive" };
      if (!controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }
      if (
        transcriptionAttempt > configuration.transcriptionRequests ||
        !configuration.claimedTranslationAttempts.includes(
          transcriptionAttempt,
        )
      ) {
        return { kind: "invalid" };
      }
      if (configuration.recordedTranslationAttempts.includes(transcriptionAttempt)) {
        return { kind: "ok", value: configuration.llmUsage };
      }

      configuration.llmUsage = accumulateLlmSessionUsage(
        configuration.llmUsage,
        {
          usage: body.usage,
          rateLimit: body.rateLimit,
        },
      );
      configuration.recordedTranslationAttempts.push(transcriptionAttempt);
      await transaction.put("configuration", configuration);
      return { kind: "ok", value: configuration.llmUsage };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "Translation usage does not match this service." }, 400);
    }
    if (result.kind !== "ok") {
      return json({ error: "Translation usage could not be recorded." }, 500);
    }
    return json({ recorded: true, llmUsage: result.value });
  }

  private async controlService(request: Request) {
    const body = (await request.json()) as Partial<LiveSessionControlRequest> & {
      controllerHash?: string;
    };
    if (!isLiveSessionControlAction(body.action)) {
      return json({ error: "Invalid live-service control." }, 400);
    }
    const action = body.action;

    const result = await this.state.storage.transaction<
      MutationResult<LiveSessionControlResponse & { caption?: PublicCaptionEvent }>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      const expired = serviceExpired(configuration);
      if (expired) {
        configuration = deactivate(configuration);
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
      }

      const active = isActive(configuration);
      if (active && !controllerMatches(configuration, body.controllerHash)) {
        return { kind: "controller-replaced" };
      }

      if (action === "refresh-translation") {
        if (!active) {
          return expired
            ? { kind: "inactive", clear: true }
            : { kind: "invalid" };
        }
        if (
          !Number.isSafeInteger(body.expectedTranslationRevision) ||
          Number(body.expectedTranslationRevision) < 0 ||
          !isTranslationRefreshRequestId(body.refreshRequestId)
        ) {
          return { kind: "invalid" };
        }
        const expectedTranslationRevision = Number(
          body.expectedTranslationRevision,
        );
        if (
          expectedTranslationRevision ===
            configuration.translationRevision - 1 &&
          body.refreshRequestId ===
            configuration.lastTranslationRefreshRequestId
        ) {
          return {
            kind: "ok",
            value: {
              action,
              status: configuration.status,
              translationRevision: configuration.translationRevision,
            },
          };
        }
        if (
          expectedTranslationRevision !== configuration.translationRevision
        ) {
          return {
            kind: "translation-session-refreshed",
            translationRevision: configuration.translationRevision,
          };
        }
        configuration.translationRevision += 1;
        configuration.captionEpoch = (configuration.captionEpoch ?? 0) + 1;
        configuration.inferenceAttemptFloor = configuration.transcriptionRequests;
        configuration.lastTranslationRefreshRequestId = body.refreshRequestId;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.delete("latest"),
        ]);
        return {
          kind: "ok",
          value: {
            action,
            status: configuration.status,
            translationRevision: configuration.translationRevision,
          },
          clear: true,
        };
      }

      if (action === "show-test") {
        if (configuration.status === "live") return { kind: "invalid" };
        if (!body.targetLanguage || !isLanguageLocale(body.targetLanguage)) {
          return { kind: "invalid" };
        }
        const style = normalizeCaptionStyle(body.style ?? configuration.style);
        const caption: PublicCaptionEvent = {
          sequence: configuration.lastSequence + 1,
          publicText: SAMPLE_CAPTIONS[body.targetLanguage],
          targetLanguage: body.targetLanguage,
          style,
          translationRevision: configuration.translationRevision,
          publishedAt: new Date().toISOString(),
        };
        configuration.lastSequence = caption.sequence;
        configuration.style = style;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.put("latest", caption),
        ]);
        return {
          kind: "ok",
          value: {
            action,
            status: configuration.status,
            translationRevision: configuration.translationRevision,
            sequence: caption.sequence,
            caption,
          },
          revokeViewers: expired,
        };
      }

      if (action === "manual") {
        if (configuration.status !== "paused") return { kind: "invalid" };
        if (!body.targetLanguage || !isLanguageLocale(body.targetLanguage)) {
          return { kind: "invalid" };
        }
        const manualText =
          typeof body.manualText === "string" ? body.manualText.trim() : "";
        if (!manualText || manualText.length > MAX_MANUAL_CAPTION_CHARS) {
          return { kind: "invalid" };
        }
        const style = normalizeCaptionStyle(body.style ?? configuration.style);
        const caption: PublicCaptionEvent = {
          sequence: configuration.lastSequence + 1,
          publicText: manualText,
          targetLanguage: body.targetLanguage,
          style,
          translationRevision: configuration.translationRevision,
          publishedAt: new Date().toISOString(),
        };
        configuration.lastSequence = caption.sequence;
        configuration.style = style;
        await Promise.all([
          transaction.put("configuration", configuration),
          transaction.put("latest", caption),
        ]);
        return {
          kind: "ok",
          value: {
            action,
            status: configuration.status,
            translationRevision: configuration.translationRevision,
            sequence: caption.sequence,
            caption,
          },
        };
      }

      if (action === "pause") {
        if (configuration.status !== "live" && configuration.status !== "paused") {
          return expired
            ? { kind: "inactive", clear: true }
            : { kind: "invalid" };
        }
        configuration.status = "paused";
        configuration.inferenceAttemptFloor = configuration.transcriptionRequests;
      } else if (action === "resume") {
        if (configuration.status !== "paused" && configuration.status !== "live") {
          return expired
            ? { kind: "inactive", clear: true }
            : { kind: "invalid" };
        }
        configuration.status = "live";
      }

      configuration.captionEpoch = (configuration.captionEpoch ?? 0) + 1;

      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return {
        kind: "ok",
        value: {
          action,
          status: configuration.status,
          translationRevision: configuration.translationRevision,
        },
        clear: true,
        revokeViewers: expired,
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind === "translation-session-refreshed") {
      return translationSessionRefreshed(result.translationRevision);
    }
    if (result.kind === "inactive") {
      if (result.clear) {
        this.broadcastPublic({ type: "clear" });
        this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
        this.closeViewerSockets(4002, "Live service ended.");
      }
      return json({ error: "The live service is no longer active." }, 410);
    }
    if (result.kind === "invalid") {
      return json({ error: "The control is not available in the current channel state." }, 409);
    }
    if (result.kind !== "ok") {
      return json({ error: "The live-service control failed." }, 500);
    }

    if (result.clear) this.broadcastPublic({ type: "clear" });
    const caption = result.value.caption;
    if (caption) {
      if (result.value.status === "paused") {
        this.broadcastPublic({ type: "caption", caption });
      } else {
        this.broadcastOverlay({ type: "caption", caption });
      }
    }
    let historyIncomplete: boolean | undefined;
    if (action === "manual" && caption && this.env?.SERMON_JOURNALS) {
      const current = await this.state.storage.get<ChannelConfiguration>("configuration");
      if (current?.serviceId) {
        try {
          const recorded = await rpc(this.env.SERMON_JOURNALS, current.serviceId, "/note", {
            id: caption.sequence,
            text: caption.publicText,
            targetLanguage: caption.targetLanguage,
          });
          if (!recorded.ok) throw new Error("Note append failed.");
        } catch {
          historyIncomplete = true;
        }
      }
    }
    if (action === "pause" || action === "resume") {
      this.broadcastPublic({
        type: "state",
        status: result.value.status,
        expiresAt: null,
      });
    }
    if (result.revokeViewers) {
      this.closeViewerSockets(4002, "Live service ended.");
    }
    const { caption: omitted, ...response } = result.value;
    void omitted;
    return json(historyIncomplete ? { ...response, historyIncomplete } : response);
  }

  private async updateStyle(request: Request) {
    const body = (await request.json()) as {
      style?: Partial<CaptionStyle>;
      controllerHash?: string;
    };
    const style = normalizeCaptionStyle(body.style ?? {});
    const result = await this.state.storage.transaction<
      MutationResult<CaptionStyle>
    >(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { kind: "channel-not-configured" };
      let configuration = normalizeConfiguration(stored);
      const expired = serviceExpired(configuration);
      if (expired) configuration = deactivate(configuration);
      if (
        isActive(configuration) &&
        !controllerMatches(configuration, body.controllerHash)
      ) {
        return { kind: "controller-replaced" };
      }
      configuration.style = style;
      const latest = expired
        ? undefined
        : await transaction.get<PublicCaptionEvent>("latest");
      await transaction.put("configuration", configuration);
      if (expired) {
        await transaction.delete("latest");
      } else if (latest) {
        latest.style = style;
        await transaction.put("latest", latest);
      }
      return {
        kind: "ok",
        value: style,
        clear: expired,
        revokeViewers: expired,
      };
    });

    if (result.kind === "channel-not-configured") return channelNotConfigured();
    if (result.kind === "controller-replaced") return controllerReplaced();
    if (result.kind !== "ok") return json({ error: "Caption style update failed." }, 500);
    if (result.clear) {
      this.broadcastPublic({ type: "clear" });
      this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
    }
    if (result.revokeViewers) {
      this.closeViewerSockets(4002, "Live service ended.");
    }
    this.broadcastOverlay({ type: "style", style: result.value });
    return json({ updated: true, style: result.value });
  }

  private async expireServiceIfNeeded() {
    const result = await this.state.storage.transaction<{
      configuration?: ChannelConfiguration;
      expired: boolean;
    }>(async (transaction) => {
      const stored = await transaction.get<ChannelConfiguration>("configuration");
      if (!stored) return { expired: false };
      let configuration = normalizeConfiguration(stored);
      if (!serviceExpired(configuration)) {
        if (stored.translationRevision !== configuration.translationRevision) {
          await transaction.put("configuration", configuration);
        }
        return { configuration, expired: false };
      }
      configuration = deactivate(configuration);
      await Promise.all([
        transaction.put("configuration", configuration),
        transaction.delete("latest"),
      ]);
      return { configuration, expired: true };
    });
    if (result.expired) {
      this.broadcastPublic({ type: "clear" });
      this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
      this.closeViewerSockets(4002, "Live service ended.");
    }
    return result.configuration;
  }

  private broadcastOverlay(payload: unknown) {
    const message = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets(OVERLAY_SOCKET_TAG)) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Overlay connection failed.");
      }
    }
  }

  private broadcastViewer(payload: ViewerStreamEvent) {
    const viewerPayload =
      payload.type === "caption"
        ? { type: "caption", caption: viewerCaption(payload.caption) }
        : payload;
    const message = JSON.stringify(viewerPayload);
    const sockets = [
      ...this.state.getWebSockets(VIEWER_SOCKET_TAG),
      ...this.state.getWebSockets(OBSERVER_SOCKET_TAG),
    ];
    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch {
        socket.close(1011, "Mobile viewer connection failed.");
      }
    }
  }

  private broadcastPublic(payload: ViewerStreamEvent) {
    this.broadcastOverlay(payload);
    this.broadcastViewer(payload);
  }

  /**
   * Replacing the audience link must not disconnect workspace watchers, so
   * only service-ending reasons close the observer sockets too.
   */
  private closeViewerSockets(code: number, reason: string, includeObservers = true) {
    const sockets = [
      ...this.state.getWebSockets(VIEWER_SOCKET_TAG),
      ...(includeObservers ? this.state.getWebSockets(OBSERVER_SOCKET_TAG) : []),
    ];
    for (const socket of sockets) socket.close(code, reason);
  }

  webSocketMessage(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as
      | { role?: string }
      | null;
    socket.close(
      1008,
      attachment?.role === VIEWER_SOCKET_TAG
        ? "The mobile viewer is read-only."
        : attachment?.role === OBSERVER_SOCKET_TAG
          ? "The workspace watcher is read-only."
          : "The OBS overlay is read-only.",
    );
  }

  async alarm() {
    if (this.env?.SERMON_JOURNALS) return this.state.blockConcurrencyWhile(() => this.runAlarm());
    return this.runAlarm();
  }

  private async runAlarm() {
    try { await this.flushJournals(); }
    catch { await this.state.storage.setAlarm(Date.now() + 10_000); return; }
    const configuration = await this.state.storage.get<ChannelConfiguration>(
      "configuration",
    );
    const nextArchiveExpiry = this.env?.SERMON_JOURNALS ? (await this.pruneArchives()).nextExpiry : Infinity;
    if (!configuration || !isActive(configuration)) {
      if (Number.isFinite(nextArchiveExpiry)) await this.state.storage.setAlarm(nextArchiveExpiry);
      else await this.state.storage.deleteAlarm();
      return;
    }
    if (configuration.expiresAt! > Date.now()) {
      await this.state.storage.setAlarm(Math.min(configuration.expiresAt!, nextArchiveExpiry));
      return;
    }
    await Promise.all([
      this.state.storage.put("configuration", deactivate(configuration)),
      this.state.storage.delete("latest"),
    ]);
    this.broadcastPublic({ type: "clear" });
    this.broadcastPublic({ type: "state", status: "idle", expiresAt: null });
    this.closeViewerSockets(4002, "Live service ended.");
    await this.queueJournal(configuration, true);
    try {
      await this.flushJournals();
      await this.state.storage.put("journal-configuration", deactivate(configuration));
    }
    catch { await this.state.storage.setAlarm(Date.now() + 10_000); }
  }
}

function channelNotConfigured() {
  return json(
    { error: "Create the Main OBS channel first.", code: "channel_not_configured" },
    404,
  );
}

function channelInUse(expiresAt?: number) {
  return json(
    {
      error: "The Main channel is already controlled by another operator.",
      code: "channel_in_use",
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    },
    409,
  );
}

function controllerReplaced() {
  return json(
    {
      error: "Control of the Main channel moved to another operator.",
      code: "controller_replaced",
    },
    409,
  );
}

function translationSessionRefreshed(translationRevision: number) {
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

export async function captionTokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
