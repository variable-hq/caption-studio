import type {
  TranscriptSegment,
  TranslationRequest,
  TranslationResult,
} from "@/ai/contracts";
import {
  findLanguage,
  isLanguageLocale,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import { isCloudAccessConfigured } from "@/auth/cloudflare-access";

const GROQ_API_URL = "https://api.groq.com/openai/v1";
const DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";
const DEFAULT_TRANSLATION_MODEL = "openai/gpt-oss-20b";
const RETIRED_FREE_TRANSLATION_MODELS = new Set(["llama-3.1-8b-instant"]);

interface GroqTranscriptResponse {
  text?: string;
  language?: string;
  segments?: Array<{
    text?: string;
  }>;
}

interface GroqChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

interface GroqModelsResponse {
  data?: Array<{ id?: string }>;
}

export class GroqProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(message);
  }
}

function translationModel() {
  const configured = process.env.GROQ_TRANSLATION_MODEL?.trim();
  return configured && !RETIRED_FREE_TRANSLATION_MODELS.has(configured)
    ? configured
    : DEFAULT_TRANSLATION_MODEL;
}

export function getCloudProviderHealth() {
  const providerReady = Boolean(process.env.GROQ_API_KEY?.trim());
  const accessReady =
    isCloudAccessConfigured() || process.env.NODE_ENV !== "production";
  const ready = providerReady && accessReady;

  return {
    status: ready ? ("ready" as const) : ("not-configured" as const),
    hosting: "Cloudflare Workers",
    access: { ready: accessReady, provider: "Cloudflare Access" },
    transcription: {
      ready: providerReady,
      model:
        process.env.GROQ_TRANSCRIPTION_MODEL ?? DEFAULT_TRANSCRIPTION_MODEL,
    },
    translation: {
      ready: providerReady,
      model: translationModel(),
    },
  };
}

function apiKey() {
  const value = process.env.GROQ_API_KEY?.trim();
  if (!value) {
    throw new GroqProviderError(
      "Cloud AI is not configured. Add the GROQ_API_KEY deployment secret.",
      503,
    );
  }
  return value;
}

async function groqFetch(path: string, init: RequestInit) {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(path.includes("/audio/") ? 30_000 : 15_000);
    response = await fetch(`${GROQ_API_URL}${path}`, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      headers: {
        authorization: `Bearer ${apiKey()}`,
        ...init.headers,
      },
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new GroqProviderError(
      timedOut
        ? "The cloud AI provider timed out. The caption session remains available to retry."
        : "The cloud AI provider is unreachable.",
      timedOut ? 504 : 502,
    );
  }

  if (!response.ok) {
    const status = response.status === 429 ? 429 : 502;
    const message =
      response.status === 429
        ? "The free AI quota is temporarily exhausted. Try again after the provider reset."
        : "The cloud AI provider could not complete the request.";
    throw new GroqProviderError(
      message,
      status,
      response.headers.get("retry-after") ?? undefined,
    );
  }

  return response;
}

export async function verifyGroqProvider() {
  const response = await groqFetch("/models", { method: "GET" });
  const payload = (await response.json()) as GroqModelsResponse;
  const modelIds = new Set(payload.data?.flatMap(({ id }) => (id ? [id] : [])));
  const transcriptionModel =
    process.env.GROQ_TRANSCRIPTION_MODEL ?? DEFAULT_TRANSCRIPTION_MODEL;
  const configuredTranslationModel = translationModel();

  if (!modelIds.has(transcriptionModel) || !modelIds.has(configuredTranslationModel)) {
    throw new GroqProviderError(
      "The configured free AI models are not available to this Groq account.",
      503,
    );
  }

  return getCloudProviderHealth();
}

function detectedLocale(
  providerLanguage: string | undefined,
  requestedLanguage: SourceLanguage,
): LanguageLocale | undefined {
  if (requestedLanguage !== "auto") return requestedLanguage;
  if (!providerLanguage) return undefined;

  const providerCode = providerLanguage.toLowerCase();
  const match = ["en", "id", "ja", "ko-KR", "tl-PH", "zh-Hans", "vi"].find(
    (locale) => {
      const language = findLanguage(locale as LanguageLocale);
      return (
        language?.speechCode === providerCode ||
        language?.label.toLowerCase() === providerCode
      );
    },
  );
  return match as LanguageLocale | undefined;
}

