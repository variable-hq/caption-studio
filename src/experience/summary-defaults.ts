import { isLanguageLocale } from "@/domain/languages";
import { SUMMARY_MODELS, type SummaryModel, type SummaryOptions } from "@/experience/contracts";

export const SUMMARY_DEFAULTS_PREFERENCE_KEY = "caption-studio:summary-defaults:v1";
export const MAX_SUMMARY_GUIDANCE_CHARS = 2_000;

export const DEFAULT_SUMMARY_OPTIONS: SummaryOptions = {
  model: SUMMARY_MODELS[0],
  language: "id",
  length: "short",
  guidance: "",
};

function isSummaryModel(value: unknown): value is SummaryModel {
  return typeof value === "string" && (SUMMARY_MODELS as readonly string[]).includes(value);
}

/** Accepts a parsed object or a JSON string; unknown fields fall back to the defaults. */
export function normalizeSummaryOptions(value: unknown): SummaryOptions {
  let candidate: unknown = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { ...DEFAULT_SUMMARY_OPTIONS };
    }
  }
  if (!candidate || typeof candidate !== "object") return { ...DEFAULT_SUMMARY_OPTIONS };
  const input = candidate as Record<string, unknown>;
  const guidance = typeof input.guidance === "string"
    ? input.guidance.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, MAX_SUMMARY_GUIDANCE_CHARS)
    : DEFAULT_SUMMARY_OPTIONS.guidance;
  return {
    model: isSummaryModel(input.model) ? input.model : DEFAULT_SUMMARY_OPTIONS.model,
    language: typeof input.language === "string" && isLanguageLocale(input.language)
      ? input.language
      : DEFAULT_SUMMARY_OPTIONS.language,
    length: input.length === "detailed" ? "detailed" : "short",
    guidance,
  };
}

export function summaryOptionsEqual(a: SummaryOptions, b: SummaryOptions) {
  return a.model === b.model && a.language === b.language && a.length === b.length && a.guidance === b.guidance;
}
