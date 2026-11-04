import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSLATION_SYSTEM_PROMPT } from "@/ai/translation-prompt";
import { SUMMARY_MODELS } from "@/experience/contracts";
import { OperatorPreferences as OperatorPreferencesObject } from "@/experience/operator-preferences";
import {
  EMPTY_PREFERENCES,
  SHARED_SETUP_FIELDS,
  effectiveSetup,
  mergeOperatorPreferences,
  normalizeOperatorPreferences,
  operatorIdentityKey,
} from "@/experience/preferences";

class Storage {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async delete(key: string) { this.values.delete(key); }
  async transaction<T>(work: (storage: Storage) => Promise<T>) { return work(this); }
}

function preferencesObject() {
  const storage = new Storage();
  const object = new OperatorPreferencesObject({ storage } as unknown as DurableObjectState);
  return { object, storage };
}

function request(method: string, body?: unknown) {
  return new Request("https://internal/preferences", {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

describe("operator preferences", () => {
  it("merges partial updates, clears fields with null, and ignores unknown values", () => {
    const first = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      theme: "dark",
      uiLocale: "id",
      sidebarWidth: 9_999,
      translationSystemPrompt: " Keep names. ",
      summaryDefaults: { model: SUMMARY_MODELS[1], language: "en", length: "detailed", guidance: "Short." },
      translationDefaults: { sourceLanguage: "id", targetLanguage: "en", keywordText: "Yesus => Jesus", filterText: "", recordingWindowMs: 12_000, inferenceLevel: "high", sanitizeLevel: "balanced", filterInappropriateLanguage: false },
      captionStyle: { fontSize: 40 },
      outputBufferCount: 1,
      outputBufferDwellMs: 5_000,
      autoSummary: true,
      injected: "ignored",
    }, 1_000);
    expect(first.theme).toBe("dark");
    expect(first.uiLocale).toBe("id");
    expect("sidebarWidth" in first).toBe(false);
    expect(first.translationSystemPrompt).toBe("Keep names.");
    expect(first.summaryDefaults?.model).toBe(SUMMARY_MODELS[0]);
    expect(first.translationDefaults?.recordingWindowMs).toBe(14_000);
    expect(first.translationDefaults?.inferenceLevel).toBe("high");
    expect(first.translationDefaults?.sanitizeLevel).toBe("balanced");
    expect(first.translationDefaults?.filterInappropriateLanguage).toBe(false);
    expect(first.captionStyle?.fontSize).toBe(40);
    expect(first.outputBufferCount).toBe(1);
    expect(first.outputBufferDwellMs).toBe(5_000);
    expect("liveDraftsEnabled" in first).toBe(false);
    expect("tutorialDismissed" in first).toBe(false);
    expect(first.updatedAt).toBe(1_000);
    expect("injected" in first).toBe(false);

    const second = mergeOperatorPreferences(first, { translationSystemPrompt: null, theme: "purple", uiLocale: "fr", outputBufferCount: null, outputBufferDwellMs: null, liveDraftsEnabled: null }, 2_000);
    expect(second.translationSystemPrompt).toBeNull();
    expect(second.theme).toBe("system");
    expect(second.uiLocale).toBeNull();
    expect(second.summaryDefaults).toEqual(first.summaryDefaults);
    expect(second.outputBufferCount).toBeNull();
    expect(second.outputBufferDwellMs).toBeNull();
    expect("liveDraftsEnabled" in second).toBe(false);
    expect(second.updatedAt).toBe(2_000);
  });

  it("round-trips Dynamic as the shared recording-window default", () => {
    const saved = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      translationDefaults: {
        sourceLanguage: "id",
        targetLanguage: "en",
        keywordText: "",
        filterText: "",
        recordingWindowMs: "dynamic",
      },
    });
    expect(saved.translationDefaults?.recordingWindowMs).toBe("dynamic");
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, saved).translationDefaults?.recordingWindowMs).toBe("dynamic");
  });

  it("drops invalid prompts and malformed records instead of storing them", () => {
    const merged = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      translationSystemPrompt: "Bad\u0000prompt",
      translationDefaults: "nope",
      captionStyle: 3,
      outputBufferCount: 2,
      outputBufferDwellMs: 999,
    });
    expect(merged.translationSystemPrompt).toBeNull();
    expect(merged.translationDefaults).toBeNull();
    expect(merged.captionStyle).toBeNull();
    expect(merged.outputBufferCount).toBe(0);
    expect(merged.outputBufferDwellMs).toBe(3_000);
    expect(normalizeOperatorPreferences("{broken")).toEqual(EMPTY_PREFERENCES);
    expect(normalizeOperatorPreferences({ updatedAt: -5, theme: "light" })).toMatchObject({ theme: "light", updatedAt: null });
    expect(normalizeOperatorPreferences({ translationSystemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT }).translationSystemPrompt)
      .toBe(DEFAULT_TRANSLATION_SYSTEM_PROMPT);
  });

  it("migrates a translationDefaults record saved under the old speechBufferMs key", () => {
    const legacy = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      translationDefaults: { sourceLanguage: "id", targetLanguage: "en", keywordText: "", filterText: "", speechBufferMs: 15_000 },
    });
    expect(legacy.translationDefaults?.recordingWindowMs).toBe(14_000);
    expect(legacy.translationDefaults?.sanitizeLevel).toBe("off");
    expect(legacy.translationDefaults?.filterInappropriateLanguage).toBe(true);

    // A record already carrying the current key is never overridden by a stale legacy one.
    const both = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      translationDefaults: { sourceLanguage: "id", targetLanguage: "en", keywordText: "", filterText: "", recordingWindowMs: 9_000, speechBufferMs: 15_000 },
    });
    expect(both.translationDefaults?.recordingWindowMs).toBe(10_000);
  });

  it("does not let an unrelated save wipe a legacy-keyed recording window default", async () => {
    const { object, storage } = preferencesObject();
    // Simulates a record written before the speechBufferMs -> recordingWindowMs rename.
    await storage.put("preferences", {
      ...EMPTY_PREFERENCES,
      translationDefaults: { sourceLanguage: "id", targetLanguage: "en", keywordText: "", filterText: "", speechBufferMs: 15_000 },
    });

    const read = await (await object.fetch(request("GET"))).json() as Record<string, { recordingWindowMs?: number }>;
    expect(read.translationDefaults?.recordingWindowMs).toBe(14_000);

    const afterUnrelatedSave = await (await object.fetch(request("POST", { theme: "dark" }))).json() as Record<string, { recordingWindowMs?: number }>;
    expect(afterUnrelatedSave.translationDefaults?.recordingWindowMs).toBe(14_000);
  });

  it("derives a stable, non-reversible key from the operator identity", async () => {
    const a = await operatorIdentityKey("Operator@Example.org ");
    const b = await operatorIdentityKey("operator@example.org");
    expect(a).toBe(b);
    expect(a).toMatch(/^operator:[0-9a-f]{64}$/);
    expect(a).not.toContain("example");
  });

  it("stores, merges, bounds, and deletes through the Durable Object", async () => {
    const { object, storage } = preferencesObject();
    expect(await (await object.fetch(request("GET"))).json()).toEqual(EMPTY_PREFERENCES);

    const saved = await (await object.fetch(request("POST", { theme: "dark", uiLocale: "id", autoSummary: true }))).json() as Record<string, unknown>;
    expect(saved.theme).toBe("dark");
    expect(saved.uiLocale).toBe("id");
    expect(saved.autoSummary).toBe(true);
    expect(storage.values.has("preferences")).toBe(true);

    const merged = await (await object.fetch(request("POST", { saveHistoryDefault: true }))).json() as Record<string, unknown>;
    expect(merged.theme).toBe("dark");
    expect(merged.saveHistoryDefault).toBe(true);

    expect((await object.fetch(request("POST", "[1]"))).status).toBe(400);
    expect((await object.fetch(request("POST", "{"))).status).toBe(400);
    expect((await object.fetch(request("POST", { guidance: "x".repeat(40_000) }))).status).toBe(413);
    expect((await object.fetch(request("PUT", {}))).status).toBe(405);

    expect(await (await object.fetch(request("DELETE"))).json()).toEqual(EMPTY_PREFERENCES);
    expect(storage.values.has("preferences")).toBe(false);
  });
  it("keeps the history-saving default and automatic summary opt-in strictly boolean", () => {
    const saved = mergeOperatorPreferences(EMPTY_PREFERENCES, { saveHistoryDefault: true, autoSummary: true }, 1);
    expect(saved).toMatchObject({ saveHistoryDefault: true, autoSummary: true });
    expect(mergeOperatorPreferences(saved, { saveHistoryDefault: "yes", autoSummary: "yes" }, 2))
      .toMatchObject({ saveHistoryDefault: false, autoSummary: false });
    expect(mergeOperatorPreferences(saved, { saveHistoryDefault: null }, 3))
      .toMatchObject({ saveHistoryDefault: null, autoSummary: true });
    expect(normalizeOperatorPreferences({})).toMatchObject({ saveHistoryDefault: null, autoSummary: false });
  });
});

