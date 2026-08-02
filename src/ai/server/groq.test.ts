import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTranscriptionPrompt,
  buildTranslationMessages,
  transcribeWithGroq,
  translateWithGroq,
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

  it("omits unrelated glossary mappings from the provider prompt", () => {
    const messages = buildTranslationMessages({
      text: "Grace and peace be with you.",
      sourceLanguage: "en",
      targetLanguage: "id",
      recentContext: [],
      preferredTerms: {
        Grace: "Kasih karunia",
        Nebuchadnezzar: "Nebukadnezar",
      },
    });

    expect(messages[1].content).toContain("Grace => Kasih karunia");
    expect(messages[1].content).not.toContain("Nebuchadnezzar");
  });

  it("authenticates the configured free models before a live session", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            { id: "whisper-large-v3-turbo" },
            { id: "openai/gpt-oss-20b" },
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

  it("replaces a stale Llama environment override before readiness checks", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("GROQ_TRANSLATION_MODEL", "llama-3.1-8b-instant");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            { id: "whisper-large-v3-turbo" },
            { id: "openai/gpt-oss-20b" },
          ],
        }),
      ),
    );

    await expect(verifyGroqProvider()).resolves.toMatchObject({
      translation: { model: "openai/gpt-oss-20b" },
    });
  });

  it("propagates capture cancellation to the Groq transcription request", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ text: "Grace", language: "english" })),
    );
    const controller = new AbortController();
    controller.abort();

    await transcribeWithGroq({
      audio: new Blob(["audio"], { type: "audio/webm" }),
      sourceLanguage: "en",
      keywordHints: [],
      signal: controller.signal,
    });

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init?.signal?.aborted).toBe(true);
  });

  it("uses the replacement translation model with bounded low reasoning", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: "Kasih karunia" } }] }),
      ),
    );

    await expect(
      translateWithGroq({
        text: "Grace",
        sourceLanguage: "en",
        targetLanguage: "id",
        recentContext: [],
        preferredTerms: { Grace: "Kasih karunia" },
      }),
    ).resolves.toEqual({ text: "Kasih karunia" });

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "openai/gpt-oss-20b",
      reasoning_effort: "low",
      max_completion_tokens: 256,
    });
  });

  it("does not send GPT-OSS reasoning controls to another explicit model", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.stubEnv("GROQ_TRANSLATION_MODEL", "qwen/qwen3.6-27b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ choices: [{ message: { content: "Kasih karunia" } }] }),
      ),
    );

    await translateWithGroq({
      text: "Grace",
      sourceLanguage: "en",
      targetLanguage: "id",
      recentContext: [],
      preferredTerms: {},
    });

    const init = vi.mocked(fetch).mock.calls[0][1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen/qwen3.6-27b");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});
