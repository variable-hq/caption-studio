import type {
  LlmProviderRateLimitSnapshot,
  TranscriptSegment,
  TranscriptionProvider,
  TranscriptionRequest,
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "@/ai/contracts";
import { normalizeProviderRateLimitSnapshot } from "@/ai/usage";

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
}

const TERMINAL_TRANSLATION_CONTROL_CODES = new Set([
  "translation_authorization_unavailable",
  "translation_usage_unavailable",
  "translation_attempt_used",
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
  ) {
    super(message);
  }
}

export function isTerminalTranslationControlError(error: unknown) {
  return (
    error instanceof CloudProviderClientError &&
    Boolean(error.code && TERMINAL_TRANSLATION_CONTROL_CODES.has(error.code))
  );
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
    signal?: AbortSignal,
  ): Promise<TranscriptSegment[]> {
    const form = new FormData();
    const extension = request.audio.type.includes("ogg")
      ? "ogg"
      : request.audio.type.includes("mp4")
        ? "m4a"
        : "webm";
    form.append("audio", request.audio, `caption-audio.${extension}`);
    form.append("sourceLanguage", request.sourceLanguage);
    form.append("keywordHints", JSON.stringify(request.keywordHints));

    const response = await fetch("/api/ai/transcribe", {
      method: "POST",
      body: form,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(35_000)])
        : AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Cloud transcription failed."));
    }

    const payload = (await response.json()) as { segments: TranscriptSegment[] };
    return payload.segments;
  }

  async translate(
    request: TranslationRequest,
    signal?: AbortSignal,
    controllerToken?: string,
    transcriptionAttempt?: number,
  ): Promise<TranslationResult> {
    const response = await fetch("/api/ai/translate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(controllerToken
          ? { "x-caption-controller": controllerToken }
          : {}),
        ...(Number.isSafeInteger(transcriptionAttempt) &&
        Number(transcriptionAttempt) > 0
          ? {
              "x-caption-transcription-attempt": String(
                transcriptionAttempt,
              ),
            }
          : {}),
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
      );
    }

    return (await response.json()) as TranslationResult;
  }
}
