import { describe, expect, it } from "vitest";

import { OperatorPreferences as OperatorPreferencesObject } from "@/experience/operator-preferences";

import {
  MAX_CUSTOM_PRESETS_RECORD_BYTES,
  MAX_PRESETS_PER_IMPORT,
  applyPresetCommand,
  effectiveCustomPreset,
  isUnresolvedCustomFormat,
  normalizeStoredCustomPresets,
  readWorkspaceCustomPresets,
  type StoredCustomPreset,
} from "@/experience/custom-presets";
import { GENERAL_PRESET, normalizePreset, presetTermParams, resolveWorkspacePreset, type CustomPresetId, type Preset } from "@/experience/presets";

const CUSTOM_A = "custom:3f2a9c1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b" as const;

let counter = 0;
/** Deterministic ids in the custom format, so each assertion can name them. */
const newId = () => {
  counter += 1;
  return `custom:${String(counter).padStart(8, "0")}-0000-4000-8000-000000000000` as CustomPresetId;
};

function raw(name: string, extra: Record<string, unknown> = {}, id: string = CUSTOM_A) {
  return {
    schemaVersion: 1,
    version: 1,
    id,
    name: { en: name },
    description: { en: "A workspace format." },
    terms: {
      en: {
        session: { singular: "service", plural: "services" },
        speaker: { singular: "speaker", plural: "speakers" },
        audience: { singular: "audience", plural: "audiences" },
        transcripts: { singular: "transcripts" },
      },
    },
    ...extra,
  };
}

/** A stored preset with its own id, as the server would hold it. */
function stored(name: string, options: { modelTextAllowed?: boolean; extra?: Record<string, unknown> } = {}): StoredCustomPreset {
  return {
    preset: normalizePreset(raw(name, options.extra, newId())),
    modelTextAllowed: options.modelTextAllowed ?? true,
  };
}

const NONE: StoredCustomPreset[] = [];

