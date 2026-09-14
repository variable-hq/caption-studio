import { describe, expect, it } from "vitest";

import { SUMMARY_MODELS } from "@/experience/contracts";
import {
  DEFAULT_SUMMARY_OPTIONS,
  MAX_SUMMARY_GUIDANCE_CHARS,
  normalizeSummaryOptions,
  summaryOptionsEqual,
} from "@/experience/summary-defaults";

describe("summary defaults", () => {
  it("falls back to the defaults for missing, malformed, or unknown values", () => {
    expect(normalizeSummaryOptions(null)).toEqual(DEFAULT_SUMMARY_OPTIONS);
    expect(normalizeSummaryOptions("not json")).toEqual(DEFAULT_SUMMARY_OPTIONS);
    expect(normalizeSummaryOptions({ model: "@cf/other", language: "xx", length: "long", guidance: 4 }))
      .toEqual(DEFAULT_SUMMARY_OPTIONS);
  });

  it("keeps allowlisted values and bounds the guidance", () => {
    const stored = JSON.stringify({
      model: SUMMARY_MODELS[1],
      language: "en",
      length: "detailed",
      guidance: ` Focus on\u0000 applications. ${"x".repeat(MAX_SUMMARY_GUIDANCE_CHARS)}`,
    });
    const options = normalizeSummaryOptions(stored);
    expect(options.model).toBe(SUMMARY_MODELS[1]);
    expect(options.language).toBe("en");
    expect(options.length).toBe("detailed");
    expect(options.guidance.startsWith("Focus on applications.")).toBe(true);
    expect(options.guidance).toHaveLength(MAX_SUMMARY_GUIDANCE_CHARS);
  });

  it("compares options field by field", () => {
    expect(summaryOptionsEqual(DEFAULT_SUMMARY_OPTIONS, { ...DEFAULT_SUMMARY_OPTIONS })).toBe(true);
    expect(summaryOptionsEqual(DEFAULT_SUMMARY_OPTIONS, { ...DEFAULT_SUMMARY_OPTIONS, length: "detailed" })).toBe(false);
  });
});
