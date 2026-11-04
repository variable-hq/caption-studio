import type { ExperienceEnvironment } from "./contracts";
import { presetLimits } from "./entitlements";
import {
  MAX_PRESET_NAME_CHARS,
  MAX_PRESET_VERSION,
  PresetValidationError,
  isCustomPresetId,
  normalizePreset,
  type CustomPresetId,
  type Preset,
} from "./presets";

/** The workspace's custom presets: one record every operator shares, addressed like the setup record. */
export const WORKSPACE_PRESETS_KEY = "workspace:presets";
export const MAX_CUSTOM_PRESETS_RECORD_BYTES = 64 * 1024;
/** A command carries one preset, or one imported file's presets; the body is bounded before parsing. */
export const MAX_PRESET_COMMAND_BYTES = 80 * 1024;
export const MAX_PRESETS_PER_IMPORT = 64;

/** A stored preset. `modelTextAllowed` gates the model-facing text an imported preset carries. */
export type StoredCustomPreset = { preset: Preset; modelTextAllowed: boolean };

export type CustomPresetsView = {
  presets: StoredCustomPreset[];
  limits: { maxCustomPresets: number; used: number };
};

export type PresetCommand =
  | { action: "create"; preset: unknown }
  | { action: "update"; id: unknown; preset: unknown; modelTextAllowed?: unknown }
  | { action: "delete"; id: unknown }
  | { action: "import"; presets: unknown };

export type PresetCommandFailure = {
  ok: false;
  status: 400 | 404 | 409 | 413;
  code: "invalid" | "not-found" | "limit-reached" | "name-taken" | "too-large";
  error: string;
};

export type PresetCommandResult =
  | { ok: true; presets: StoredCustomPreset[]; created?: CustomPresetId; added?: { fromId: string; id: CustomPresetId }[]; dropped?: number }
  | PresetCommandFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the stored record; an entry that no longer validates is left out rather than served. */
export function normalizeStoredCustomPresets(value: unknown): StoredCustomPreset[] {
  if (!Array.isArray(value)) return [];
  const presets: StoredCustomPreset[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    try {
      const preset = normalizePreset(entry.preset);
      if (isCustomPresetId(preset.id)) presets.push({ preset, modelTextAllowed: entry.modelTextAllowed === true });
    } catch {
      // Stored entries are written only by applyPresetCommand; anything else is skipped.
    }
  }
  return presets;
}

/**
 * The preset as the operator's screens use it: while its model-facing text is not allowed, the
 * summary focus and the starter Terms are left out.
 */
export function effectiveCustomPreset({ preset, modelTextAllowed }: StoredCustomPreset): Preset {
  if (modelTextAllowed || preset.defaults === undefined) return preset;
  const defaults = { ...preset.defaults };
  delete defaults.summaryGuidance;
  delete defaults.starterTerms;
  return { ...preset, defaults };
}

/** An imported preset's model-facing text is held until an operator allows it. */
function holdsModelText(preset: Preset) {
  return preset.defaults?.summaryGuidance !== undefined || preset.defaults?.starterTerms !== undefined;
}

function nameKey(name: string) {
  return name.trim().toLocaleLowerCase("en");
}

