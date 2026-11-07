import { describe, expect, it } from "vitest";

import { BUILT_IN_PRESET_IDS } from "@/experience/presets";
import { DEFAULT_MAX_CUSTOM_PRESETS, DEFAULT_MAX_TERMS_PER_LIST, presetLimits, termsLimits } from "@/experience/entitlements";
import { MAX_WORD_ENTRIES } from "@/live/words";

describe("preset limits", () => {
  it("allows the default number of custom presets when no plan is set", () => {
    expect(presetLimits(undefined).maxCustomPresets).toBe(DEFAULT_MAX_CUSTOM_PRESETS);
    expect(presetLimits("").maxCustomPresets).toBe(DEFAULT_MAX_CUSTOM_PRESETS);
  });

  it("gives the free plan no custom presets", () => {
    expect(presetLimits("free").maxCustomPresets).toBe(0);
  });

  it("treats an unknown or malformed plan as the default, never as a lock or an unlock", () => {
    for (const plan of ["pro", "Free", " free", "constructor", "__proto__", 0, null, {}]) {
      expect(presetLimits(plan).maxCustomPresets).toBe(DEFAULT_MAX_CUSTOM_PRESETS);
    }
  });

  it("allows every built-in format on every plan", () => {
    for (const plan of [undefined, "free", "pro"]) {
      expect(presetLimits(plan).allowedProfiles).toEqual(BUILT_IN_PRESET_IDS);
    }
  });
});

describe("Terms limits", () => {
  it.each([
    [undefined, 40, true],
    ["", 40, true],
    ["free", 10, false],
    ["pro", 40, true],
    [null, 40, true],
    [0, 40, true],
  ])("uses the expected saved Terms limits for plan %s", (plan, maxTermsPerList, termsImport) => {
    expect(termsLimits(plan)).toEqual({ maxTermsPerList, termsImport });
  });

  it("keeps the default Terms cap aligned with the pipeline ceiling", () => {
    expect(DEFAULT_MAX_TERMS_PER_LIST).toBe(MAX_WORD_ENTRIES);
  });
});
