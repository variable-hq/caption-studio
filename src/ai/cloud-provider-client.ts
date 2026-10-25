import type {
  InferenceAttemptContext,
  LlmProviderRateLimitSnapshot,
  LlmTokenUsage,
  TranscriptSegment,
  TranscriptionProvider,
  TranscriptionRequest,
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "@/ai/contracts";
import { normalizeLlmTokenUsage, normalizeProviderRateLimitSnapshot } from "@/ai/usage";
import { MAX_TRANSCRIPTION_REQUESTS } from "@/live/contracts";

interface CloudProviderHealth {
  status: "ready" | "not-configured" | "unavailable";
  hosting: string;
  access: { ready: boolean; provider: string };
  transcription: { ready: boolean; model: string };
  translation: { ready: boolean; model: string };
}

interface CloudErrorPayload {
  error?: string;
  code?: unknown;
  rateLimit?: unknown;
  usage?: unknown;
}

const TERMINAL_INFERENCE_CONTROL_CODES = new Set([
  "translation_authorization_unavailable",
  "translation_usage_unavailable",
  "translation_attempt_used",
  "transcription_authorization_unavailable",
  "transcription_attempt_used",
  "invalid_transcription_attempt",
  "invalid_translation_attempt",
  "service_inactive",
]);

function normalizeCloudErrorCode(value: unknown) {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/u.test(value)
    ? value
    : undefined;
}

async function readErrorPayload(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | CloudErrorPayload
    | null;
  return payload;
}

async function readError(response: Response, fallback: string) {
  return (await readErrorPayload(response))?.error ?? fallback;
}

export class CloudProviderClientError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly rateLimit?: LlmProviderRateLimitSnapshot,
    readonly usage?: LlmTokenUsage,
  ) {
    super(message);
  }
}

export function isTerminalInferenceControlError(error: unknown) {
  return (
    error instanceof CloudProviderClientError &&
    Boolean(error.code && TERMINAL_INFERENCE_CONTROL_CODES.has(error.code))
  );
}

function inferenceHeaders(
  context: InferenceAttemptContext,
  stage: "transcription" | "translation",
) {
  if (
    typeof context?.controllerToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/u.test(context.controllerToken) ||
    !Number.isSafeInteger(context.transcriptionAttempt) ||
    context.transcriptionAttempt <= 0 ||
    context.transcriptionAttempt > MAX_TRANSCRIPTION_REQUESTS
  ) {
    throw new CloudProviderClientError(
      "Caption authentication is missing or invalid. Reload the operator page before restarting captions.",
      `invalid_${stage}_attempt`,
    );
  }
  return {
    "x-caption-controller": context.controllerToken,
    "x-caption-transcription-attempt": String(context.transcriptionAttempt),
  };
}

export class CloudProviderClient
  implements TranscriptionProvider, TranslationProvider
{
  readonly id = "cloud-api";
  readonly mode = "cloud-free" as const;

  async health(signal?: AbortSignal): Promise<CloudProviderHealth> {
    const response = await fetch("/api/ai/health", {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Cloud AI health check failed."));
    }

    return (await response.json()) as CloudProviderHealth;
  }

  async readiness(): Promise<CloudProviderHealth> {
    const response = await fetch("/api/ai/readiness", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        await readError(response, "Cloud AI credentials could not be verified."),
      );
    }

    return (await response.json()) as CloudProviderHealth;
  }

  async transcribe(
    request: TranscriptionRequest,
    context: InferenceAttemptContext,
    signal?: AbortSignal,
  ): Promise<TranscriptSegment[]> {
    const headers = inferenceHeaders(context, "transcription");
    const form = new FormData();
    const extension = request.audio.type.includes("ogg")
      ? "ogg"
      : request.audio.type.includes("mp4")
        ? "m4a"
        : "webm";
    form.append("audio", request.audio, `caption-audio.${extension}`);
    form.append("sourceLanguage", request.sourceLanguage);
    form.append("keywordHints", JSON.stringify(request.keywordHints));
    if (request.previousTranscript) form.append("previousTranscript", request.previousTranscript);

    const response = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers,
      body: form,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(35_000)])
        : AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
      const payload = await readErrorPayload(response);
      throw new CloudProviderClientError(
        payload?.error ?? "Cloud transcription failed.",
        normalizeCloudErrorCode(payload?.code),
      );
    }

    const payload = (await response.json()) as { segments: TranscriptSegment[] };
    return payload.segments;
  }

  async translate(
    request: TranslationRequest,
    context: InferenceAttemptContext,
    signal?: AbortSignal,
  ): Promise<TranslationResult> {
    const response = await fetch("/api/ai/translate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...inferenceHeaders(context, "translation"),
      },
      body: JSON.stringify(request),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const payload = await readErrorPayload(response);
      throw new CloudProviderClientError(
        payload?.error ?? "Cloud translation failed.",
        normalizeCloudErrorCode(payload?.code),
        normalizeProviderRateLimitSnapshot(payload?.rateLimit) ?? undefined,
        payload?.code === "translation_incomplete"
          ? normalizeLlmTokenUsage(payload.usage) ?? undefined
          : undefined,
      );
    }

    return (await response.json()) as TranslationResult;
  }
}
