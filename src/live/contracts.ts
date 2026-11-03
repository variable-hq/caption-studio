import type { LlmSessionUsage } from "@/ai/contracts";
import type { LanguageLocale } from "@/domain/languages";
import type { CutMetrics } from "@/live/cut-metrics";

export const RECORDING_WINDOW_OPTIONS = [6_000, 10_000, 14_000, "dynamic"] as const;
export type RecordingWindowMs = (typeof RECORDING_WINDOW_OPTIONS)[number];
export const DEFAULT_RECORDING_WINDOW_MS: RecordingWindowMs = "dynamic";
/** The smallest floor any wait-time option may use; sets the request ceiling. */
export const SMALLEST_WINDOW_FLOOR_MS = 3_000;
export const DYNAMIC_WINDOW_MAX_MS = 14_000;
export const MAX_LIVE_SESSION_MS = 90 * 60 * 1_000;
export const MAX_TRANSCRIPTION_REQUESTS = Math.floor(
  MAX_LIVE_SESSION_MS / SMALLEST_WINDOW_FLOOR_MS,
);
/** Each option is a promise about the cap; the floor is the earliest a pause may cut. */
export interface RecordingWindowPolicy {
  minMs: number;
  maxMs: number;
  /** Silence required for a pause cut at the floor. */
  pauseMs: number;
  /** Silence required at the cap; equal to pauseMs for the fixed options. */
  pauseAtCapMs: number;
}

export const RECORDING_WINDOW_POLICIES: Record<RecordingWindowMs, RecordingWindowPolicy> = {
  6_000: { minMs: 3_000, maxMs: 6_000, pauseMs: 500, pauseAtCapMs: 500 },
  10_000: { minMs: 5_000, maxMs: 10_000, pauseMs: 700, pauseAtCapMs: 700 },
  14_000: { minMs: 7_000, maxMs: 14_000, pauseMs: 900, pauseAtCapMs: 900 },
  dynamic: {
    minMs: 4_000,
    maxMs: DYNAMIC_WINDOW_MAX_MS,
    pauseMs: 700,
    pauseAtCapMs: 200,
  },
};
export const MAX_CAPTION_EVENTS = 1_400;
/**
 * Workspace operators who may watch one session without holding the controller.
 * Matched to the 32 observer sockets the room accepts, so a workspace runs out
 * of connections before it runs out of identities.
 */
export const MAX_SESSION_OBSERVERS = 32;
export const MAX_MANUAL_CAPTION_CHARS = 240;
export const MAIN_CHANNEL_ID = "main" as const;
const TRANSLATION_REFRESH_REQUEST_ID = /^[A-Za-z0-9_-]{16,64}$/;

export interface CaptionStyle {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundTransparency: number;
  horizontalMarginPercent: number;
  verticalMarginPercent: number;
  horizontalAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fontFamily: "sans-serif" | "serif" | "monospace";
}

const LIVE_SESSION_CONTROL_ACTIONS = [
  "pause",
  "resume",
  "clear",
  "show-test",
  "manual",
  "refresh-translation",
] as const;

export type LiveSessionControlAction =
  (typeof LIVE_SESSION_CONTROL_ACTIONS)[number];

export function isLiveSessionControlAction(
  value: unknown,
): value is LiveSessionControlAction {
  return (
    typeof value === "string" &&
    LIVE_SESSION_CONTROL_ACTIONS.some((action) => action === value)
  );
}

export type ChannelStatus = "unconfigured" | "idle" | "live" | "paused";

/** The operator dashboard's read of `/api/ai/health` readiness, independent of channel/session state. */
export type CloudState = "checking" | "ready" | "not-configured" | "unavailable";

export interface LiveSessionControlRequest {
  action: LiveSessionControlAction;
  targetLanguage?: LanguageLocale;
  style?: CaptionStyle;
  expectedTranslationRevision?: number;
  refreshRequestId?: string;
  manualText?: string;
}

export interface LiveSessionControlResponse {
  action: LiveSessionControlAction;
  status: Exclude<ChannelStatus, "unconfigured">;
  translationRevision: number;
  sequence?: number;
  historyIncomplete?: boolean;
}

export interface PublicCaptionRequest {
  captionEpoch?: number;
  transcriptionAttempt?: number;
  reader?: { filterText: string; keywordText: string };
  publicText: string;
  targetLanguage: LanguageLocale;
  style: CaptionStyle;
  translationRevision: number;
}

export interface PublicCaptionEvent extends PublicCaptionRequest {
  sequence: number;
  publishedAt: string;
}

export interface ObsChannelDetails {
  sessionId?: string;
  saveHistory?: boolean;
  /** Access email of the operator running the session; Access-protected surfaces only. */
  controllerLabel?: string;
  channelId: typeof MAIN_CHANNEL_ID;
  configured: boolean;
  status: ChannelStatus;
  overlayUrl: string | null;
  style: CaptionStyle | null;
  startedAt: string | null;
  expiresAt: string | null;
  transcriptionRequests: number;
  llmUsage: LlmSessionUsage;
  translationRevision: number;
}

