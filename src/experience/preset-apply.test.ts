import { describe, expect, it } from "vitest";

import { planPresetApply, planPresetDifferences, type PresetSavedSetup } from "@/experience/preset-apply";
import { GENERAL_PRESET, resolveWorkspacePreset } from "@/experience/presets";
import { wordsFromSettings } from "@/live/words";

const NOTHING_SAVED: PresetSavedSetup = {
  translationDefaults: null,
  outputBufferCount: null,
  outputBufferDwellMs: null,
  summaryDefaults: null,
};
const EMPTY_DRAFTS = { keywordText: "", filterText: "" };
const SERMON = resolveWorkspacePreset("builtin:sermon");
const TALKSHOW = resolveWorkspacePreset("builtin:talkshow");

describe("planPresetApply", () => {
  it("fills every unsaved setting and adds the starter terms", () => {
    const plan = planPresetApply(SERMON, NOTHING_SAVED, EMPTY_DRAFTS, false);
    expect(plan.fill).toEqual({
      recordingWindowMs: "dynamic",
      inferenceLevel: "balanced",
      sanitizeLevel: "balanced",
      outputBufferCount: 1,
      outputBufferDwellMs: 3000,
      summaryLength: "detailed",
      summaryGuidance: "theme, main passage if named, key points, application; quote Scripture only as spoken",
    });
    expect(plan.rows.every((row) => row.status === "fill")).toBe(true);
    expect(plan.rows.map((row) => row.field)).toEqual([
      "captionWait",
      "inference",
      "sanitize",
      "outputBuffer",
      "summaryLength",
      "summaryGuidance",
    ]);
    expect(plan.starterTerms.added).toBe(9);
    expect(plan.starterTerms.skipped).toBe(0);
    expect(wordsFromSettings(plan.starterTerms.keywordText, plan.starterTerms.filterText)).toContainEqual({
      word: "Yesus Kristus",
      action: "translate",
      with: "Jesus Christ",
    });
  });

  it("keeps each setting the workspace has saved", () => {
    const plan = planPresetApply(
      TALKSHOW,
      {
        ...NOTHING_SAVED,
        translationDefaults: {} as NonNullable<PresetSavedSetup["translationDefaults"]>,
        summaryDefaults: {} as NonNullable<PresetSavedSetup["summaryDefaults"]>,
      },
      EMPTY_DRAFTS,
      false,
    );
    expect(plan.rows.filter((row) => row.status === "kept").map((row) => row.field)).toEqual([
      "captionWait",
      "inference",
      "sanitize",
      "summaryLength",
      "summaryGuidance",
    ]);
    expect(plan.fill).toEqual({ outputBufferCount: 1, outputBufferDwellMs: 3000 });
  });

  it("fills only the output buffer setting that is unsaved", () => {
    const plan = planPresetApply(TALKSHOW, { ...NOTHING_SAVED, outputBufferCount: 0 }, EMPTY_DRAFTS, false);
    expect(plan.fill.outputBufferCount).toBeUndefined();
    expect(plan.fill.outputBufferDwellMs).toBe(3000);
    expect(plan.rows.find((row) => row.field === "outputBuffer")?.status).toBe("fill");
  });

  it("leaves the output buffer alone while a session runs", () => {
    const plan = planPresetApply(SERMON, NOTHING_SAVED, EMPTY_DRAFTS, true);
    expect(plan.fill.outputBufferCount).toBeUndefined();
    expect(plan.fill.outputBufferDwellMs).toBeUndefined();
    expect(plan.rows.find((row) => row.field === "outputBuffer")?.status).toBe("afterSession");
    expect(plan.fill.recordingWindowMs).toBe("dynamic");
  });

  it("never fills settings a preset does not own", () => {
    const plan = planPresetApply(SERMON, NOTHING_SAVED, EMPTY_DRAFTS, false);
    const owned = ["recordingWindowMs", "inferenceLevel", "sanitizeLevel", "outputBufferCount", "outputBufferDwellMs", "summaryLength", "summaryGuidance"];
    for (const key of Object.keys(plan.fill)) expect(owned).toContain(key);
  });

  it("adds no starter term that is already listed as a translation", () => {
    const plan = planPresetApply(
      SERMON,
      NOTHING_SAVED,
      { keywordText: "Yesus Kristus => Jesus Christ", filterText: "" },
      false,
    );
    expect(plan.starterTerms.added).toBe(8);
    const listed = wordsFromSettings(plan.starterTerms.keywordText, plan.starterTerms.filterText).filter(
      (row) => row.word === "Yesus Kristus",
    );
    expect(listed).toHaveLength(1);
  });

  it("skips a starter term whose word is already a glossary spelling or variant, in any case", () => {
    const plan = planPresetApply(
      SERMON,
      NOTHING_SAVED,
      { keywordText: "petrus => Peter, Moses|Musa", filterText: "" },
      false,
    );
    // Petrus is a listed canonical spelling and Musa a listed variant; neither gains a translation.
    expect(plan.starterTerms.added).toBe(7);
    const rows = wordsFromSettings(plan.starterTerms.keywordText, plan.starterTerms.filterText);
    expect(rows.filter((row) => row.word.toLowerCase() === "petrus")).toEqual([
      { word: "petrus", action: "translate", with: "Peter" },
    ]);
    expect(rows.filter((row) => row.word.toLowerCase() === "musa")).toEqual([
      { word: "Musa", action: "fix", with: "Moses" },
    ]);
  });

  it("still adds a starter term that is only a filter entry", () => {
    const plan = planPresetApply(SERMON, NOTHING_SAVED, { keywordText: "", filterText: "Daud" }, false);
    expect(wordsFromSettings(plan.starterTerms.keywordText, plan.starterTerms.filterText)).toContainEqual({
      word: "Daud",
      action: "translate",
      with: "David",
    });
  });

  it("skips starter terms once the Terms list is full and reports how many", () => {
    const full = Array.from({ length: 40 }, (_, index) => `Name ${index} => Nama ${index}`).join(", ");
    const plan = planPresetApply(SERMON, NOTHING_SAVED, { keywordText: full, filterText: "" }, false);
    expect(plan.starterTerms.added).toBe(0);
    expect(plan.starterTerms.skipped).toBe(9);
    expect(plan.starterTerms.keywordText).toBe(full);
  });

  it("changes nothing for General", () => {
    const plan = planPresetApply(resolveWorkspacePreset("builtin:general"), NOTHING_SAVED, EMPTY_DRAFTS, false);
    expect(plan.preset).toEqual(GENERAL_PRESET);
    expect(plan.rows).toEqual([]);
    expect(plan.fill).toEqual({});
    expect(plan.starterTerms).toMatchObject({ added: 0, skipped: 0 });
  });
});

