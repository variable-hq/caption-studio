import { normalizeOperatorPreferences, type OperatorPreferences } from "./preferences";

const PERSONAL = "/api/live/experience/preferences";
const SHARED = "/api/live/experience/setup";

export class PreferencesUnavailableError extends Error {
  constructor(message = "Account preferences are unavailable.") {
    super(message);
    this.name = "PreferencesUnavailableError";
  }
}

async function call(endpoint: string, method: "GET" | "POST" | "DELETE", body?: unknown) {
  const response = await fetch(endpoint, {
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

/** Reads the signed-in operator's own record (their theme, and setup saved before ADR 0022). */
export function loadOperatorPreferences() {
  return call(PERSONAL, "GET");
}

/** Merges a partial update into the operator's own record; `null` clears a field. */
export function saveOperatorPreferences(patch: Partial<OperatorPreferences>) {
  return call(PERSONAL, "POST", patch);
}

export function clearOperatorPreferences() {
  return call(PERSONAL, "DELETE");
}

/** Reads the shared setup every operator shares. */
export function loadSharedSetup() {
  return call(SHARED, "GET");
}

/** Merges a partial update into the shared setup; `null` clears a field. */
export function saveSharedSetup(patch: Partial<OperatorPreferences>) {
  return call(SHARED, "POST", patch);
}
