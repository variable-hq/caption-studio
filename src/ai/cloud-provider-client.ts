import type {
  TranscriptSegment,
  TranscriptionProvider,
  TranscriptionRequest,
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "@/ai/contracts";

export interface CloudProviderHealth {
  status: "ready" | "not-configured" | "unavailable";
  hosting: string;
  access: { ready: boolean; provider: string };
  transcription: { ready: boolean; model: string };
  translation: { ready: boolean; model: string };
}

async function readError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error ?? fallback;
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

  async transcribe(request: TranscriptionRequest): Promise<TranscriptSegment[]> {
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
      signal: AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Cloud transcription failed."));
    }

    const payload = (await response.json()) as { segments: TranscriptSegment[] };
    return payload.segments;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const response = await fetch("/api/ai/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      throw new Error(await readError(response, "Cloud translation failed."));
    }

    return (await response.json()) as TranslationResult;
  }
}
