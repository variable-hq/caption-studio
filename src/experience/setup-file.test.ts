import { describe, expect, it } from "vitest";

import {
  MAX_SETUP_FILE_BYTES,
  SETUP_FILE_KIND,
  buildSetupFile,
  parseSetupFile,
  planSetupImport,
} from "@/experience/setup-file";
import { EMPTY_PREFERENCES, SHARED_SETUP_FIELDS, mergeOperatorPreferences, type OperatorPreferences } from "@/experience/preferences";

const TERMS = { keywordText: "Gereja Sion, Yesus", filterText: "" };
const NO_MODEL_TEXT = { allowModelText: false };
const ALLOW_MODEL_TEXT = { allowModelText: true };
const SAVED: OperatorPreferences = mergeOperatorPreferences(
  EMPTY_PREFERENCES,
  {
    profile: "builtin:sermon",
    workspaceName: "Gereja Sion",
    outputBufferCount: 1,
    translationDefaults: {
      sourceLanguage: "id",
      targetLanguage: "en",
      keywordText: "Saved term",
      filterText: "",
      recordingWindowMs: 10000,
      inferenceLevel: "balanced",
      sanitizeLevel: "balanced",
      filterInappropriateLanguage: true,
    },
  },
  1_000,
);

function fileText(value: unknown) {
  return JSON.stringify(value);
}

