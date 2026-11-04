import type { MessageKey } from "@/i18n";
import { MAX_PRESETS_PER_IMPORT } from "./custom-presets";
import { EMPTY_PREFERENCES, SHARED_SETUP_FIELDS, mergeOperatorPreferences, type OperatorPreferences } from "./preferences";
import { PresetValidationError, isCustomPresetId, normalizePreset, type Preset, type PresetId } from "./presets";

/** The setup file a workspace exports and imports; its Terms stay in their own list import. */
export const SETUP_FILE_KIND = "caption-studio-setup";
export const SETUP_FILE_VERSION = 1;
export const MAX_SETUP_FILE_BYTES = 64 * 1024;

/** The workspace's custom presets travel in the file's `presets` list, outside the shared setup record. */
const TOP_LEVEL_KEYS: readonly string[] = ["kind", "schemaVersion", "presets", ...SHARED_SETUP_FIELDS];
const TRANSLATION_KEYS: readonly string[] = [
  "sourceLanguage",
  "targetLanguage",
  "recordingWindowMs",
  "inferenceLevel",
  "sanitizeLevel",
  "filterInappropriateLanguage",
];
const SUMMARY_KEYS: readonly string[] = ["model", "language", "length", "guidance"];
const CAPTION_STYLE_KEYS: readonly string[] = [
  "fontSize",
  "textColor",
  "backgroundColor",
  "backgroundTransparency",
  "horizontalMarginPercent",
  "verticalMarginPercent",
  "horizontalAlign",
  "verticalAlign",
  "fontFamily",
];

export type SetupFileFailure =
  | { reason: "too-large" }
  | { reason: "not-json" }
  | { reason: "not-setup-file" }
  | { reason: "unsupported-version" }
  | { reason: "unknown-field"; field: string }
  | { reason: "invalid-preset"; index: number };

export type SetupFileResult =
  | { ok: true; setup: Partial<OperatorPreferences>; presets: Preset[] }
  | { ok: false; failure: SetupFileFailure };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The saved shared setup as a file: only the settings the workspace has saved, and its custom
 * presets; Terms are left out.
 */
export function buildSetupFile(saved: OperatorPreferences, presets: readonly Preset[] = []): Record<string, unknown> {
  const file: Record<string, unknown> = { kind: SETUP_FILE_KIND, schemaVersion: SETUP_FILE_VERSION };
  if (presets.length > 0) file.presets = presets;
  for (const field of SHARED_SETUP_FIELDS) {
    const value = saved[field];
    if (value === null || value === undefined) continue;
    if (field === "translationDefaults" && saved.translationDefaults) {
      const settings: Record<string, unknown> = { ...saved.translationDefaults };
      delete settings.keywordText;
      delete settings.filterText;
      file[field] = settings;
      continue;
    }
    file[field] = value;
  }
  return file;
}

/**
 * Reads a setup file. Oversized text, invalid JSON, another kind, another version, or any
 * field the format does not define (at the top level or inside a nested setting) is refused.
 * Values that pass are normalized by the same rules as the saved setup.
 */
export function parseSetupFile(text: string): SetupFileResult {
  if (new TextEncoder().encode(text).byteLength > MAX_SETUP_FILE_BYTES) {
    return { ok: false, failure: { reason: "too-large" } };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, failure: { reason: "not-json" } };
  }
  if (!isRecord(value) || value.kind !== SETUP_FILE_KIND) return { ok: false, failure: { reason: "not-setup-file" } };
  if (value.schemaVersion !== SETUP_FILE_VERSION) return { ok: false, failure: { reason: "unsupported-version" } };
  const unknown = Object.keys(value).find((key) => !TOP_LEVEL_KEYS.includes(key));
  if (unknown !== undefined) return { ok: false, failure: { reason: "unknown-field", field: unknown } };
  const nested: [string, readonly string[]][] = [
    ["translationDefaults", TRANSLATION_KEYS],
    ["summaryDefaults", SUMMARY_KEYS],
    ["captionStyle", CAPTION_STYLE_KEYS],
  ];
  for (const [field, allowed] of nested) {
    const record = value[field];
    if (!isRecord(record)) continue;
    const extra = Object.keys(record).find((key) => !allowed.includes(key));
    if (extra !== undefined) return { ok: false, failure: { reason: "unknown-field", field: `${field}.${extra}` } };
  }

  const presets = parseFilePresets(value.presets);
  if (!presets.ok) return presets;

  const settings: Record<string, unknown> = { ...value };
  delete settings.kind;
  delete settings.schemaVersion;
  delete settings.presets;
  const normalized = mergeOperatorPreferences(EMPTY_PREFERENCES, settings, 0);
  const setup: Partial<OperatorPreferences> = {};
  for (const field of SHARED_SETUP_FIELDS) {
    if (field in settings && normalized[field] !== null) Object.assign(setup, { [field]: normalized[field] });
  }
  return { ok: true, setup, presets: presets.presets };
}

/**
 * The format an imported setup selects, given the workspace ids its custom presets were saved under.
 * A custom format the import did not add is dropped, so the setup never names a missing preset.
 */
export function remapImportedProfile(profile: PresetId | null | undefined, added: readonly { fromId: string; id: string }[]): PresetId | undefined {
  if (profile === undefined || profile === null) return undefined;
  if (!isCustomPresetId(profile)) return profile;
  const match = added.find((entry) => entry.fromId === profile);
  return match && isCustomPresetId(match.id) ? match.id : undefined;
}

