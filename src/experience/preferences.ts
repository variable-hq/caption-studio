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
import { normalizeUiLocalePreference, type UiLocalePreference } from "@/i18n";

/** Bounds a preference record; every field is optional and independently valid. */
export const PREFERENCES_VERSION = 1;
export const MAX_PREFERENCES_BYTES = 32_768;

export type ThemePreference = "system" | "light" | "dark";
export type TranslationDefaults = Omit<TranslationSessionSettings, "translationSystemPrompt">;

export interface OperatorPreferences {
  version: typeof PREFERENCES_VERSION;
  theme: ThemePreference;
  uiLocale: UiLocalePreference;
  translationSystemPrompt: string | null;
  summaryDefaults: SummaryOptions | null;
  captionStyle: CaptionStyle | null;
  translationDefaults: TranslationDefaults | null;
  outputBufferCount: OutputBufferCount | null;
  outputBufferDwellMs: OutputBufferDwellMs | null;
  /** Pre-ticks "Save transcript history" at Start; the choice stays visible and changeable. */
  saveHistoryDefault: boolean | null;
  /** Generates an AI summary draft after each saved session this operator ends. */
  autoSummary: boolean;
  updatedAt: number | null;
}

export const EMPTY_PREFERENCES: OperatorPreferences = {
  version: PREFERENCES_VERSION,
  theme: "system",
  uiLocale: null,
  translationSystemPrompt: null,
  summaryDefaults: null,
  captionStyle: null,
  translationDefaults: null,
  outputBufferCount: null,
  outputBufferDwellMs: null,
  saveHistoryDefault: null,
  autoSummary: false,
  updatedAt: null,
};

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
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
    inferenceLevel: settings.inferenceLevel,
    sanitizeLevel: settings.sanitizeLevel,
    filterInappropriateLanguage: settings.filterInappropriateLanguage,
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
    uiLocale: "uiLocale" in input ? normalizeUiLocalePreference(input.uiLocale) : base.uiLocale,
    translationSystemPrompt: pick("translationSystemPrompt", base.translationSystemPrompt, normalizePrompt),
    summaryDefaults: pick("summaryDefaults", base.summaryDefaults, normalizeSummaryOptions),
    captionStyle: pick("captionStyle", base.captionStyle, (value) =>
      value && typeof value === "object" ? normalizeCaptionStyle(value as Partial<CaptionStyle>) : null),
    translationDefaults: pick("translationDefaults", base.translationDefaults, normalizeTranslationDefaults),
    outputBufferCount: pick("outputBufferCount", base.outputBufferCount, normalizeOutputBufferCount),
    outputBufferDwellMs: pick("outputBufferDwellMs", base.outputBufferDwellMs, normalizeOutputBufferDwellMs),
    saveHistoryDefault: pick("saveHistoryDefault", base.saveHistoryDefault, (value) => value === true),
    autoSummary: "autoSummary" in input ? input.autoSummary === true : base.autoSummary,
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

/**
 * The workspace-wide setup every operator shares (ADR 0022): the same record shape, stored
 * once for the workspace. `theme` and `uiLocale` stay per operator.
 */
export const WORKSPACE_SETUP_KEY = "workspace:setup";

/** Fields the shared setup owns; theme and interface language stay personal. */
export const SHARED_SETUP_FIELDS = [
  "translationSystemPrompt",
  "summaryDefaults",
  "captionStyle",
  "translationDefaults",
  "outputBufferCount",
  "outputBufferDwellMs",
  "saveHistoryDefault",
  "autoSummary",
] as const satisfies readonly (keyof OperatorPreferences)[];

/**
 * The setup in effect for one operator. Until anyone has saved the shared setup, an
 * operator keeps their own earlier saved values; afterwards a field still unset in the
 * shared setup falls back to the operator's own, so nothing saved before ADR 0022 is lost.
 */
export function effectiveSetup(shared: OperatorPreferences, personal: OperatorPreferences): OperatorPreferences {
  if (shared.updatedAt === null) return personal;
  return {
    ...personal,
    translationSystemPrompt: shared.translationSystemPrompt ?? personal.translationSystemPrompt,
    summaryDefaults: shared.summaryDefaults ?? personal.summaryDefaults,
    captionStyle: shared.captionStyle ?? personal.captionStyle,
    translationDefaults: shared.translationDefaults ?? personal.translationDefaults,
    outputBufferCount: shared.outputBufferCount ?? personal.outputBufferCount,
    outputBufferDwellMs: shared.outputBufferDwellMs ?? personal.outputBufferDwellMs,
    saveHistoryDefault: shared.saveHistoryDefault ?? personal.saveHistoryDefault,
    autoSummary: shared.autoSummary,
    updatedAt: shared.updatedAt,
  };
}

/** Deterministic, non-reversible key for an operator identity such as an Access email. */
export async function operatorIdentityKey(identity: string) {
  return `operator:${await sha256Hex(identity.trim().toLowerCase())}`;
}
