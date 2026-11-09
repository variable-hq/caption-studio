import type { KeyedProviderId, ProviderSelections, ProviderSettingsView } from "@/ai/providers";

const ENDPOINT = "/api/live/experience/providers";

/** A refused request; `code` is the server's reason, shown as its own message. */
export class ProviderSettingsError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ProviderSettingsError";
  }
}

async function call(method: "GET" | "POST", body?: unknown): Promise<ProviderSettingsView> {
  const response = await fetch(ENDPOINT, {
    method,
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = (await response.json().catch(() => ({}))) as Partial<ProviderSettingsView> & { error?: string; code?: string };
  if (!response.ok) throw new ProviderSettingsError(result.code ?? "unavailable", result.error ?? "AI provider settings are unavailable.");
  return result as ProviderSettingsView;
}

/** The workspace's provider choice and which keys are saved (last four characters only). */
export function loadProviderSettings() {
  return call("GET");
}

export function saveProviderSelections(selections: ProviderSelections) {
  return call("POST", { action: "select", selections });
}

/** Sends the key once over the Access-protected route; the Worker encrypts it and never returns it. */
export function saveProviderKey(provider: KeyedProviderId, apiKey: string) {
  return call("POST", { action: "set-key", provider, apiKey });
}

export function clearProviderKey(provider: KeyedProviderId) {
  return call("POST", { action: "clear-key", provider });
}