/**
 * A file's custom presets. Each must pass `normalizePreset()` with a custom id; one that does not
 * refuses the whole file, so nothing from it is partly applied.
 */
function parseFilePresets(value: unknown): { ok: true; presets: Preset[] } | { ok: false; failure: SetupFileFailure } {
  if (value === undefined) return { ok: true, presets: [] };
  if (!Array.isArray(value) || value.length > MAX_PRESETS_PER_IMPORT) return { ok: false, failure: { reason: "invalid-preset", index: 0 } };
  const presets: Preset[] = [];
  for (const [index, entry] of value.entries()) {
    try {
      const preset = normalizePreset(entry);
      if (!isCustomPresetId(preset.id)) throw new PresetValidationError("id must be custom");
      presets.push(preset);
    } catch {
      return { ok: false, failure: { reason: "invalid-preset", index } };
    }
  }
  return { ok: true, presets };
}

export type SetupRowField = (typeof SHARED_SETUP_FIELDS)[number] | "outputBuffer" | "summaryGuidance";
export const SETUP_ROW_LABEL_KEYS: Record<SetupRowField, MessageKey> = {
  translationSystemPrompt: "promptEditor.instructionsTitle",
  summaryDefaults: "settings.section.summary.title",
  summaryGuidance: "summarySettings.focus",
  captionStyle: "settings.section.look.title",
  translationDefaults: "settings.section.translator.title",
  outputBuffer: "outputBuffer.queueLabel",
  outputBufferCount: "outputBuffer.queueLabel",
  outputBufferDwellMs: "outputBuffer.queueLabel",
  saveHistoryDefault: "live.saveTranscript",
  profile: "settings.presets.choiceLabel",
  workspaceName: "settings.presets.workspaceNameLabel",
  autoSummary: "summarySettings.autoTitle",
};

/**
 * `fill`: the file's value is saved. `kept`: the workspace already saved this setting. `held`:
 * model-facing text the operator has not allowed yet; it is shown and saved only once allowed.
 */
export type SetupImportRow = { field: SetupRowField; status: "fill" | "kept" | "held"; text?: string };
export type SetupImportPlan = {
  rows: SetupImportRow[];
  /** The values to save: only the settings the workspace has not saved, and held text only once allowed. */
  patch: Partial<OperatorPreferences>;
};

/**
 * What importing a file does, against the saved setup in effect for this operator, with the Terms
 * the operator has now. A setting the workspace has saved is kept; an unsaved one is filled. The
 * translation block fills as one, and auto summary fills only when the file turns it on. The
 * translator instructions and the summary focus are model-facing text: they are shown as held
 * until `allowModelText` is set, and are never saved before that.
 */
export function planSetupImport(
  imported: Partial<OperatorPreferences>,
  saved: OperatorPreferences,
  terms: { keywordText: string; filterText: string },
  options: { allowModelText: boolean },
): SetupImportPlan {
  const rows: SetupImportRow[] = [];
  const patch: Partial<OperatorPreferences> = {};
  const simple = ["captionStyle", "saveHistoryDefault", "profile", "workspaceName"] as const;
  for (const field of simple) {
    const value = imported[field];
    if (value === undefined || value === null) continue;
    const filled = saved[field] === null;
    rows.push({ field, status: filled ? "fill" : "kept" });
    if (filled) Object.assign(patch, { [field]: value });
  }

  const prompt = imported.translationSystemPrompt;
  if (prompt !== undefined && prompt !== null) {
    if (saved.translationSystemPrompt !== null) {
      rows.push({ field: "translationSystemPrompt", status: "kept" });
    } else if (options.allowModelText) {
      rows.push({ field: "translationSystemPrompt", status: "fill" });
      patch.translationSystemPrompt = prompt;
    } else {
      rows.push({ field: "translationSystemPrompt", status: "held", text: prompt });
    }
  }

  const summary = imported.summaryDefaults;
  if (summary) {
    if (saved.summaryDefaults !== null) {
      rows.push({ field: "summaryDefaults", status: "kept" });
    } else {
      const guidance = summary.guidance;
      const allowed = options.allowModelText || guidance === "";
      rows.push({ field: "summaryDefaults", status: "fill" });
      patch.summaryDefaults = { ...summary, guidance: allowed ? guidance : "" };
      if (guidance !== "") rows.push({ field: "summaryGuidance", status: allowed ? "fill" : "held", text: guidance });
    }
  }

  const buffer = (["outputBufferCount", "outputBufferDwellMs"] as const).filter((field) => imported[field] != null);
  if (buffer.length > 0) {
    const filled = buffer.filter((field) => saved[field] === null);
    for (const field of filled) Object.assign(patch, { [field]: imported[field] });
    rows.push({ field: "outputBuffer", status: filled.length > 0 ? "fill" : "kept" });
  }

  if (imported.translationDefaults) {
    const filled = saved.translationDefaults === null;
    rows.push({ field: "translationDefaults", status: filled ? "fill" : "kept" });
    if (filled) patch.translationDefaults = { ...imported.translationDefaults, ...terms };
  }

  if (imported.autoSummary === true) {
    const filled = !saved.autoSummary;
    rows.push({ field: "autoSummary", status: filled ? "fill" : "kept" });
    if (filled) patch.autoSummary = true;
  }

  return { rows, patch };
}
