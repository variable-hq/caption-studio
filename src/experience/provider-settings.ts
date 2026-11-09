import {
  DEFAULT_PROVIDER_SELECTIONS,
  KEYED_PROVIDER_IDS,
  isKeyedProvider,
  normalizeProviderSelections,
  type KeyedProviderId,
  type ProviderSelections,
  type ProviderSettingsView,
} from "@/ai/providers";

/** The one Durable Object name holding the workspace's provider choice and saved keys. */
export const WORKSPACE_PROVIDERS_KEY = "workspace:providers";
export const MAX_PROVIDER_COMMAND_BYTES = 4_096;

export interface StoredProviderKey {
  /** AES-GCM ciphertext bound to the provider; only the Worker can decrypt it. */
  ciphertext: string;
  last4: string;
  savedAt: number;
}

export interface StoredProviderSettings {
  selections: ProviderSelections;
  keys: Partial<Record<KeyedProviderId, StoredProviderKey>>;
}

export const EMPTY_PROVIDER_SETTINGS: StoredProviderSettings = {
  selections: DEFAULT_PROVIDER_SELECTIONS,
  keys: {},
};

/** Commands the Worker sends the Durable Object; a raw key never reaches it. */
export type StoredProviderCommand =
  | { action: "select"; selections: unknown }
  | { action: "set-key"; provider: KeyedProviderId; ciphertext: string; last4: string }
  | { action: "clear-key"; provider: KeyedProviderId };

const CIPHERTEXT_PATTERN = /^[A-Za-z0-9_-]{8,64}\.[A-Za-z0-9_-]{16,1200}$/u;
const LAST4_PATTERN = /^[\x21-\x7e]{4}$/u;

function normalizeStoredKey(value: unknown): StoredProviderKey | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { ciphertext, last4, savedAt } = value as Record<string, unknown>;
  if (typeof ciphertext !== "string" || !CIPHERTEXT_PATTERN.test(ciphertext)) return undefined;
  if (typeof last4 !== "string" || !LAST4_PATTERN.test(last4)) return undefined;
  if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return undefined;
  return { ciphertext, last4, savedAt };
}

export function normalizeStoredProviderSettings(value: unknown): StoredProviderSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawKeys = record.keys && typeof record.keys === "object" ? (record.keys as Record<string, unknown>) : {};
  const keys: StoredProviderSettings["keys"] = {};
  for (const provider of KEYED_PROVIDER_IDS) {
    const key = normalizeStoredKey(rawKeys[provider]);
    if (key) keys[provider] = key;
  }
  return { selections: normalizeProviderSelections(record.selections), keys };
}

/** The browser-safe view: which keys exist and their last four characters, never ciphertext. */
export function providerSettingsView(settings: StoredProviderSettings): ProviderSettingsView {
  const keys: ProviderSettingsView["keys"] = {};
  for (const provider of KEYED_PROVIDER_IDS) {
    const key = settings.keys[provider];
    if (key) keys[provider] = { last4: key.last4, savedAt: key.savedAt };
  }
  return { selections: settings.selections, keys };
}

function providersInUse(selections: ProviderSelections) {
  return new Set([selections.transcription.provider, selections.translation.provider]);
}

export type ProviderCommandResult =
  | { ok: true; settings: StoredProviderSettings }
  | { ok: false; status: number; code: string; error: string };

export function applyProviderCommand(
  settings: StoredProviderSettings,
  command: StoredProviderCommand,
  now: number,
): ProviderCommandResult {
  if (command.action === "select") {
    const selections = normalizeProviderSelections(command.selections);
    for (const provider of providersInUse(selections)) {
      if (isKeyedProvider(provider) && !settings.keys[provider]) {
        return { ok: false, status: 409, code: "provider-key-missing", error: `Save the ${provider} API key before selecting it.` };
      }
    }
    return { ok: true, settings: { ...settings, selections } };
  }
  if (!isKeyedProvider(command.provider)) {
    return { ok: false, status: 400, code: "provider-invalid", error: "Unknown provider." };
  }
  if (command.action === "set-key") {
    const key = normalizeStoredKey({ ciphertext: command.ciphertext, last4: command.last4, savedAt: now });
    if (!key) return { ok: false, status: 400, code: "provider-key-invalid", error: "The provider key is invalid." };
    return { ok: true, settings: { ...settings, keys: { ...settings.keys, [command.provider]: key } } };
  }
  if (providersInUse(settings.selections).has(command.provider)) {
    return { ok: false, status: 409, code: "provider-key-in-use", error: "Switch every stage away from this provider before removing its key." };
  }
  const keys = { ...settings.keys };
  delete keys[command.provider];
  return { ok: true, settings: { ...settings, keys } };
}

export function parseStoredProviderCommand(value: unknown): StoredProviderCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.action === "select") return { action: "select", selections: record.selections };
  if (!isKeyedProvider(record.provider)) return null;
  if (record.action === "clear-key") return { action: "clear-key", provider: record.provider };
  if (record.action === "set-key" && typeof record.ciphertext === "string" && typeof record.last4 === "string") {
    return { action: "set-key", provider: record.provider, ciphertext: record.ciphertext, last4: record.last4 };
  }
  return null;
}
