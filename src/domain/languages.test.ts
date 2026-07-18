import { describe, expect, it } from "vitest";

import { LANGUAGE_OPTIONS, isLanguageLocale } from "@/domain/languages";

describe("Phase 1 languages", () => {
  it("contains the confirmed product locales without a duplicate South Korean entry", () => {
    expect(LANGUAGE_OPTIONS.map(({ locale }) => locale)).toEqual([
      "en",
      "id",
      "ja",
      "ko-KR",
      "tl-PH",
      "zh-Hans",
      "zh-Hant",
      "vi",
    ]);
  });

  it("maps both Chinese scripts to the same spoken language", () => {
    const chinese = LANGUAGE_OPTIONS.filter(({ locale }) => locale.startsWith("zh-"));
    expect(chinese.map(({ speechCode }) => speechCode)).toEqual(["zh", "zh"]);
  });

  it("validates only configured product locales", () => {
    expect(isLanguageLocale("tl-PH")).toBe(true);
    expect(isLanguageLocale("south-korean")).toBe(false);
  });
});