describe("custom preset commands", () => {
  it("creates a preset under a server-assigned id, ignoring any id the request sends", () => {
    const result = applyPresetCommand(NONE, { action: "create", preset: raw("Retreat") }, 5, newId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toMatch(/^custom:/u);
    expect(result.created).toBe(result.presets[0].preset.id);
    expect(result.presets).toHaveLength(1);
    expect(result.presets[0]).toMatchObject({ modelTextAllowed: true, preset: { name: { en: "Retreat" }, version: 1 } });
    expect(result.presets[0].preset.id).toMatch(/^custom:/u);
    expect(result.presets[0].preset.id).not.toBe(CUSTOM_A);
  });

  it("refuses creation at the plan limit, and at zero on the free plan", () => {
    expect(applyPresetCommand(NONE, { action: "create", preset: raw("Retreat") }, 0, newId)).toMatchObject({ ok: false, status: 409, code: "limit-reached" });
    const full = [stored("One"), stored("Two")];
    expect(applyPresetCommand(full, { action: "create", preset: raw("Three") }, 2, newId)).toMatchObject({ ok: false, code: "limit-reached" });
    expect(applyPresetCommand(full, { action: "create", preset: raw("Three") }, 3, newId)).toMatchObject({ ok: true });
  });

  it("refuses a name another custom preset already uses, ignoring case", () => {
    const result = applyPresetCommand([stored("Retreat")], { action: "create", preset: raw("retreat ") }, 5, newId);
    expect(result).toMatchObject({ ok: false, status: 409, code: "name-taken" });
  });

  it("refuses model-facing fields on a custom preset and any malformed value", () => {
    for (const extra of [{ transcriptionPrefix: { en: "Sermon." } }, { translationRule: "Context." }, { summaryFraming: "a sermon" }, { messageOverrides: { en: {} } }]) {
      expect(applyPresetCommand(NONE, { action: "create", preset: raw("Retreat", extra) }, 5, newId)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(applyPresetCommand(NONE, { action: "create", preset: "not an object" }, 5, newId)).toMatchObject({ ok: false, code: "invalid" });
    expect(applyPresetCommand(NONE, { action: "create", preset: raw("Retreat", { defaults: { outputBufferCount: 9 } }) }, 5, newId))
      .toMatchObject({ ok: false, code: "invalid" });
  });

  it("updates a preset in place, bumps its version and keeps its held-text flag unless told otherwise", () => {
    const existing = [stored("Retreat", { modelTextAllowed: false })];
    const id = existing[0].preset.id as CustomPresetId;
    const result = applyPresetCommand(existing, { action: "update", id, preset: raw("Weekend retreat") }, 5, newId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.presets[0]).toMatchObject({ modelTextAllowed: false, preset: { id, name: { en: "Weekend retreat" }, version: 2 } });
    const allowed = applyPresetCommand(existing, { action: "update", id, preset: raw("Retreat"), modelTextAllowed: true }, 5, newId);
    expect(allowed.ok && allowed.presets[0].modelTextAllowed).toBe(true);
  });

  it("refuses an update to an unknown id, or one that takes another preset's name", () => {
    expect(applyPresetCommand(NONE, { action: "update", id: CUSTOM_A, preset: raw("Retreat") }, 5, newId)).toMatchObject({ ok: false, status: 404 });
    const two = [stored("One"), stored("Two")];
    const id = two[0].preset.id as CustomPresetId;
    expect(applyPresetCommand(two, { action: "update", id, preset: raw("Two") }, 5, newId)).toMatchObject({ ok: false, code: "name-taken" });
  });

  it("allows edits and deletes above a lowered limit, so nothing is removed by a lower plan", () => {
    const over = [stored("One"), stored("Two"), stored("Three")];
    const id = over[2].preset.id as CustomPresetId;
    expect(applyPresetCommand(over, { action: "update", id, preset: raw("Three, edited") }, 1, newId).ok).toBe(true);
    const deleted = applyPresetCommand(over, { action: "delete", id }, 1, newId);
    expect(deleted.ok && deleted.presets.map((entry) => entry.preset.name.en)).toEqual(["One", "Two"]);
    expect(applyPresetCommand(over, { action: "create", preset: raw("Four") }, 1, newId)).toMatchObject({ ok: false, code: "limit-reached" });
  });

  it("deletes a known preset and refuses an unknown or built-in id", () => {
    const one = [stored("One")];
    const id = one[0].preset.id as CustomPresetId;
    expect(applyPresetCommand(one, { action: "delete", id }, 5, newId)).toEqual({ ok: true, presets: [] });
    expect(applyPresetCommand(one, { action: "delete", id: "custom:not-a-uuid" }, 5, newId)).toMatchObject({ ok: false, status: 404 });
    expect(applyPresetCommand(one, { action: "delete", id: "builtin:sermon" }, 5, newId)).toMatchObject({ ok: false, status: 404 });
  });

  it("imports up to the room left under the limit, renames a clash and reports what was dropped", () => {
    const result = applyPresetCommand(
      [stored("Retreat")],
      { action: "import", presets: [raw("Retreat"), raw("Camp"), raw("Youth", { summaryFraming: undefined })] },
      3,
      newId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.presets.map((entry) => entry.preset.name.en)).toEqual(["Retreat", "Retreat (2)", "Camp"]);
    expect(result.added?.map((entry) => entry.fromId)).toEqual([CUSTOM_A, CUSTOM_A]);
    expect(result.dropped).toBe(1);
  });

  it("holds an imported preset's summary focus and starter Terms until allowed, and keeps a clash name within the limit", () => {
    const longName = "A".repeat(40);
    const result = applyPresetCommand(
      [stored(longName)],
      {
        action: "import",
        presets: [raw(longName, { defaults: { summaryGuidance: "theme", starterTerms: [{ word: "Musa", translation: "Moses" }] } })],
      },
      5,
      newId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.presets[1]).toMatchObject({ modelTextAllowed: false });
    expect(result.presets[1].preset.name.en.length).toBeLessThanOrEqual(40);
    expect(result.presets[1].preset.name.en.endsWith(" (2)")).toBe(true);
  });

  it("keeps an imported preset without model-facing text allowed from the start", () => {
    const result = applyPresetCommand(NONE, { action: "import", presets: [raw("Camp", { defaults: { outputBufferCount: 0 } })] }, 5, newId);
    expect(result.ok && result.presets[0].modelTextAllowed).toBe(true);
  });

  it("refuses the whole import when any entry is invalid, and an entry with a built-in id", () => {
    const bad = applyPresetCommand(NONE, { action: "import", presets: [raw("Camp"), raw("Youth", { translationRule: "x" })] }, 5, newId);
    expect(bad).toMatchObject({ ok: false, code: "invalid" });
    const builtIn = applyPresetCommand(NONE, { action: "import", presets: [{ ...raw("Camp"), id: "builtin:sermon" }] }, 5, newId);
    expect(builtIn).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses an import longer than the list bound", () => {
    const many = Array.from({ length: MAX_PRESETS_PER_IMPORT + 1 }, (_, index) => raw(`Preset ${index}`));
    expect(applyPresetCommand(NONE, { action: "import", presets: many }, 500, newId)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses a result over the stored record bound", () => {
    const terms = Array.from({ length: 40 }, (_, index) => ({ word: `Word ${index} ${"x".repeat(28)}`, translation: "y".repeat(40) }));
    const heavy = Array.from({ length: 20 }, (_, index) => stored(`Heavy ${index}`, { extra: { defaults: { starterTerms: terms } } }));
    const size = (list: StoredCustomPreset[]) => new TextEncoder().encode(JSON.stringify(list)).byteLength;
    // The largest stored set that still fits; one more preset of this size must then be refused.
    let count = 0;
    while (size(heavy.slice(0, count + 1)) <= MAX_CUSTOM_PRESETS_RECORD_BYTES) count += 1;
    expect(size(heavy.slice(0, count))).toBeLessThanOrEqual(MAX_CUSTOM_PRESETS_RECORD_BYTES);
    const result = applyPresetCommand(heavy.slice(0, count), { action: "create", preset: raw("One more", { defaults: { starterTerms: terms } }) }, 100, newId);
    expect(result).toMatchObject({ ok: false, status: 413, code: "too-large" });
  });
});

describe("stored custom presets", () => {
  it("reads only valid custom entries, and skips the rest", () => {
    const read = normalizeStoredCustomPresets([
      { preset: raw("Retreat"), modelTextAllowed: true },
      { preset: { ...raw("Market"), id: "builtin:market" }, modelTextAllowed: true },
      { preset: "junk" },
      null,
    ]);
    expect(read.map((entry) => entry.preset.name.en)).toEqual(["Retreat"]);
    expect(normalizeStoredCustomPresets("not a list")).toEqual([]);
  });

  it("hides held model-facing text from the screens until it is allowed", () => {
    const withText = stored("Camp", { modelTextAllowed: false, extra: { defaults: { summaryGuidance: "theme", starterTerms: [{ word: "Musa", translation: "Moses" }], outputBufferCount: 0 } } });
    const held = effectiveCustomPreset(withText);
    expect(held.defaults).toEqual({ outputBufferCount: 0 });
    const allowed = effectiveCustomPreset({ ...withText, modelTextAllowed: true });
    expect(allowed.defaults?.summaryGuidance).toBe("theme");
  });
});

describe("unresolved custom formats", () => {
  it("flags a custom id that no preset of the workspace has", () => {
    const preset = normalizePreset(raw("Retreat"));
    expect(isUnresolvedCustomFormat(CUSTOM_A, [preset])).toBe(false);
    expect(isUnresolvedCustomFormat(CUSTOM_A, [])).toBe(true);
    expect(isUnresolvedCustomFormat("builtin:sermon", [])).toBe(false);
    expect(isUnresolvedCustomFormat(undefined, [])).toBe(false);
  });
});

describe("resolving a custom format", () => {
  const preset = normalizePreset(raw("Retreat"));

  it("resolves a custom id from the workspace's presets, and a deleted or unknown one to General", () => {
    expect(resolveWorkspacePreset(CUSTOM_A, [preset]).name.en).toBe("Retreat");
    expect(resolveWorkspacePreset(CUSTOM_A, []).id).toBe(GENERAL_PRESET.id);
    expect(resolveWorkspacePreset("custom:not-a-uuid", [preset]).id).toBe(GENERAL_PRESET.id);
  });

  it("uses General's Indonesian terms when a custom preset gives only English", () => {
    const params = presetTermParams(preset, "id", GENERAL_PRESET);
    expect(params.term_session).toBe("sesi");
    const english = presetTermParams(preset, "en", GENERAL_PRESET);
    expect(english.term_session).toBe("service");
  });

  it("reads the stored presets on the server, and treats a failed read as none", async () => {
    expect(await readWorkspaceCustomPresets(undefined)).toEqual([]);
    const env = {
      OPERATOR_PREFERENCES: {
        idFromName: (name: string) => name,
        get: () => ({
          fetch: async () => new Response(JSON.stringify({ presets: [{ preset: raw("Retreat"), modelTextAllowed: true }] })),
        }),
      },
    };
    const read: Preset[] = await readWorkspaceCustomPresets(env);
    expect(read.map((entry) => entry.name.en)).toEqual(["Retreat"]);
    const failing = { OPERATOR_PREFERENCES: { idFromName: (name: string) => name, get: () => ({ fetch: async () => new Response("", { status: 503 }) }) } };
    expect(await readWorkspaceCustomPresets(failing)).toEqual([]);
  });
});

class MemoryStorage {
  values = new Map<string, unknown>();
  async get<T>(key: string) { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async transaction<T>(work: (storage: MemoryStorage) => Promise<T>) { return work(this); }
}

describe("workspace presets route", () => {
  function route() {
    const storage = new MemoryStorage();
    const object = new OperatorPreferencesObject({ storage } as unknown as DurableObjectState);
    const call = (method: string, body?: unknown, max = "2") => object.fetch(new Request(`https://internal/presets?max=${max}`, {
      method, headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    }));
    return { call, storage };
  }

  it("creates, lists and refuses creation past the limit, with the limit from the query", async () => {
    const { call } = route();
    const created = await call("POST", { action: "create", preset: raw("Retreat") });
    expect(created.status).toBe(200);
    const body = await created.json() as { presets: { preset: { name: { en: string } } }[]; limits: { maxCustomPresets: number; used: number } };
    expect(body.presets.map((entry) => entry.preset.name.en)).toEqual(["Retreat"]);
    expect(body.limits).toEqual({ maxCustomPresets: 2, used: 1 });
    const listed = await (await call("GET")).json() as { limits: { used: number } };
    expect(listed.limits.used).toBe(1);
    expect((await call("POST", { action: "create", preset: raw("Camp") }, "1")).status).toBe(409);
  });

  it("refuses a malformed command, an unknown action and an oversized body", async () => {
    const { call } = route();
    expect((await call("POST", "{not json")).status).toBe(400);
    expect((await call("POST", { action: "rename" })).status).toBe(400);
    expect((await call("POST", "[]")).status).toBe(400);
    expect((await call("POST", "x".repeat(81 * 1024))).status).toBe(413);
    expect((await call("PUT", { action: "create" })).status).toBe(405);
    expect((await call("GET", undefined, "-1")).status).toBe(500);
  });

  it("writes nothing when a creation is refused", async () => {
    const { call, storage } = route();
    await call("POST", { action: "create", preset: raw("Retreat") }, "0");
    expect(storage.values.has("presets")).toBe(false);
  });
});
