import { describe, expect, it, vi } from "vitest";

import { applyModeration } from "@/pipeline/moderation";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";

describe("public moderation word boundaries", () => {
  it.each([
    ["zh-Hans", "这是测试内容", "测试", "这是••内容"],
    ["zh-Hant", "這是測試內容", "測試", "這是••內容"],
    ["ja", "これは秘密です。", "秘密", "これは••です。"],
    ["ja", "これはテストです。", "テスト", "これは•••です。"],
    ["zh-Hans", "测试，测试。", "测试", "••，••。"],
    ["ja", "東京都", "京都", "東京都"],
    ["zh-Hans", "测试内容", "试", "测试内容"],
    ["en", "A classic passage", "ass", "A classic passage"],
    ["id", "membiru biru", "biru", "membiru ••••"],
    ["en", "a+b and aab", "a+b", "••• and aab"],
  ])("uses conservative %s boundaries for %s", (locale, text, term, expected) => {
    const result = applyModeration(text, [{ id: "test", term, mode: "mask" }], locale);
    expect(result.publicText).toBe(expected);
    expect(result.appliedRuleIds).toEqual(text === expected ? [] : ["test"]);
  });

  it("uses the target language and never rewrites protected source or translated forms", () => {
    const result = prepareCaptionForms({
      sourceText: "This is test content.",
      translatedText: "这是测试内容",
      targetLanguage: "zh-Hans",
      glossary: [],
      moderationRules: [{ id: "test", term: "测试", mode: "mask" }],
    });
    expect(result.protectedSourceText).toBe("This is test content.");
    expect(result.translatedText).toBe("这是测试内容");
    expect(result.publicText).toBe("这是••内容");
  });

  it("preserves disabled, explicit substring, replacement, and hide rules", () => {
    expect(applyModeration("東京都", [
      { id: "off", term: "東京", mode: "mask", enabled: false },
      { id: "inside", term: "京都", mode: "mask", matchInsideWords: true },
    ], "ja")).toMatchObject({ publicText: "東••", appliedRuleIds: ["inside"] });
    expect(applyModeration("这是测试内容", [
      { id: "replace", term: "测试", mode: "replace", replacement: "示例" },
    ], "zh-Hans").publicText).toBe("这是示例内容");
    expect(applyModeration("これは秘密です。", [
      { id: "hide", term: "秘密", mode: "hide-segment" },
    ], "ja")).toMatchObject({ publicText: "", hidden: true, appliedRuleIds: ["hide"] });
  });

  it("fails closed when the browser cannot segment a Chinese/Japanese filter", () => {
    vi.stubGlobal("Intl", { Segmenter: undefined });
    try {
      expect(() => applyModeration("这是测试内容", [
        { id: "test", term: "测试", mode: "mask" },
      ], "zh-Hans")).toThrow("Update the browser");
      expect(applyModeration("test", [{ id: "test", term: "test", mode: "mask" }]).publicText)
        .toBe("••••");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