export interface LiveSessionDetails {
  sessionId?: string;
  readerUrl?: string;
  saveHistory?: boolean;
  channelId: typeof MAIN_CHANNEL_ID;
  controllerToken: string;
  viewerUrl: string | null;
  startedAt: string;
  expiresAt: string;
  translationRevision: number;
}

/**
 * What a workspace operator who does not hold the controller receives: a
 * read-only credential for the public caption stream plus the identifiers
 * needed to read the Access-protected archive of the same session.
 */
export interface LiveObserverDetails {
  channelId: typeof MAIN_CHANNEL_ID;
  sessionId: string;
  saveHistory: boolean;
  controllerLabel?: string;
  status: "live" | "paused";
  observerToken: string;
  viewerUrl: string;
  startedAt: string;
  expiresAt: string;
  translationRevision: number;
}

export interface ObservedSessionState {
  status: "idle" | "connecting" | "watching" | "reconnecting" | "unavailable";
  message: string;
  latestPublicText: string;
  latestPublicLanguage: LanguageLocale | null;
  latestPublicAt: number | null;
  latestSourceText: string;
  sequence: number;
  observer: LiveObserverDetails | null;
}

export interface LiveSessionState {
  historyIncomplete?: boolean;
  status:
    | "loading-channel"
    | "idle"
    | "starting"
    | "live"
    | "pausing"
    | "paused"
    | "resuming"
    | "refreshing"
    | "ending"
    | "taken-over"
    | "error";
  message: string;
  sequence: number;
  droppedChunks: number;
  filteredSegments: number;
  transcriptionRequests: number;
  /** How recording windows ended this session; numbers only, in this tab's memory. */
  cutMetrics: CutMetrics;
  llmUsage: LlmSessionUsage;
  latestSourceText: string;
  latestPublicText: string;
  /** When the current public caption was published; null once the canvas is clear. */
  latestPublicAt?: number | null;
  latestPublicLanguage: LanguageLocale | null;
  lastLatencyMs: number | null;
  channel: ObsChannelDetails | null;
  liveSession: LiveSessionDetails | null;
}

/** Pre-session error codes. Responses carry the session name in `sessionCode` and the earlier value in `code`. */
const SESSION_CODE_FALLBACK: Readonly<Record<string, string>> = {
  service_paused: "session_paused",
  service_inactive: "session_inactive",
};

/** The session error code of a response: `sessionCode` when present, otherwise `code` mapped to its session name. */
export function sessionErrorCode(payload: { code?: unknown; sessionCode?: unknown } | null | undefined) {
  if (typeof payload?.sessionCode === "string") return payload.sessionCode;
  if (typeof payload?.code !== "string") return undefined;
  return SESSION_CODE_FALLBACK[payload.code] ?? payload.code;
}

export type LiveApiErrorCode =
  | "caption_cleared"
  | "session_paused"
  | "session_inactive"
  | "service_paused"
  | "channel_in_use"
  | "channel_not_configured"
  | "controller_replaced"
  | "invalid_overlay_key"
  | "translation_session_refreshed"
  | "transcription_limit_reached";

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}

export function normalizeRecordingWindowMs(value: unknown): RecordingWindowMs {
  if (value === "dynamic") return value;
  const number = Number(value);
  if (number === 6_000 || number === 10_000) return number;
  if (number === 14_000 || number === 12_000 || number === 15_000 || number === 18_000) {
    return 14_000;
  }
  if (number === 9_000) return 10_000;
  return DEFAULT_RECORDING_WINDOW_MS;
}

export function recordingWindowBoundsMs(setting: RecordingWindowMs): RecordingWindowPolicy {
  return RECORDING_WINDOW_POLICIES[setting];
}

export function recordingWindowLabel(setting: RecordingWindowMs): string {
  return setting === "dynamic" ? "Dynamic" : `${setting / 1_000}s`;
}

export function normalizeTranslationRevision(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function isTranslationRefreshRequestId(value: unknown): value is string {
  return (
    typeof value === "string" && TRANSLATION_REFRESH_REQUEST_ID.test(value)
  );
}

export function normalizeCaptionStyle(input: Partial<CaptionStyle>): CaptionStyle {
  return {
    fontSize: boundedInteger(input.fontSize, 10, 72, 48),
    textColor: HEX_COLOUR.test(input.textColor ?? "") ? input.textColor! : "#ffffff",
    backgroundColor: HEX_COLOUR.test(input.backgroundColor ?? "")
      ? input.backgroundColor!
      : "#101827",
    backgroundTransparency: boundedInteger(
      input.backgroundTransparency,
      0,
      100,
      0,
    ),
    horizontalMarginPercent: boundedInteger(
      input.horizontalMarginPercent,
      0,
      20,
      4,
    ),
    verticalMarginPercent: boundedInteger(
      input.verticalMarginPercent,
      0,
      20,
      6,
    ),
    horizontalAlign: ["left", "center", "right"].includes(
      input.horizontalAlign ?? "",
    )
      ? input.horizontalAlign!
      : "center",
    verticalAlign: ["top", "middle", "bottom"].includes(
      input.verticalAlign ?? "",
    )
      ? input.verticalAlign!
      : "bottom",
    fontFamily: ["sans-serif", "serif", "monospace"].includes(
      input.fontFamily ?? "",
    )
      ? input.fontFamily!
      : "sans-serif",
  };
}
