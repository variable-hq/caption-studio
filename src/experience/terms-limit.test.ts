import { describe, expect, it } from "vitest";

import { termsLimitExceeded } from "@/experience/terms-limit";
import type { TranslationDefaults } from "@/experience/preferences";

const settings = (keywordText = "", filterText = "") => ({ keywordText, filterText }) as TranslationDefaults;

describe("termsLimitExceeded", () => {
  it("allows the boundary and rejects one entry over it in either list", () => {
    expect(termsLimitExceeded(null, settings("one, two"), 2)).toBe(false);
    expect(termsLimitExceeded(null, settings("one, two, three"), 2)).toBe(true);
    expect(termsLimitExceeded(null, settings("", "one, two, three"), 2)).toBe(true);
  });

  it("checks the two lists independently", () => {
    expect(termsLimitExceeded(settings("one, two, three", "one"), settings("one, two, three", "one, two"), 2)).toBe(false);
    expect(termsLimitExceeded(settings("one", "one, two, three"), settings("one, two, three", "one, two, three"), 2)).toBe(true);
  });

  it("allows unchanged, reduced and in-place edited over-cap lists, but refuses growth", () => {
    const before = settings("one, two, three");
    expect(termsLimitExceeded(before, settings("one, two, three"), 2)).toBe(false);
    expect(termsLimitExceeded(before, settings("one, two"), 2)).toBe(false);
    expect(termsLimitExceeded(before, settings("ONE, two, three"), 2)).toBe(false);
    expect(termsLimitExceeded(before, settings("one, two, three, four"), 2)).toBe(true);
  });

  it("checks the first save against the plan cap", () => {
    expect(termsLimitExceeded(null, settings("one, two"), 2)).toBe(false);
    expect(termsLimitExceeded(null, settings("one, two, three"), 2)).toBe(true);
  });

  it("allows clearing and empty lists", () => {
    expect(termsLimitExceeded(settings("one, two, three"), null, 2)).toBe(false);
    expect(termsLimitExceeded(null, settings(), 0)).toBe(false);
  });

  it("counts comma, compiled comma-space and newline separators equivalently", () => {
    for (const text of ["one,two,three", "one, two, three", "one\ntwo\nthree"]) {
      expect(termsLimitExceeded(null, settings(text), 2)).toBe(true);
    }
  });

  it("allows reducing an over-cap list after the plan cap is lowered", () => {
    expect(termsLimitExceeded(settings("one, two, three"), settings("one, two"), 1)).toBe(false);
  });
});
