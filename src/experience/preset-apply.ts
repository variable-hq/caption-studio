import type { OperatorPreferences } from "@/experience/preferences";
import type { Preset, PresetDefaults, PresetStarterTerm } from "@/experience/presets";
import { MAX_WORD_ENTRIES, wordsFromSettings, wordsToSettings } from "@/live/words";

/** The preview rows, in display order. */
export type PresetRowField = "captionWait" | "inference" | "sanitize" | "outputBuffer" | "summaryLength" | "summaryGuidance";

/**
 * `fill`: the preset's value is set as a draft. `kept`: the workspace already saved this
 * setting, so the preset leaves it alone. `afterSession`: a running session keeps its
 * output buffer until it ends.
 */
export type PresetRowStatus = "fill" | "kept" | "afterSession";

/** Values a preset sets as drafts. Terms, languages, caption style and automatic summaries are never filled. */
export type PresetFill = Omit<PresetDefaults, "starterTerms">;

export type PresetApplyPlan = {
  preset: Preset;
  rows: { field: PresetRowField; status: PresetRowStatus }[];
  fill: PresetFill;
  /** The Terms text with the starter terms added, and how many were added or did not fit. */
  starterTerms: { keywordText: string; filterText: string; added: number; skipped: number };
};

/** The saved setup a plan checks: a null entry is a setting the workspace has not saved. */
export type PresetSavedSetup = Pick<OperatorPreferences, "translationDefaults" | "outputBufferCount" | "outputBufferDwellMs" | "summaryDefaults">;

export type PresetDrafts = { keywordText: string; filterText: string };

function entryCount(text: string) {
  return text.split(", ").filter(Boolean).length;
}

/** Adds each starter term that is not already listed as a translation and still fits the Terms limit. */
function planStarterTerms(starters: readonly PresetStarterTerm[], drafts: PresetDrafts) {
  let rows = wordsFromSettings(drafts.keywordText, drafts.filterText);
  let added = 0;
  let skipped = 0;
  for (const { word, translation } of starters) {
    // A word already in the glossary, as a canonical spelling or a variant, would gain a translation through a merge.
    const key = word.toLowerCase();
    const listed = rows.some((row) =>
      row.action !== "mask" && row.action !== "replace" && row.action !== "hide" &&
      (row.word.toLowerCase() === key || (row.action === "fix" && row.with.toLowerCase() === key)));
    if (listed) continue;
    const next = [...rows, { word, action: "translate" as const, with: translation }];
    const compiled = wordsToSettings(next);
    if (entryCount(compiled.keywordText) > MAX_WORD_ENTRIES || entryCount(compiled.filterText) > MAX_WORD_ENTRIES) {
      skipped += 1;
      continue;
    }
    rows = next;
    added += 1;
  }
  return { ...wordsToSettings(rows), added, skipped };
}

/**
 * What applying a preset does now: the fills for unsaved settings, the preview rows and the
 * Terms text. The preview and "Apply preset" both read this plan, so they cannot disagree.
 */
