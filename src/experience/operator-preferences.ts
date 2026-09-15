import { json } from "./contracts";
import {
  EMPTY_PREFERENCES,
  MAX_PREFERENCES_BYTES,
  mergeOperatorPreferences,
  normalizeOperatorPreferences,
  type OperatorPreferences as PreferenceRecord,
} from "./preferences";

const RECORD_KEY = "preferences";

/**
 * One object per operator identity, addressed by a hashed identity key.
 * Holds only operator-chosen configuration: no captions, audio, credentials, or the
 * identity itself. Each field can be cleared individually or the whole record deleted.
 */
export class OperatorPreferences {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
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
}
