import { normalizeOperatorPreferences, type OperatorPreferences } from "./preferences";

const ENDPOINT = "/api/live/experience/preferences";

export class PreferencesUnavailableError extends Error {
  constructor(message = "Account preferences are unavailable.") {
    super(message);
    this.name = "PreferencesUnavailableError";
  }
}

async function call(method: "GET" | "POST" | "DELETE", body?: unknown) {
  const response = await fetch(ENDPOINT, {
    method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new PreferencesUnavailableError(result.error);
  return normalizeOperatorPreferences(result);
}

/** Reads the signed-in operator's saved configuration. */
export function loadOperatorPreferences() {
  return call("GET");
}

/** Merges a partial update; `null` clears a field. Returns the stored record. */
export function saveOperatorPreferences(patch: Partial<OperatorPreferences>) {
  return call("POST", patch);
}

export function clearOperatorPreferences() {
  return call("DELETE");
}
