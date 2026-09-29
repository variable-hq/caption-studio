import type { SummaryOptions } from "@/experience/contracts";
import { normalizeSummaryOptions } from "@/experience/summary-defaults";
import { sha256Hex } from "@/http/tokens";
import { normalizeCaptionStyle, type CaptionStyle, type RecordingWindowMs } from "@/live/contracts";
import {
  normalizeOutputBufferCount,
  normalizeOutputBufferDwellMs,
  type OutputBufferCount,
  type OutputBufferDwellMs,
} from "@/live/output-buffer";
import {
  normalizeTranslationSessionSettings,
  type TranslationSessionSettings,
} from "@/live/translation-settings";
import { normalizeTranslationSystemPrompt } from "@/ai/translation-prompt";

/** Bounds a preference record; every field is optional and independently valid. */
export const PREFERENCES_VERSION = 1;
export const MAX_PREFERENCES_BYTES = 32_768;

export type ThemePreference = "system" | "light" | "dark";
export type TranslationDefaults = Omit<TranslationSessionSettings, "translationSystemPrompt">;

export interface OperatorPreferences {
  version: typeof PREFERENCES_VERSION;
  theme: ThemePreference;
  sidebarWidth: number | null;
  translationSystemPrompt: string | null;
  summaryDefaults: SummaryOptions | null;
  captionStyle: CaptionStyle | null;
  translationDefaults: TranslationDefaults | null;
  outputBufferCount: OutputBufferCount | null;
  outputBufferDwellMs: OutputBufferDwellMs | null;
  tutorialDismissed: boolean;
  updatedAt: number | null;
}

export const EMPTY_PREFERENCES: OperatorPreferences = {
  version: PREFERENCES_VERSION,
  theme: "system",
  sidebarWidth: null,
  translationSystemPrompt: null,
  summaryDefaults: null,
  captionStyle: null,
  translationDefaults: null,
  outputBufferCount: null,
  outputBufferDwellMs: null,
  tutorialDismissed: false,
  updatedAt: null,
};

export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 420;

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

function normalizeSidebarWidth(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(number)));
}

function normalizePrompt(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    return normalizeTranslationSystemPrompt(value);
  } catch {
    return null;
  }
}

function normalizeTranslationDefaults(value: unknown): TranslationDefaults | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<TranslationSessionSettings> & { speechBufferMs?: unknown };
  // Migrates a default saved before the recordingWindowMs rename.
  const migrated =
    record.recordingWindowMs === undefined && "speechBufferMs" in record
      ? { ...record, recordingWindowMs: record.speechBufferMs as RecordingWindowMs }
      : record;
  const settings = normalizeTranslationSessionSettings(migrated);
  return {
    sourceLanguage: settings.sourceLanguage,
    targetLanguage: settings.targetLanguage,
    keywordText: settings.keywordText,
    filterText: settings.filterText,
    recordingWindowMs: settings.recordingWindowMs,
  };
}

/**
 * Applies a partial update on top of a base record. A field set to `null`
 * clears it; an absent field keeps the base value; unknown fields are ignored.
 */
export function mergeOperatorPreferences(
  base: OperatorPreferences,
  patch: unknown,
  at = Date.now(),
): OperatorPreferences {
  const input = patch && typeof patch === "object" ? (patch as Record<string, unknown>) : {};
  const pick = <T,>(key: keyof OperatorPreferences, current: T, normalize: (value: unknown) => T): T =>
    key in input ? (input[key] === null ? (null as T) : normalize(input[key])) : current;
  return {
    version: PREFERENCES_VERSION,
    theme: "theme" in input ? normalizeTheme(input.theme) : base.theme,
    sidebarWidth: pick("sidebarWidth", base.sidebarWidth, normalizeSidebarWidth),
    translationSystemPrompt: pick("translationSystemPrompt", base.translationSystemPrompt, normalizePrompt),
    summaryDefaults: pick("summaryDefaults", base.summaryDefaults, normalizeSummaryOptions),
    captionStyle: pick("captionStyle", base.captionStyle, (value) =>
      value && typeof value === "object" ? normalizeCaptionStyle(value as Partial<CaptionStyle>) : null),
    translationDefaults: pick("translationDefaults", base.translationDefaults, normalizeTranslationDefaults),
    outputBufferCount: pick("outputBufferCount", base.outputBufferCount, normalizeOutputBufferCount),
    outputBufferDwellMs: pick("outputBufferDwellMs", base.outputBufferDwellMs, normalizeOutputBufferDwellMs),
    tutorialDismissed: "tutorialDismissed" in input ? input.tutorialDismissed === true : base.tutorialDismissed,
    updatedAt: at,
  };
}

/** Normalizes a stored or received full record; anything malformed becomes empty. */
export function normalizeOperatorPreferences(value: unknown): OperatorPreferences {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { ...EMPTY_PREFERENCES };
    }
  }
  if (!candidate || typeof candidate !== "object") return { ...EMPTY_PREFERENCES };
  const merged = mergeOperatorPreferences(EMPTY_PREFERENCES, candidate);
  const updatedAt = Number((candidate as Record<string, unknown>).updatedAt);
  return { ...merged, updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : null };
}

/** Deterministic, non-reversible key for an operator identity such as an Access email. */
export async function operatorIdentityKey(identity: string) {
  return `operator:${await sha256Hex(identity.trim().toLowerCase())}`;
}
