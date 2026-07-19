import type { LanguageLocale } from "@/domain/languages";

export const AUDIO_CHUNK_MS = 4_000;
export const MAX_LIVE_SESSION_MS = 90 * 60 * 1_000;
export const MAX_CAPTION_EVENTS = 1_400;

export interface CaptionStyle {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
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
  status: "idle" | "starting" | "live" | "stopping" | "error";
  message: string;
  sequence: number;
  droppedChunks: number;
  latestSourceText: string;
  latestPublicText: string;
  lastLatencyMs: number | null;
  session: LiveSessionDetails | null;
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export function normalizeCaptionStyle(input: Partial<CaptionStyle>): CaptionStyle {
  return {
    fontSize: Math.min(96, Math.max(24, Math.round(Number(input.fontSize) || 48))),
    textColor: HEX_COLOUR.test(input.textColor ?? "") ? input.textColor! : "#ffffff",
    backgroundColor: HEX_COLOUR.test(input.backgroundColor ?? "")
      ? input.backgroundColor!
      : "#101827",
  };
}

export function isLiveSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