/** `Name (2)`, `Name (3)`, … with the base trimmed so the result stays within the name limit. */
function uniqueName(name: string, taken: ReadonlySet<string>) {
  if (!taken.has(nameKey(name))) return name;
  for (let n = 2; ; n += 1) {
    const suffix = ` (${n})`;
    const candidate = `${name.slice(0, MAX_PRESET_NAME_CHARS - suffix.length).trimEnd()}${suffix}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

function failure(status: PresetCommandFailure["status"], code: PresetCommandFailure["code"], error: string): PresetCommandFailure {
  return { ok: false, status, code, error };
}

function invalid(error: unknown): PresetCommandFailure {
  return failure(400, "invalid", error instanceof PresetValidationError ? error.message : "The preset is not valid.");
}

function namesTaken(presets: readonly StoredCustomPreset[], exceptId?: string) {
  return new Set(presets.filter((entry) => entry.preset.id !== exceptId).map((entry) => nameKey(entry.preset.name.en)));
}

/**
 * Applies one command to the stored presets. Creation and import are refused past
 * `maxCustomPresets`; an update or delete is always allowed, so a lowered limit never removes a
 * preset. The server assigns every new id; a preset's id from the request is never kept.
 */
export function applyPresetCommand(
  stored: readonly StoredCustomPreset[],
  command: PresetCommand,
  maxCustomPresets: number,
  newId: () => CustomPresetId,
): PresetCommandResult {
  if (command.action === "create") {
    if (stored.length >= maxCustomPresets) return failure(409, "limit-reached", "The workspace plan has no room for another custom preset.");
    if (!isRecord(command.preset)) return invalid(new PresetValidationError("preset must be an object"));
    const id = newId();
    let preset: Preset;
    try {
      preset = normalizePreset({ ...command.preset, id, version: 1 });
    } catch (error) {
      return invalid(error);
    }
    if (namesTaken(stored).has(nameKey(preset.name.en))) return failure(409, "name-taken", "A custom preset has this name.");
    const next = [...stored, { preset, modelTextAllowed: true }];
    return withinSize({ ok: true, presets: next, created: id });
  }

  if (command.action === "update") {
    if (!isCustomPresetId(command.id)) return failure(404, "not-found", "Custom preset not found.");
    const existing = stored.find((entry) => entry.preset.id === command.id);
    if (!existing) return failure(404, "not-found", "Custom preset not found.");
    if (!isRecord(command.preset)) return invalid(new PresetValidationError("preset must be an object"));
    let preset: Preset;
    try {
      preset = normalizePreset({ ...command.preset, id: command.id, version: Math.min(existing.preset.version + 1, MAX_PRESET_VERSION) });
    } catch (error) {
      return invalid(error);
    }
    if (namesTaken(stored, command.id).has(nameKey(preset.name.en))) return failure(409, "name-taken", "A custom preset has this name.");
    const allowed = typeof command.modelTextAllowed === "boolean" ? command.modelTextAllowed : existing.modelTextAllowed;
    const next = stored.map((entry) => (entry.preset.id === command.id ? { preset, modelTextAllowed: allowed } : entry));
    return withinSize({ ok: true, presets: next });
  }

  if (command.action === "delete") {
    if (!isCustomPresetId(command.id) || !stored.some((entry) => entry.preset.id === command.id)) {
      return failure(404, "not-found", "Custom preset not found.");
    }
    return withinSize({ ok: true, presets: stored.filter((entry) => entry.preset.id !== command.id) });
  }

  if (!Array.isArray(command.presets) || command.presets.length > MAX_PRESETS_PER_IMPORT) {
    return invalid(new PresetValidationError(`presets must be a list of ${MAX_PRESETS_PER_IMPORT} at most`));
  }
  // Every entry is validated before any is kept, so a bad file adds nothing.
  const validated: { fromId: string; preset: Preset }[] = [];
  for (const entry of command.presets) {
    if (!isRecord(entry) || !isCustomPresetId(entry.id)) return invalid(new PresetValidationError("each imported preset needs a custom id"));
    try {
      validated.push({ fromId: entry.id, preset: normalizePreset(entry) });
    } catch (error) {
      return invalid(error);
    }
  }
  const room = Math.max(0, maxCustomPresets - stored.length);
  const kept = validated.slice(0, room);
  const taken = namesTaken(stored);
  const added: { fromId: string; id: CustomPresetId }[] = [];
  const next = [...stored];
  for (const { fromId, preset } of kept) {
    const id = newId();
    const name = uniqueName(preset.name.en, taken);
    taken.add(nameKey(name));
    const renamed: Preset = { ...preset, id, version: 1, name: { ...preset.name, en: name } };
    next.push({ preset: renamed, modelTextAllowed: !holdsModelText(renamed) });
    added.push({ fromId, id });
  }
  return withinSize({ ok: true, presets: next, added, dropped: validated.length - kept.length });
}

function withinSize(result: PresetCommandResult): PresetCommandResult {
  if (!result.ok) return result;
  const bytes = new TextEncoder().encode(JSON.stringify(result.presets)).byteLength;
  return bytes > MAX_CUSTOM_PRESETS_RECORD_BYTES
    ? failure(413, "too-large", "The custom presets are too large to save.")
    : result;
}

export function customPresetsView(presets: readonly StoredCustomPreset[], maxCustomPresets: number): CustomPresetsView {
  return { presets: [...presets], limits: { maxCustomPresets, used: presets.length } };
}

/**
 * The workspace's stored presets for resolving a session's format on the server. Only the stored
 * record is read, never request text; an unreadable record leaves the format as General.
 */
export async function readWorkspaceCustomPresets(env: ExperienceEnvironment | undefined): Promise<Preset[]> {
  if (!env?.OPERATOR_PREFERENCES) return [];
  try {
    const max = presetLimits(env.WORKSPACE_PLAN).maxCustomPresets;
    const target = env.OPERATOR_PREFERENCES.get(env.OPERATOR_PREFERENCES.idFromName(WORKSPACE_PRESETS_KEY));
    const response = await target.fetch(new Request(`https://internal/presets?max=${max}`));
    if (!response.ok) return [];
    const view = (await response.json()) as { presets?: unknown };
    return normalizeStoredCustomPresets(view.presets).map((entry) => entry.preset);
  } catch {
    return [];
  }
}
