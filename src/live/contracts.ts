import type { LlmSessionUsage } from "@/ai/contracts";
import type { LanguageLocale } from "@/domain/languages";

export const SPEECH_BUFFER_OPTIONS_MS = [6_000, 9_000, 12_000, 15_000, 18_000] as const;
export type SpeechBufferMs = (typeof SPEECH_BUFFER_OPTIONS_MS)[number];
export const DEFAULT_SPEECH_BUFFER_MS: SpeechBufferMs = 6_000;
export const MIN_SPEECH_BUFFER_MS = SPEECH_BUFFER_OPTIONS_MS[0];
export const MAX_LIVE_SESSION_MS = 90 * 60 * 1_000;
export const MAX_TRANSCRIPTION_REQUESTS = Math.floor(
  MAX_LIVE_SESSION_MS / MIN_SPEECH_BUFFER_MS,
);
export const MAX_CAPTION_EVENTS = 1_400;
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
  serviceId?: string;
  saveHistory?: boolean;
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

export interface LiveServiceDetails {
  serviceId?: string;
  readerUrl?: string;
  saveHistory?: boolean;
  channelId: typeof MAIN_CHANNEL_ID;
  controllerToken: string;
  viewerUrl: string | null;
  startedAt: string;
  expiresAt: string;
  translationRevision: number;
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
  transcriptionRequests: number;
  llmUsage: LlmSessionUsage;
  latestSourceText: string;
  latestPublicText: string;
  latestPublicLanguage: LanguageLocale | null;
  lastLatencyMs: number | null;
  channel: ObsChannelDetails | null;
  service: LiveServiceDetails | null;
}

export type LiveApiErrorCode =
  | "caption_cleared"
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

export function normalizeSpeechBufferMs(value: unknown): SpeechBufferMs {
  const number = Number(value);
  return SPEECH_BUFFER_OPTIONS_MS.includes(number as SpeechBufferMs)
    ? (number as SpeechBufferMs)
    : DEFAULT_SPEECH_BUFFER_MS;
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