describe("setup file export", () => {
  it("writes only the saved shared settings, with the kind and version", () => {
    const file = buildSetupFile(SAVED);
    expect(file.kind).toBe(SETUP_FILE_KIND);
    expect(file.schemaVersion).toBe(1);
    for (const key of Object.keys(file)) {
      expect(["kind", "schemaVersion", ...SHARED_SETUP_FIELDS]).toContain(key);
    }
    expect(file).not.toHaveProperty("captionStyle");
    expect(file).not.toHaveProperty("summaryDefaults");
  });

  it("leaves the Terms out of the export", () => {
    const translation = buildSetupFile(SAVED).translationDefaults as Record<string, unknown>;
    expect(translation).not.toHaveProperty("keywordText");
    expect(translation).not.toHaveProperty("filterText");
    expect(translation.recordingWindowMs).toBe(10000);
  });

  it("round-trips through the parser to the same saved values", () => {
    const result = parseSetupFile(fileText(buildSetupFile(SAVED)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.setup.profile).toBe("builtin:sermon");
    expect(result.setup.workspaceName).toBe("Gereja Sion");
    expect(result.setup.outputBufferCount).toBe(1);
    expect(result.setup.translationDefaults?.recordingWindowMs).toBe(10000);
  });
});

describe("setup file parsing", () => {
  it("accepts a file exactly at the size limit and refuses one byte more", () => {
    const base = fileText({ kind: SETUP_FILE_KIND, schemaVersion: 1 });
    const atLimit = base + " ".repeat(MAX_SETUP_FILE_BYTES - base.length);
    expect(parseSetupFile(atLimit).ok).toBe(true);
    expect(parseSetupFile(atLimit + " ")).toEqual({ ok: false, failure: { reason: "too-large" } });
  });

  it("refuses text that is not JSON", () => {
    expect(parseSetupFile("kind: caption-studio-setup")).toEqual({ ok: false, failure: { reason: "not-json" } });
  });

  it("refuses another kind of file", () => {
    expect(parseSetupFile(fileText({ kind: "caption-studio-terms", schemaVersion: 1 }))).toEqual({
      ok: false,
      failure: { reason: "not-setup-file" },
    });
    expect(parseSetupFile("[]")).toEqual({ ok: false, failure: { reason: "not-setup-file" } });
  });

  it("refuses an unknown schema version", () => {
    expect(parseSetupFile(fileText({ kind: SETUP_FILE_KIND, schemaVersion: 2 }))).toEqual({
      ok: false,
      failure: { reason: "unsupported-version" },
    });
    expect(parseSetupFile(fileText({ kind: SETUP_FILE_KIND }))).toEqual({
      ok: false,
      failure: { reason: "unsupported-version" },
    });
  });

  it("refuses an unknown top-level field", () => {
    expect(parseSetupFile(fileText({ kind: SETUP_FILE_KIND, schemaVersion: 1, apiKey: "x" }))).toEqual({
      ok: false,
      failure: { reason: "unknown-field", field: "apiKey" },
    });
  });

  it("refuses an unknown field inside a nested setting, including Terms", () => {
    const nested = (field: string, value: unknown) =>
      parseSetupFile(fileText({ kind: SETUP_FILE_KIND, schemaVersion: 1, [field]: value }));
    expect(nested("translationDefaults", { recordingWindowMs: 6000, keywordText: "x" })).toEqual({
      ok: false,
      failure: { reason: "unknown-field", field: "translationDefaults.keywordText" },
    });
    expect(nested("summaryDefaults", { length: "short", extra: 1 })).toEqual({
      ok: false,
      failure: { reason: "unknown-field", field: "summaryDefaults.extra" },
    });
    expect(nested("captionStyle", { fontSize: 48, extra: 1 })).toEqual({
      ok: false,
      failure: { reason: "unknown-field", field: "captionStyle.extra" },
    });
  });

  it("normalizes values, dropping any that are not valid settings", () => {
    const result = parseSetupFile(
      fileText({
        kind: SETUP_FILE_KIND,
        schemaVersion: 1,
        profile: "builtin:market",
        workspaceName: "Gereja\nSion",
        outputBufferCount: 9,
        translationDefaults: { recordingWindowMs: 6000 },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.setup).not.toHaveProperty("profile");
    expect(result.setup).not.toHaveProperty("workspaceName");
    expect([0, 1]).toContain(result.setup.outputBufferCount);
    expect(result.setup.translationDefaults?.recordingWindowMs).toBe(6000);
  });
});

describe("setup import plan", () => {
  const FILE = mergeOperatorPreferences(EMPTY_PREFERENCES, {
    profile: "builtin:talkshow",
    workspaceName: "Gereja Baru",
    outputBufferCount: 0,
    outputBufferDwellMs: 3000,
    translationDefaults: {
      sourceLanguage: "auto",
      targetLanguage: "en",
      keywordText: "",
      filterText: "",
      recordingWindowMs: 14000,
      inferenceLevel: "low",
      sanitizeLevel: "off",
      filterInappropriateLanguage: false,
    },
    autoSummary: true,
  });

  it("fills only the settings the workspace has not saved, and keeps the rest", () => {
    const plan = planSetupImport(FILE, SAVED, TERMS, NO_MODEL_TEXT);
    const status = Object.fromEntries(plan.rows.map((row) => [row.field, row.status]));
    expect(status).toEqual({
      profile: "kept",
      workspaceName: "kept",
      outputBuffer: "fill",
      translationDefaults: "kept",
      autoSummary: "fill",
    });
    expect(plan.patch).not.toHaveProperty("profile");
    expect(plan.patch).not.toHaveProperty("workspaceName");
    expect(plan.patch).not.toHaveProperty("outputBufferCount");
    expect(plan.patch.outputBufferDwellMs).toBe(3000);
    expect(plan.patch.translationDefaults).toBeUndefined();
    expect(plan.patch.autoSummary).toBe(true);
  });

  it("fills an unsaved workspace name and format", () => {
    const plan = planSetupImport(FILE, { ...SAVED, profile: null, workspaceName: null }, TERMS, NO_MODEL_TEXT);
    expect(plan.patch.profile).toBe("builtin:talkshow");
    expect(plan.patch.workspaceName).toBe("Gereja Baru");
  });

  it("fills an unsaved translation block with the Terms the operator has now", () => {
    const plan = planSetupImport(FILE, { ...SAVED, translationDefaults: null }, TERMS, NO_MODEL_TEXT);
    expect(plan.rows.find((row) => row.field === "translationDefaults")?.status).toBe("fill");
    expect(plan.patch.translationDefaults).toMatchObject({
      recordingWindowMs: 14000,
      keywordText: TERMS.keywordText,
      filterText: TERMS.filterText,
    });
  });

  it("does not turn automatic summaries off, and lists nothing for an absent setting", () => {
    const off = planSetupImport(mergeOperatorPreferences(EMPTY_PREFERENCES, { autoSummary: false }), SAVED, TERMS, NO_MODEL_TEXT);
    expect(off.rows.map((row) => row.field)).not.toContain("autoSummary");
    expect(off.patch).not.toHaveProperty("autoSummary");
    const alreadyOn = planSetupImport(FILE, { ...SAVED, autoSummary: true }, TERMS, NO_MODEL_TEXT);
    expect(alreadyOn.rows.find((row) => row.field === "autoSummary")?.status).toBe("kept");
    expect(alreadyOn.patch).not.toHaveProperty("autoSummary");
  });

  it("holds translator instructions and summary focus until the operator allows them", () => {
    const withText = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      translationSystemPrompt: "Keep Scripture references as spoken.",
      summaryDefaults: { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", language: "en", length: "detailed", guidance: "theme and application" },
    });
    const plan = planSetupImport(withText, { ...SAVED, translationSystemPrompt: null, summaryDefaults: null }, TERMS, NO_MODEL_TEXT);
    expect(plan.patch).not.toHaveProperty("translationSystemPrompt");
    expect(plan.patch.summaryDefaults?.guidance).toBe("");
    expect(plan.patch.summaryDefaults?.length).toBe("detailed");
    expect(plan.rows).toContainEqual({ field: "translationSystemPrompt", status: "held", text: "Keep Scripture references as spoken." });
    expect(plan.rows).toContainEqual({ field: "summaryGuidance", status: "held", text: "theme and application" });
  });

  it("saves held text once the operator allows it", () => {
    const withText = mergeOperatorPreferences(EMPTY_PREFERENCES, {
      translationSystemPrompt: "Keep Scripture references as spoken.",
      summaryDefaults: { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", language: "en", length: "short", guidance: "theme" },
    });
    const plan = planSetupImport(withText, { ...SAVED, translationSystemPrompt: null, summaryDefaults: null }, TERMS, ALLOW_MODEL_TEXT);
    expect(plan.patch.translationSystemPrompt).toBe("Keep Scripture references as spoken.");
    expect(plan.patch.summaryDefaults?.guidance).toBe("theme");
    expect(plan.rows.some((row) => row.status === "held")).toBe(false);
  });

  it("never replaces saved model-facing text, even when allowed", () => {
    const withText = mergeOperatorPreferences(EMPTY_PREFERENCES, { translationSystemPrompt: "Other instructions." });
    const plan = planSetupImport(withText, { ...SAVED, translationSystemPrompt: "Saved instructions." }, TERMS, ALLOW_MODEL_TEXT);
    expect(plan.patch).not.toHaveProperty("translationSystemPrompt");
    expect(plan.rows).toContainEqual({ field: "translationSystemPrompt", status: "kept" });
  });
});