describe("shared setup", () => {
  const personal = mergeOperatorPreferences(EMPTY_PREFERENCES, {
    theme: "dark",
    uiLocale: "id",
    translationSystemPrompt: "Mine.",
    captionStyle: { fontSize: 40 },
    autoSummary: true,
  }, 1_000);

  it("keeps an operator's own setup until anyone saves the shared setup", () => {
    expect(effectiveSetup(EMPTY_PREFERENCES, personal)).toEqual(personal);
    expect(SHARED_SETUP_FIELDS).not.toContain("uiLocale");
  });

  it("prefers the shared setup, falls back per field, and keeps the theme personal", () => {
    const shared = mergeOperatorPreferences(EMPTY_PREFERENCES, { captionStyle: { fontSize: 64 }, autoSummary: false }, 2_000);
    const setup = effectiveSetup(shared, personal);
    expect(setup.captionStyle?.fontSize).toBe(64);
    expect(setup.translationSystemPrompt).toBe("Mine.");
    expect(setup.autoSummary).toBe(false);
    expect(setup.theme).toBe("dark");
    expect(setup.uiLocale).toBe("id");
    expect(setup.updatedAt).toBe(2_000);
  });
});

describe("workspace name in the setup record", () => {
  it("keeps a trimmed valid name and drops invalid ones to the default", () => {
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { workspaceName: "  Gereja Sion  " }).workspaceName).toBe("Gereja Sion");
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { workspaceName: "Gereja\nSion" }).workspaceName).toBeNull();
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { workspaceName: "a".repeat(61) }).workspaceName).toBeNull();
    const saved = mergeOperatorPreferences(EMPTY_PREFERENCES, { workspaceName: "Gereja Sion" });
    expect(mergeOperatorPreferences(saved, { workspaceName: null }).workspaceName).toBeNull();
  });

  it("shares the name through the shared setup fields", () => {
    expect(SHARED_SETUP_FIELDS).toContain("workspaceName");
    const shared = mergeOperatorPreferences(EMPTY_PREFERENCES, { workspaceName: "Gereja Sion" }, 1_000);
    expect(effectiveSetup(shared, EMPTY_PREFERENCES).workspaceName).toBe("Gereja Sion");
    expect(effectiveSetup(EMPTY_PREFERENCES, { ...EMPTY_PREFERENCES, workspaceName: "Gereja Lama" }).workspaceName).toBe("Gereja Lama");
  });

  it("reads a record stored before the name existed as the default name", () => {
    const stored: Partial<typeof EMPTY_PREFERENCES> = { ...EMPTY_PREFERENCES, updatedAt: 5 };
    delete stored.workspaceName;
    expect(normalizeOperatorPreferences(stored).workspaceName).toBeNull();
  });

  it("leaves the name unchanged when a preset is applied", () => {
    const saved = mergeOperatorPreferences(EMPTY_PREFERENCES, { workspaceName: "Gereja Sion" });
    expect(mergeOperatorPreferences(saved, { profile: "builtin:sermon" }).workspaceName).toBe("Gereja Sion");
  });
});

