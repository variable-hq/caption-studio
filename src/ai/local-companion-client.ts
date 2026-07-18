import type {
  TranscriptSegment,
  TranscriptionProvider,
  TranscriptionRequest,
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
} from "@/ai/contracts";

export interface LocalCompanionHealth {
  status: "ready" | "starting" | "unavailable";
  version?: string;
  transcription?: { ready: boolean; model?: string };
  translation?: { ready: boolean; model?: string };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export class LocalCompanionClient
  implements TranscriptionProvider, TranslationProvider
{
  readonly id = "local-companion";
  readonly mode = "local" as const;
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = trimTrailingSlash(baseUrl);
  }

  async health(signal?: AbortSignal): Promise<LocalCompanionHealth> {
    const response = await fetch(`${this.baseUrl}/v1/health`, { signal });

    if (!response.ok) {
      throw new Error(`Local companion returned ${response.status}`);
    }

    return (await response.json()) as LocalCompanionHealth;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptSegment[]> {
    const form = new FormData();
    form.append("audio", request.audio, "caption-audio.webm");
    form.append("sourceLanguage", request.sourceLanguage);
    form.append("keywordHints", JSON.stringify(request.keywordHints));

    const response = await fetch(`${this.baseUrl}/v1/transcriptions`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Local transcription failed with ${response.status}`);
    }

    const payload = (await response.json()) as { segments: TranscriptSegment[] };
    return payload.segments;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const response = await fetch(`${this.baseUrl}/v1/translations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Local translation failed with ${response.status}`);
    }

    return (await response.json()) as TranslationResult;
  }
}
