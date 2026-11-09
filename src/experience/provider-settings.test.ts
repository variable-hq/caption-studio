import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PROVIDER_SELECTIONS,
  isValidApiKeyInput,
  isValidModelIdInput,
  normalizeProviderSelections,
} from "@/ai/providers";
import { decryptProviderKey } from "@/ai/server/provider-key-crypto";
import type { LiveWorkerEnvironment } from "@/live/api";
import { handleExperienceRequest } from "./api";
import type { Namespace } from "./contracts";
import { OperatorPreferences } from "./operator-preferences";
import {
  EMPTY_PROVIDER_SETTINGS,
  applyProviderCommand,
  normalizeStoredProviderSettings,
  providerSettingsView,
  type StoredProviderSettings,
} from "./provider-settings";

vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: async (token: string) => {
    if (!token.endsWith("@example.test")) throw new Error("Unknown Access session.");
    return { payload: { email: token } };
  },
}));

const SECRET = "synthetic-provider-key-secret-0123456789";
const FAKE_KEY = "sk-synthetic-test-key-000000000wxyz";
const CIPHERTEXT = "AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB";

const withOpenAiKey: StoredProviderSettings = {
  ...EMPTY_PROVIDER_SETTINGS,
  keys: { openai: { ciphertext: CIPHERTEXT, last4: "wxyz", savedAt: 1 } },
};

describe("provider selections", () => {
  it("defaults to Groq for both stages and drops unknown or unsafe values", () => {
    expect(normalizeProviderSelections(undefined)).toEqual(DEFAULT_PROVIDER_SELECTIONS);
    expect(normalizeProviderSelections({
      transcription: { provider: "anthropic", model: "x" },
      translation: { provider: "deepseek", model: "bad model id" },
    })).toEqual({
      transcription: DEFAULT_PROVIDER_SELECTIONS.transcription,
      translation: { provider: "deepseek", model: "" },
    });
  });

  it("accepts model ids and keys of the expected shape only", () => {
    expect(isValidModelIdInput("")).toBe(true);
    expect(isValidModelIdInput("openai/gpt-oss-20b")).toBe(true);
    expect(isValidModelIdInput("claude-opus-5-5")).toBe(true);
    expect(isValidModelIdInput("../etc")).toBe(false);
    expect(isValidApiKeyInput(FAKE_KEY)).toBe(true);
    expect(isValidApiKeyInput("short")).toBe(false);
    expect(isValidApiKeyInput("sk-has a space-000000000000")).toBe(false);
  });
});

describe("provider settings commands", () => {
  it("refuses to select a saved-key provider before its key is saved", () => {
    const result = applyProviderCommand(EMPTY_PROVIDER_SETTINGS, {
      action: "select", selections: { transcription: { provider: "openai", model: "" }, translation: { provider: "groq", model: "" } },
    }, 5);
    expect(result).toMatchObject({ ok: false, status: 409, code: "provider-key-missing" });
  });

  it("selects a provider whose key is saved", () => {
    const result = applyProviderCommand(withOpenAiKey, {
      action: "select", selections: { transcription: { provider: "openai", model: "" }, translation: { provider: "openai", model: "gpt-5.4-mini" } },
    }, 5);
    expect(result.ok && result.settings.selections.translation).toEqual({ provider: "openai", model: "gpt-5.4-mini" });
  });

  it("refuses to remove a key a stage still uses, and removes it otherwise", () => {
    const inUse = { ...withOpenAiKey, selections: { ...DEFAULT_PROVIDER_SELECTIONS, translation: { provider: "openai" as const, model: "" } } };
    expect(applyProviderCommand(inUse, { action: "clear-key", provider: "openai" }, 5)).toMatchObject({ ok: false, code: "provider-key-in-use" });
    const cleared = applyProviderCommand(withOpenAiKey, { action: "clear-key", provider: "openai" }, 5);
    expect(cleared.ok && cleared.settings.keys).toEqual({});
  });

  it("never exposes ciphertext in the browser view", () => {
    const view = providerSettingsView(withOpenAiKey);
    expect(view.keys.openai).toEqual({ last4: "wxyz", savedAt: 1 });
    expect(JSON.stringify(view)).not.toContain(CIPHERTEXT);
  });

  it("drops malformed stored keys", () => {
    expect(normalizeStoredProviderSettings({ keys: { openai: { ciphertext: "plain", last4: "wxyz", savedAt: 1 } } }).keys).toEqual({});
  });
});

class Storage {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async delete(key: string) { this.values.delete(key); }
  async transaction<T>(work: (store: Storage) => Promise<T>) { return work(this); }
}

function setup(secret: string | undefined = SECRET) {
  const storage = new Storage();
  const object = new OperatorPreferences({ storage } as unknown as DurableObjectState);
  const names: string[] = [];
  const namespace: Namespace = {
    idFromName: (name) => { names.push(name); return name; },
    get: () => ({ fetch: (request) => object.fetch(request) }),
  };
  const env = {
    OPERATOR_PREFERENCES: namespace,
    ...(secret ? { PROVIDER_KEY_ENCRYPTION_KEY: secret } : {}),
    CLOUDFLARE_ACCESS_AUD: "caption-studio-audience",
    CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://caption-studio.cloudflareaccess.com",
  } as unknown as LiveWorkerEnvironment;
  return { storage, env, names };
}

function request(method: string, body?: unknown, operator = "providers.operator@example.test") {
  return new Request("https://caption.example.test/api/live/experience/providers", {
    method,
    headers: { "cf-access-jwt-assertion": operator },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("experience providers route", () => {
  it("requires an Access-approved operator", async () => {
    const { env } = setup();
    const response = await handleExperienceRequest(new Request("https://caption.example.test/api/live/experience/providers"), env);
    expect(response?.status).toBe(401);
  });

  it("stores only provider-bound ciphertext and returns the last four characters", async () => {
    const { env, storage, names } = setup();
    const response = await handleExperienceRequest(request("POST", { action: "set-key", provider: "openai", apiKey: FAKE_KEY }), env);
    expect(response?.status).toBe(200);
    const body = await response!.json() as { keys: Record<string, { last4: string }> };
    expect(body.keys.openai.last4).toBe("wxyz");
    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    expect(names).toContain("workspace:providers");

    const stored = storage.values.get("providers") as StoredProviderSettings;
    expect(JSON.stringify(stored)).not.toContain(FAKE_KEY);
    await expect(decryptProviderKey("openai", stored.keys.openai!.ciphertext, SECRET)).resolves.toBe(FAKE_KEY);
    await expect(decryptProviderKey("deepseek", stored.keys.openai!.ciphertext, SECRET)).rejects.toThrow();

    const read = await handleExperienceRequest(request("GET"), env);
    expect(JSON.stringify(await read!.json())).not.toContain(stored.keys.openai!.ciphertext);
  });

  it("refuses to save a key without the encryption secret", async () => {
    const { env, storage } = setup("");
    const response = await handleExperienceRequest(request("POST", { action: "set-key", provider: "anthropic", apiKey: FAKE_KEY }), env);
    expect(response?.status).toBe(503);
    expect(await response!.json()).toMatchObject({ code: "provider-key-encryption-unavailable" });
    expect(storage.values.size).toBe(0);
  });

  it("rejects a malformed key before encrypting", async () => {
    const { env, storage } = setup();
    const response = await handleExperienceRequest(request("POST", { action: "set-key", provider: "openai", apiKey: "short" }), env);
    expect(response?.status).toBe(400);
    expect(storage.values.size).toBe(0);
  });
});
