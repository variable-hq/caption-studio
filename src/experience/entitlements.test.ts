import { describe, expect, it } from "vitest";

import { BUILT_IN_PRESET_IDS } from "@/experience/presets";
import { DEFAULT_MAX_CUSTOM_PRESETS, presetLimits } from "@/experience/entitlements";

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