describe("planPresetDifferences", () => {
  const SAVED_DIFFERENT: PresetSavedSetup = {
    translationDefaults: {
      sourceLanguage: "auto",
      targetLanguage: "en",
      keywordText: "",
      filterText: "",
      recordingWindowMs: 6000,
      inferenceLevel: "low",
      sanitizeLevel: "balanced",
      filterInappropriateLanguage: true,
    },
    outputBufferCount: null,
    outputBufferDwellMs: null,
    summaryDefaults: { model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", language: "en", length: "short", guidance: "" },
  };

  it("lists only saved settings whose value differs from the format", () => {
    const rows = planPresetDifferences(SERMON, SAVED_DIFFERENT, false);
    expect(rows.map((row) => row.field)).toEqual(["captionWait", "inference", "summaryLength", "summaryGuidance"]);
    expect(rows[0]).toEqual({
      field: "captionWait",
      status: "differs",
      saved: { recordingWindowMs: 6000 },
      preset: { recordingWindowMs: "dynamic" },
    });
  });

  it("never lists a setting the workspace has not saved", () => {
    const rows = planPresetDifferences(SERMON, SAVED_DIFFERENT, false);
    expect(rows.map((row) => row.field)).not.toContain("outputBuffer");
    expect(rows.map((row) => row.field)).not.toContain("sanitize");
  });

  it("lists nothing when the saved values match the format", () => {
    const matching: PresetSavedSetup = {
      ...SAVED_DIFFERENT,
      translationDefaults: { ...SAVED_DIFFERENT.translationDefaults!, recordingWindowMs: "dynamic", inferenceLevel: "balanced", sanitizeLevel: "balanced" },
      summaryDefaults: { ...SAVED_DIFFERENT.summaryDefaults!, length: "detailed", guidance: SERMON.defaults!.summaryGuidance! },
    };
    expect(planPresetDifferences(SERMON, matching, false)).toEqual([]);
  });

  it("lists nothing for General, which sets no defaults", () => {
    expect(planPresetDifferences(GENERAL_PRESET, SAVED_DIFFERENT, false)).toEqual([]);
    expect(planPresetDifferences(resolveWorkspacePreset(null), SAVED_DIFFERENT, false)).toEqual([]);
  });

  it("shows the saved output buffer and the format's value for the part not saved", () => {
    const saved: PresetSavedSetup = { ...SAVED_DIFFERENT, outputBufferCount: 0, outputBufferDwellMs: null };
    const [row] = planPresetDifferences(SERMON, saved, false).filter((candidate) => candidate.field === "outputBuffer");
    expect(row).toEqual({
      field: "outputBuffer",
      status: "differs",
      saved: { outputBufferCount: 0, outputBufferDwellMs: 3000 },
      preset: { outputBufferCount: 1, outputBufferDwellMs: 3000 },
    });
  });

  it("marks a differing output buffer as kept until a running session ends", () => {
    const saved: PresetSavedSetup = { ...SAVED_DIFFERENT, outputBufferCount: 0, outputBufferDwellMs: 5000 };
    const [row] = planPresetDifferences(SERMON, saved, true).filter((candidate) => candidate.field === "outputBuffer");
    expect(row?.status).toBe("afterSession");
    expect(planPresetDifferences(SERMON, saved, false).find((candidate) => candidate.field === "outputBuffer")?.status).toBe("differs");
  });
});
