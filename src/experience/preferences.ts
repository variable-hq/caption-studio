import type { SummaryOptions } from "@/experience/contracts";
import { normalizeSummaryOptions } from "@/experience/summary-defaults";
import { normalizeCaptionStyle, type CaptionStyle } from "@/live/contracts";
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
  const settings = normalizeTranslationSessionSettings(value as Partial<TranslationSessionSettings>);
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
  const bytes = new TextEncoder().encode(identity.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `operator:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
