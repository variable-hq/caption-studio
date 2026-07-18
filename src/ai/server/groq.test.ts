import { describe, expect, it } from "vitest";

import {
  buildTranscriptionPrompt,
  buildTranslationMessages,
} from "@/ai/server/groq";

describe("Groq cloud provider prompts", () => {
  it("includes church keyword hints in the transcription prompt", () => {
    const prompt = buildTranscriptionPrompt(["Nebuchadnezzar", "Bethlehem"]);

    expect(prompt).toContain("biblical names");
    expect(prompt).toContain("Nebuchadnezzar");
    expect(prompt.length).toBeLessThanOrEqual(900);
  });

  it("requires Traditional Chinese without inventing biblical content", () => {
    const messages = buildTranslationMessages({
      text: "Grace and peace be with you.",
      sourceLanguage: "en",
      targetLanguage: "zh-Hant",
      recentContext: ["Paul is greeting the church."],
      preferredTerms: { Grace: "恩典" },
    });

    expect(messages[0].content).toContain("Traditional Chinese");
    expect(messages[0].content).toContain("Do not add Bible verses");
    expect(messages[1].content).toContain("Grace => 恩典");
  });
});