export function buildTranscriptionPrompt(keywordHints: readonly string[]) {
  const terms = keywordHints
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 40)
    .join(", ");
  const prefix =
    "Church service or sermon. Preserve biblical names, Bible books, verse numbers, and church terminology.";
  return terms ? `${prefix} Expected terms: ${terms}`.slice(0, 900) : prefix;
}

export function buildTranslationMessages(request: TranslationRequest) {
  const source = findLanguage(request.sourceLanguage)?.label ?? request.sourceLanguage;
  const target = findLanguage(request.targetLanguage)?.label ?? request.targetLanguage;
  const relevantText = [request.text, ...request.recentContext].join("\n").toLowerCase();
  const preferredTerms = Object.entries(request.preferredTerms)
    .filter(([from]) => {
      const normalized = from.trim().toLowerCase();
      return Boolean(normalized) && relevantText.includes(normalized);
    })
    .slice(0, 60)
    .map(([from, to]) => `${from} => ${to}`)
    .join("\n");
  const context = request.recentContext.slice(-4).join("\n");

  return [
    {
      role: "system",
      content: [
        `Translate a live church sermon from ${source} to ${target}.`,
        "Return only the translation, with no explanation or quotation marks.",
        "Preserve names, numbers, Bible book names, chapter and verse references.",
        "Use the approved term mappings exactly when they apply.",
        "Do not add Bible verses, doctrine, facts, or meaning that the speaker did not say.",
        request.targetLanguage === "zh-Hans"
          ? "Use Simplified Chinese characters."
          : request.targetLanguage === "zh-Hant"
            ? "Use Traditional Chinese characters."
            : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      role: "user",
      content: [
        context ? `Recent context:\n${context}` : "",
        preferredTerms ? `Approved terms:\n${preferredTerms}` : "",
        `Translate this caption:\n${request.text}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  ];
}

export async function transcribeWithGroq(input: {
  audio: Blob;
  sourceLanguage: SourceLanguage;
  keywordHints: string[];
  signal?: AbortSignal;
}): Promise<TranscriptSegment[]> {
  const form = new FormData();
  form.append("file", input.audio, "caption-audio.webm");
  form.append(
    "model",
    process.env.GROQ_TRANSCRIPTION_MODEL ?? DEFAULT_TRANSCRIPTION_MODEL,
  );
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  form.append("prompt", buildTranscriptionPrompt(input.keywordHints));

  if (input.sourceLanguage !== "auto") {
    const speechCode = findLanguage(input.sourceLanguage)?.speechCode;
    if (speechCode) form.append("language", speechCode);
  }

  const response = await groqFetch("/audio/transcriptions", {
    method: "POST",
    body: form,
    signal: input.signal,
  });
  const payload = (await response.json()) as GroqTranscriptResponse;
  const detectedLanguage = detectedLocale(payload.language, input.sourceLanguage);

  if (payload.segments?.length) {
    return payload.segments
      .filter((segment) => segment.text?.trim())
      .map((segment) => ({
        text: segment.text!.trim(),
        isFinal: true,
        detectedLanguage,
      }));
  }

  const text = payload.text?.trim();
  if (!text) return [];

  return [
    {
      text,
      isFinal: true,
      detectedLanguage,
    },
  ];
}

export async function translateWithGroq(
  request: TranslationRequest,
  signal?: AbortSignal,
): Promise<TranslationResult> {
  if (!isLanguageLocale(request.sourceLanguage) || !isLanguageLocale(request.targetLanguage)) {
    throw new GroqProviderError("Unsupported language selection.", 400);
  }

  const model = translationModel();
  const response = await groqFetch("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: buildTranslationMessages(request),
      temperature: 0.1,
      ...(model.startsWith("openai/gpt-oss-")
        ? { reasoning_effort: "low" }
        : {}),
      max_completion_tokens: 256,
    }),
    signal,
  });
  const payload = (await response.json()) as GroqChatResponse;
  const text = payload.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new GroqProviderError("The cloud translation response was empty.", 502);
  }

  return { text };
}