export function planPresetApply(
  preset: Preset,
  saved: PresetSavedSetup,
  drafts: PresetDrafts,
  sessionLive: boolean,
): PresetApplyPlan {
  const defaults = preset.defaults ?? {};
  const rows: PresetApplyPlan["rows"] = [];
  const fill: PresetFill = {};

  const translationKept = saved.translationDefaults !== null;
  if (defaults.recordingWindowMs !== undefined) {
    rows.push({ field: "captionWait", status: translationKept ? "kept" : "fill" });
    if (!translationKept) fill.recordingWindowMs = defaults.recordingWindowMs;
  }
  if (defaults.inferenceLevel !== undefined) {
    rows.push({ field: "inference", status: translationKept ? "kept" : "fill" });
    if (!translationKept) fill.inferenceLevel = defaults.inferenceLevel;
  }
  if (defaults.sanitizeLevel !== undefined) {
    rows.push({ field: "sanitize", status: translationKept ? "kept" : "fill" });
    if (!translationKept) fill.sanitizeLevel = defaults.sanitizeLevel;
  }

  if (defaults.outputBufferCount !== undefined || defaults.outputBufferDwellMs !== undefined) {
    const countKept = saved.outputBufferCount !== null;
    const dwellKept = saved.outputBufferDwellMs !== null;
    const status: PresetRowStatus = countKept && dwellKept ? "kept" : sessionLive ? "afterSession" : "fill";
    rows.push({ field: "outputBuffer", status });
    if (status === "fill") {
      if (!countKept && defaults.outputBufferCount !== undefined) fill.outputBufferCount = defaults.outputBufferCount;
      if (!dwellKept && defaults.outputBufferDwellMs !== undefined) fill.outputBufferDwellMs = defaults.outputBufferDwellMs;
    }
  }

  const summaryKept = saved.summaryDefaults !== null;
  if (defaults.summaryLength !== undefined) {
    rows.push({ field: "summaryLength", status: summaryKept ? "kept" : "fill" });
    if (!summaryKept) fill.summaryLength = defaults.summaryLength;
  }
  if (defaults.summaryGuidance !== undefined) {
    rows.push({ field: "summaryGuidance", status: summaryKept ? "kept" : "fill" });
    if (!summaryKept) fill.summaryGuidance = defaults.summaryGuidance;
  }

  return { preset, rows, fill, starterTerms: planStarterTerms(defaults.starterTerms ?? [], drafts) };
}

/** The fields each preview row covers, in display order. */
const ROW_FIELDS: Record<PresetRowField, (keyof PresetFill)[]> = {
  captionWait: ["recordingWindowMs"],
  inference: ["inferenceLevel"],
  sanitize: ["sanitizeLevel"],
  outputBuffer: ["outputBufferCount", "outputBufferDwellMs"],
  summaryLength: ["summaryLength"],
  summaryGuidance: ["summaryGuidance"],
};

/** A saved setting whose value differs from the active format's default. */
export type PresetDifference = {
  field: PresetRowField;
  /** `differs`: the action fills the format's value as a draft. `afterSession`: a running session keeps its output buffer until it ends. */
  status: "differs" | "afterSession";
  /** The saved value of each covered field; a field the workspace has not saved shows the format's value. */
  saved: PresetFill;
  /** The format's value of each covered field, which the action fills in. */
  preset: PresetFill;
};

/**
 * The saved settings that differ from the active format's defaults, in preview order. A setting
 * the workspace has not saved is never listed, and General has no defaults, so it lists none.
 */
export function planPresetDifferences(preset: Preset, saved: PresetSavedSetup, sessionLive: boolean): PresetDifference[] {
  const defaults: PresetFill = preset.defaults ?? {};
  const savedValues: PresetFill = {
    recordingWindowMs: saved.translationDefaults?.recordingWindowMs,
    inferenceLevel: saved.translationDefaults?.inferenceLevel,
    sanitizeLevel: saved.translationDefaults?.sanitizeLevel,
    outputBufferCount: saved.outputBufferCount ?? undefined,
    outputBufferDwellMs: saved.outputBufferDwellMs ?? undefined,
    summaryLength: saved.summaryDefaults?.length,
    summaryGuidance: saved.summaryDefaults?.guidance,
  };
  const differences: PresetDifference[] = [];
  for (const field of Object.keys(ROW_FIELDS) as PresetRowField[]) {
    const keys = ROW_FIELDS[field].filter((key) => defaults[key] !== undefined);
    const differs = keys.some((key) => savedValues[key] !== undefined && savedValues[key] !== defaults[key]);
    if (!differs) continue;
    differences.push({
      field,
      status: field === "outputBuffer" && sessionLive ? "afterSession" : "differs",
      saved: Object.fromEntries(keys.map((key) => [key, savedValues[key] ?? defaults[key]])) as PresetFill,
      preset: Object.fromEntries(keys.map((key) => [key, defaults[key]])) as PresetFill,
    });
  }
  return differences;
}
