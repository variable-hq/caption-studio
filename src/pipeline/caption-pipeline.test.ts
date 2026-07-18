import { describe, expect, it } from "vitest";

import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { keywordHints } from "@/pipeline/glossary";

const glossary = [
  {
    id: "term-jesus",
    canonical: "Jesus Christ",
    variants: ["Jesus"],
    priority: 100,
    preferredTranslations: { id: "Yesus Kristus" },
  },
] as const;

describe("caption pipeline", () => {
  it("keeps protected source text while applying glossary and public moderation", () => {
    const result = prepareCaptionForms({
      sourceText: "Jesus spoke this forbidden phrase.",
      translatedText: "Jesus spoke this forbidden phrase.",
      targetLanguage: "id",
      glossary,
      moderationRules: [
        { id: "rule-1", term: "forbidden", mode: "mask" },
      ],
    });

    expect(result.protectedSourceText).toBe("Jesus spoke this forbidden phrase.");
    expect(result.translatedText).toBe("Yesus Kristus spoke this forbidden phrase.");
    expect(result.publicText).toBe("Yesus Kristus spoke this ••••••••• phrase.");
    expect(result.appliedModerationRuleIds).toEqual(["rule-1"]);
  });

  it("does not match a moderation term inside a harmless longer word", () => {
    const result = prepareCaptionForms({
      sourceText: "A classic passage",
      translatedText: "A classic passage",
      targetLanguage: "en",
      glossary: [],
      moderationRules: [{ id: "rule-2", term: "ass", mode: "mask" }],
    });

    expect(result.publicText).toBe("A classic passage");
  });

  it("orders keyword hints by priority and removes duplicates", () => {
    expect(
      keywordHints([
        { id: "low", canonical: "Bethlehem", priority: 1 },
        { id: "high", canonical: "Jesus", variants: ["Jesus"], priority: 9 },
      ]),
    ).toEqual(["Jesus", "Bethlehem"]);
  });
});
