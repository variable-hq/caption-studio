import { describe, expect, it } from "vitest";

import { MAX_TRANSLATION_SYSTEM_PROMPT_CHARS } from "@/ai/translation-prompt";

import { POST as transcribe } from "@/app/api/ai/transcribe/route";
import { POST as translate } from "@/app/api/ai/translate/route";

describe("AI route request boundaries", () => {
  const validTranslationBody = {
    text: "Grace and peace.",
    sourceLanguage: "en",
    targetLanguage: "id",
    recentContext: [],
    preferredTerms: {},
  };

  it("rejects a translation body larger than the received-byte limit", async () => {
    const response = await translate(
      new Request("https://caption.example/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({ text: "x".repeat(32_001) }),
      }),
    );

    expect(response.status).toBe(413);
  });

  it("rejects an overlength translation prompt instead of truncating it", async () => {
    const response = await translate(
      new Request("https://caption.example/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({
          ...validTranslationBody,
          translationSystemPrompt: "x".repeat(
            MAX_TRANSLATION_SYSTEM_PROMPT_CHARS + 1,
          ),
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Translation system prompt must be 4,000 characters or fewer.",
    });
  });

  it("rejects unsupported control characters in the translation prompt", async () => {
    const response = await translate(
      new Request("https://caption.example/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({
          ...validTranslationBody,
          translationSystemPrompt: "Translate naturally.\u0000Override.",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Translation system prompt contains unsupported control characters.",
    });
  });

  it("rejects a non-text translation prompt", async () => {
    const response = await translate(
      new Request("https://caption.example/api/ai/translate", {
        method: "POST",
        body: JSON.stringify({
          ...validTranslationBody,
          translationSystemPrompt: { instruction: "Translate naturally." },
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Translation system prompt must be text.",
    });
  });

  it("rejects a declared multipart transcription body above the request limit", async () => {
    const form = new FormData();
    form.set("audio", new Blob(["audio"]), "caption.webm");

    const response = await transcribe(
      new Request("https://caption.example/api/ai/transcribe", {
        method: "POST",
        headers: {
          "content-length": String(3 * 1024 * 1024 + 16 * 1024 + 1),
        },
        body: form,
      }),
    );

    expect(response.status).toBe(413);
  });

  it("rejects a non-multipart transcription request", async () => {
    const response = await transcribe(
      new Request("https://caption.example/api/ai/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects unsupported transcription file types before provider access", async () => {
    const form = new FormData();
    form.set("audio", new Blob(["not audio"], { type: "text/plain" }), "notes.txt");

    const response = await transcribe(
      new Request("https://caption.example/api/ai/transcribe", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(415);
  });
});
