import { json } from "./contracts";
import {
  EMPTY_PREFERENCES,
  MAX_PREFERENCES_BYTES,
  mergeOperatorPreferences,
  normalizeOperatorPreferences,
  type OperatorPreferences as PreferenceRecord,
} from "./preferences";
import {
  MAX_PRESET_COMMAND_BYTES,
  applyPresetCommand,
  customPresetsView,
  normalizeStoredCustomPresets,
  type PresetCommand,
  type StoredCustomPreset,
} from "./custom-presets";
import type { CustomPresetId } from "./presets";

const RECORD_KEY = "preferences";
const PRESETS_KEY = "presets";

/**
 * One object per operator identity, addressed by a hashed identity key.
 * Holds only operator-chosen configuration: no captions, audio, credentials, or the
 * identity itself. Each field can be cleared individually or the whole record deleted.
 */
export class OperatorPreferences {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/presets") return this.presets(request, url);
    const path = url.pathname;
    if (path !== "/preferences") return json({ error: "Not found." }, 404);
    if (request.method === "GET") {
      const stored = await this.state.storage.get<PreferenceRecord>(RECORD_KEY);
      return json(stored ? normalizeOperatorPreferences(stored) : EMPTY_PREFERENCES);
    }
    if (request.method === "DELETE") {
      await this.state.storage.delete(RECORD_KEY);
      return json({ ...EMPTY_PREFERENCES });
    }
    if (request.method !== "POST") return json({ error: "Use GET, POST, or DELETE." }, 405);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_PREFERENCES_BYTES) {
      return json({ error: "Preferences are too large." }, 413);
    }
    let patch: unknown;
    try {
      patch = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON request." }, 400);
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return json({ error: "Preferences must be an object." }, 400);
    }
    return this.state.storage.transaction(async (storage) => {
      const stored = await storage.get<PreferenceRecord>(RECORD_KEY);
      const base = stored ? normalizeOperatorPreferences(stored) : EMPTY_PREFERENCES;
      const next = mergeOperatorPreferences(base, patch);
      await storage.put(RECORD_KEY, next);
      return json(next);
    });
  }

  /**
   * The workspace's custom presets (`workspace:presets`). `max` is the plan's allowance, set by the
   * Worker from `WORKSPACE_PLAN`; it is never read from the request.
   */
  private async presets(request: Request, url: URL) {
    const max = Number(url.searchParams.get("max"));
    if (!Number.isInteger(max) || max < 0) return json({ error: "Preset limit is not configured." }, 500);
    if (request.method === "GET") {
      const stored = normalizeStoredCustomPresets(await this.state.storage.get(PRESETS_KEY));
      return json(customPresetsView(stored, max));
    }
    if (request.method !== "POST") return json({ error: "Use GET or POST." }, 405);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_PRESET_COMMAND_BYTES) {
      return json({ error: "Presets are too large." }, 413);
    }
    let command: unknown;
    try {
      command = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON request." }, 400);
    }
    if (!command || typeof command !== "object" || Array.isArray(command) || !["create", "update", "delete", "import"].includes((command as { action?: unknown }).action as string)) {
      return json({ error: "Unknown preset command." }, 400);
    }
    const newId = () => `custom:${crypto.randomUUID()}` as CustomPresetId;
    return this.state.storage.transaction(async (storage) => {
      const stored = normalizeStoredCustomPresets(await storage.get<StoredCustomPreset[]>(PRESETS_KEY));
      const result = applyPresetCommand(stored, command as PresetCommand, max, newId);
      if (!result.ok) return json({ error: result.error, code: result.code }, result.status);
      await storage.put(PRESETS_KEY, result.presets);
      return json({ ...customPresetsView(result.presets, max), created: result.created, added: result.added, dropped: result.dropped });
    });
  }
}
