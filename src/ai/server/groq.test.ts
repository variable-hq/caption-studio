import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTranscriptionPrompt,
  buildTranslationMessages,
  verifyGroqProvider,
} from "@/ai/server/groq";

describe("Groq cloud provider prompts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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

  it("authenticates the configured free models before a live session", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            { id: "whisper-large-v3-turbo" },
            { id: "llama-3.1-8b-instant" },
          ],
        }),
      ),
    );

    await expect(verifyGroqProvider()).resolves.toMatchObject({ status: "ready" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
