import { afterEach, describe, expect, it, vi } from "vitest";

import type { TranslationRequest } from "@/ai/contracts";
import { EMPTY_PROVIDER_SETTINGS, type StoredProviderSettings } from "@/experience/provider-settings";
import { anthropicTranslationParams, translateWithAnthropic } from "./anthropic";
import {
  ProviderError,
  REASONING_TRANSLATION_COMPLETION_TOKENS,
  transcribeAudio,
  translateOpenAiCompatible,
  translationRequestBody,
} from "./groq";
import { encryptProviderKey } from "./provider-key-crypto";
import { resolveInferenceTarget } from "./provider-routing";
import { CloudProviderClientError, isTerminalInferenceControlError } from "@/ai/cloud-provider-client";

const SECRET = "synthetic-provider-key-secret-0123456789";
const FAKE_KEY = "sk-synthetic-test-key-000000000wxyz";

const translation: TranslationRequest = {
  text: "Selamat pagi semuanya",
  sourceLanguage: "id",
  targetLanguage: "en",
  recentContext: [],
  preferredTerms: {},
};

function chatResponse(content: string, finish = "stop") {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: finish, message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("workspace provider routing", () => {
  it("uses Groq on the deployment key when nothing is chosen", async () => {
    vi.stubEnv("GROQ_TRANSLATION_MODEL", "");
    await expect(resolveInferenceTarget("translation", null)).resolves.toEqual({ provider: "groq", model: "openai/gpt-oss-20b" });
  });

  it("decrypts the chosen provider's key for the request", async () => {
    const settings: StoredProviderSettings = {
      selections: { transcription: { provider: "openai", model: "" }, translation: { provider: "anthropic", model: "" } },
      keys: {
        openai: { ciphertext: await encryptProviderKey("openai", FAKE_KEY, SECRET), last4: "wxyz", savedAt: 1 },
        anthropic: { ciphertext: await encryptProviderKey("anthropic", FAKE_KEY, SECRET), last4: "wxyz", savedAt: 1 },
      },
    };
    await expect(resolveInferenceTarget("transcription", settings, SECRET)).resolves.toEqual({ provider: "openai", model: "whisper-1", apiKey: FAKE_KEY });
    await expect(resolveInferenceTarget("translation", settings, SECRET)).resolves.toEqual({ provider: "anthropic", model: "claude-opus-5-5", apiKey: FAKE_KEY });
  });

  it("fails closed when the chosen provider has no key or the secret changed", async () => {
    const missing = { ...EMPTY_PROVIDER_SETTINGS, selections: { ...EMPTY_PROVIDER_SETTINGS.selections, translation: { provider: "deepseek" as const, model: "" } } };
    await expect(resolveInferenceTarget("translation", missing, SECRET)).rejects.toMatchObject({ code: "provider_key_missing" });
    const rotated: StoredProviderSettings = {
      ...missing,
      keys: { deepseek: { ciphertext: await encryptProviderKey("deepseek", FAKE_KEY, SECRET), last4: "wxyz", savedAt: 1 } },
    };
    await expect(resolveInferenceTarget("translation", rotated, `${SECRET}-rotated`)).rejects.toMatchObject({ code: "provider_key_unreadable" });
  });
});

describe("OpenAI-compatible providers", () => {
  it("sends OpenAI transcription to whisper-1 with the workspace key and verbose segments", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      segments: [{ text: "Selamat pagi", no_speech_prob: 0.01, avg_logprob: -0.1, compression_ratio: 1.2 }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeAudio({
      audio: new Blob(["synthetic"], { type: "audio/webm" }),
      sourceLanguage: "id",
      keywordHints: [],
    }, { provider: "openai", model: "whisper-1", apiKey: FAKE_KEY });

    expect(result.segments.map(({ text }) => text)).toEqual(["Selamat pagi"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${FAKE_KEY}`);
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
  });

  it("refuses transcription on a provider without speech-to-text", async () => {
    await expect(transcribeAudio({ audio: new Blob(["x"]), sourceLanguage: "id", keywordHints: [] },
      { provider: "deepseek", model: "deepseek-flash", apiKey: FAKE_KEY })).rejects.toBeInstanceOf(ProviderError);
  });

  it("shapes the request body per provider and model family", () => {
    const reasoning = translationRequestBody({ provider: "openai", model: "gpt-5.4-nano" }, translation);
    expect(reasoning).toMatchObject({ reasoning_effort: "low", max_completion_tokens: REASONING_TRANSLATION_COMPLETION_TOKENS });
    expect(reasoning).not.toHaveProperty("temperature");
    expect(translationRequestBody({ provider: "deepseek", model: "deepseek-flash" }, translation))
      .toMatchObject({ temperature: 0.1, max_tokens: 256 });
    expect(translationRequestBody({ provider: "groq", model: "openai/gpt-oss-20b" }, translation))
      .toMatchObject({ reasoning_effort: "low", max_completion_tokens: 256 });
  });

  it("sends DeepSeek translation to its endpoint and reports usage", async () => {
    const fetchMock = vi.fn(async () => chatResponse("Good morning, everyone"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await translateOpenAiCompatible(translation, { provider: "deepseek", model: "deepseek-flash", apiKey: FAKE_KEY });
    expect(result).toMatchObject({ text: "Good morning, everyone", usage: { totalTokens: 14 } });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.deepseek.com/chat/completions");
  });

  it("reports a paid provider's 429 as busy, not as an exhausted quota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429, headers: { "retry-after": "7" } })));
    const error = await translateOpenAiCompatible(translation, { provider: "openai", model: "gpt-5.4-nano", apiKey: FAKE_KEY }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ status: 429, retryAfter: "7" });
    // The live session ends on quota wording but rides out a busy provider.
    expect((error as Error).message).not.toMatch(/quota/i);
  });

  it("reports a rejected workspace key with its own code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(translateOpenAiCompatible(translation, { provider: "openai", model: "gpt-5.4-nano", apiKey: FAKE_KEY }))
      .rejects.toMatchObject({ code: "provider_key_rejected", status: 502 });
  });
});

describe("client handling of workspace key errors", () => {
  it.each(["provider_key_missing", "provider_key_rejected", "provider_key_unreadable"])("stops capture on %s", (code) => {
    expect(isTerminalInferenceControlError(new CloudProviderClientError("key problem", code))).toBe(true);
  });
});

describe("Claude translation", () => {
  it("maps the translation envelope onto system and user content", () => {
    const params = anthropicTranslationParams({ provider: "anthropic", model: "claude-opus-5-5" }, translation);
    expect(params.system).toContain("SERVER TRANSLATION ENVELOPE");
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content).toContain("Selamat pagi semuanya");
    expect(params).toMatchObject({ output_config: { effort: "low" }, fallbacks: "default" });
    expect(params).not.toHaveProperty("temperature");
    expect(anthropicTranslationParams({ provider: "anthropic", model: "claude-haiku-5-5" }, translation)).not.toHaveProperty("fallbacks");
  });

  it("publishes only a natural end and keeps refusals unpublished", async () => {
    const message = (stop: string) => new Response(JSON.stringify({
      id: "msg_synthetic", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "text", text: "Good morning, everyone" }],
      stop_reason: stop, stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 6 },
    }), { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn(async () => message("end_turn"));
    vi.stubGlobal("fetch", fetchMock);
    const target = { provider: "anthropic" as const, model: "claude-opus-5-5", apiKey: FAKE_KEY };

    await expect(translateWithAnthropic(translation, target)).resolves.toMatchObject({ text: "Good morning, everyone", usage: { totalTokens: 26 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain("api.anthropic.com/v1/messages");
    const headers = new Headers(init.headers);
    expect(`${headers.get("authorization") ?? ""} ${headers.get("x-api-key") ?? ""}`).toContain(FAKE_KEY);
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");

    fetchMock.mockImplementationOnce(async () => message("refusal"));
    await expect(translateWithAnthropic(translation, target)).resolves.toMatchObject({ text: "", incomplete: true });
  });

  it("reports a rejected Claude key with its own code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid" } }), { status: 401, headers: { "content-type": "application/json" } })));
    await expect(translateWithAnthropic(translation, { provider: "anthropic", model: "claude-opus-5-5", apiKey: FAKE_KEY }))
      .rejects.toMatchObject({ code: "provider_key_rejected" });
  });
});
