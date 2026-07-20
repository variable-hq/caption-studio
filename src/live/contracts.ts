import type { LanguageLocale } from "@/domain/languages";

export const AUDIO_CHUNK_MS = 4_000;
export const MAX_LIVE_SESSION_MS = 90 * 60 * 1_000;
export const MAX_TRANSCRIPTION_REQUESTS = Math.floor(
  MAX_LIVE_SESSION_MS / AUDIO_CHUNK_MS,
);
export const MAX_CAPTION_EVENTS = 1_400;

export type CaptionHorizontalAlign = "left" | "center" | "right";
export type CaptionVerticalAlign = "top" | "middle" | "bottom";
export type CaptionFontFamily = "sans-serif" | "serif" | "monospace";

export interface CaptionStyle {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundTransparency: number;
  horizontalMarginPercent: number;
  verticalMarginPercent: number;
  horizontalAlign: CaptionHorizontalAlign;
  verticalAlign: CaptionVerticalAlign;
  fontFamily: CaptionFontFamily;
}

export const LIVE_SESSION_CONTROL_ACTIONS = [
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

export interface LiveSessionControlRequest {
  action: LiveSessionControlAction;
  targetLanguage?: LanguageLocale;
  style?: CaptionStyle;
}

export interface LiveSessionControlResponse {
  action: LiveSessionControlAction;
  paused: boolean;
  sequence?: number;
}

export interface PublicCaptionEvent {
  sequence: number;
  publicText: string;
  targetLanguage: LanguageLocale;
  style: CaptionStyle;
  publishedAt: string;
}

export interface LiveSessionDetails {
  sessionId: string;
  overlayUrl: string;
  expiresAt: string;
}

export interface LiveSessionState {
  status:
    | "idle"
    | "starting"
    | "live"
    | "pausing"
    | "paused"
    | "resuming"
    | "ending"
    | "error";
  message: string;
  sequence: number;
  droppedChunks: number;
  transcriptionRequests: number;
  sessionStartedAt: string | null;
  latestSourceText: string;
  latestPublicText: string;
  lastLatencyMs: number | null;
  session: LiveSessionDetails | null;
}

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
    horizontalAlign: ["left", "center", "right"].includes(input.horizontalAlign ?? "")
      ? input.horizontalAlign!
      : "center",
    verticalAlign: ["top", "middle", "bottom"].includes(input.verticalAlign ?? "")
      ? input.verticalAlign!
      : "bottom",
    fontFamily: ["sans-serif", "serif", "monospace"].includes(input.fontFamily ?? "")
      ? input.fontFamily!
      : "sans-serif",
  };
}

export function isLiveSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