describe("workspace profile in the setup record", () => {
  it("keeps a known profile and drops unknown ones", () => {
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { profile: "builtin:sermon" }).profile).toBe("builtin:sermon");
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { profile: "builtin:market" }).profile).toBeNull();
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { profile: "custom:3f2a9c1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b" }).profile).toBe("custom:3f2a9c1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b");
    expect(mergeOperatorPreferences(EMPTY_PREFERENCES, { profile: "custom:not-a-uuid" }).profile).toBeNull();
    const saved = mergeOperatorPreferences(EMPTY_PREFERENCES, { profile: "builtin:keynote" });
    expect(mergeOperatorPreferences(saved, { profile: null }).profile).toBeNull();
  });

  it("shares the profile through the shared setup fields", () => {
    expect(SHARED_SETUP_FIELDS).toContain("profile");
    const shared = mergeOperatorPreferences(EMPTY_PREFERENCES, { profile: "builtin:talkshow" }, 1_000);
    expect(effectiveSetup(shared, EMPTY_PREFERENCES).profile).toBe("builtin:talkshow");
    expect(effectiveSetup(EMPTY_PREFERENCES, { ...EMPTY_PREFERENCES, profile: "builtin:sermon" }).profile).toBe("builtin:sermon");
  });

  it("reads a record stored before the profile existed as General", () => {
    const stored: Partial<typeof EMPTY_PREFERENCES> = { ...EMPTY_PREFERENCES, updatedAt: 5 };
    delete stored.profile;
    expect(normalizeOperatorPreferences(stored).profile).toBeNull();
  });
});
