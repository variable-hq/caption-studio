import type { LanguageLocale } from "@/domain/languages";

export const AUDIO_CHUNK_MS = 4_000;
export const MAX_LIVE_SESSION_MS = 90 * 60 * 1_000;
export const MAX_TRANSCRIPTION_REQUESTS = Math.floor(
  MAX_LIVE_SESSION_MS / AUDIO_CHUNK_MS,
);
export const MAX_CAPTION_EVENTS = 1_400;
export const MAIN_CHANNEL_ID = "main" as const;

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
}

export interface LiveSessionControlResponse {
  action: LiveSessionControlAction;
  status: Exclude<ChannelStatus, "unconfigured">;
  sequence?: number;
}

export interface PublicCaptionRequest {
  publicText: string;
  targetLanguage: LanguageLocale;
  style: CaptionStyle;
}

export interface PublicCaptionEvent extends PublicCaptionRequest {
  sequence: number;
  publishedAt: string;
}

export interface ObsChannelDetails {
  channelId: typeof MAIN_CHANNEL_ID;
  configured: boolean;
  status: ChannelStatus;
  overlayUrl: string | null;
  style: CaptionStyle | null;
  startedAt: string | null;
  expiresAt: string | null;
  transcriptionRequests: number;
}

export interface LiveServiceDetails {
  channelId: typeof MAIN_CHANNEL_ID;
  controllerToken: string;
  startedAt: string;
  expiresAt: string;
}

export interface LiveSessionState {
  status:
    | "loading-channel"
    | "idle"
    | "starting"
    | "live"
    | "pausing"
    | "paused"
    | "resuming"
    | "ending"
    | "taken-over"
    | "error";
  message: string;
  sequence: number;
  droppedChunks: number;
  transcriptionRequests: number;
  latestSourceText: string;
  latestPublicText: string;
  lastLatencyMs: number | null;
  channel: ObsChannelDetails | null;
  service: LiveServiceDetails | null;
}

export type LiveApiErrorCode =
  | "channel_in_use"
  | "channel_not_configured"
  | "controller_replaced"
  | "invalid_overlay_key"
  | "transcription_limit_reached";

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
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
