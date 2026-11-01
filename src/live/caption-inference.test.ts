import { describe, expect, it, vi } from "vitest";

import type { CloudProviderClient } from "@/ai/cloud-provider-client";
import type { TranscriptionResult, TranslationResult } from "@/ai/contracts";
import {
  runCaptionInference,
  runCaptionTranscription,
  runCaptionTranslation,
} from "@/live/caption-inference";
import type { LiveSessionClient } from "@/live/session-client";
import { normalizeTranslationSessionSettings } from "@/live/translation-settings";

const controllerToken = "c".repeat(43);
const settings = normalizeTranslationSessionSettings({
  sourceLanguage: "id",
  targetLanguage: "en",
  keywordText: "Saul|swauf => Saul",
  recordingWindowMs: "dynamic",
});
const lease = {
  valid: true as const,
  status: "live" as const,
  expiresAt: "2026-11-02T12:00:00.000Z",
  transcriptionRequests: 4,
  captionEpoch: 1,
  translationRevision: 2,
};

function dependencies() {
  const reserve = vi.fn(async () => lease);
  const transcribe = vi.fn(async (): Promise<TranscriptionResult> => ({
    segments: [
      { text: "swauf berbicara", isFinal: true, detectedLanguage: "id" },
      { text: "kepada jemaat", isFinal: true, detectedLanguage: "id" },
    ],
    droppedSegments: 2,
  }));
  const translate = vi.fn(async (): Promise<TranslationResult> => ({ text: "Saul speaks to the congregation", usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 } }));
  return {
    reserve: reserve as unknown as LiveSessionClient["reserveTranscriptionAttempt"],
    transcribe: transcribe as unknown as CloudProviderClient["transcribe"],
    translate: translate as unknown as CloudProviderClient["translate"],
    calls: { reserve, transcribe, translate },
  };
}

function transcriptionOptions(deps: ReturnType<typeof dependencies>) {
  const onDroppedSegments = vi.fn();
  return {
    options: {
      audio: new Blob(["audio"]),
      settings,
      controllerToken,
      recentContext: ["earlier words"],
      signal: new AbortController().signal,
      isCurrent: () => true,
      currentRevision: lease.translationRevision,
      onRevisionMismatch: vi.fn(),
      onLease: vi.fn(),
      onDroppedSegments,
      dependencies: { reserve: deps.reserve, transcribe: deps.transcribe },
    },
    onDroppedSegments,
  };
}

describe("caption inference stages", () => {
  it("transcribes without translating, with the same post-processing as a final", async () => {
    const deps = dependencies();
    const { options, onDroppedSegments } = transcriptionOptions(deps);

    const result = await runCaptionTranscription(options);

    expect(deps.calls.translate).not.toHaveBeenCalled();
    expect(deps.calls.transcribe).toHaveBeenCalledOnce();
    expect(onDroppedSegments).toHaveBeenCalledWith(2);
    expect(result).toMatchObject({
      originalSource: "swauf berbicara kepada jemaat",
      sourceText: "Saul berbicara kepada jemaat",
      detectedLanguage: "id",
      droppedSegments: 2,
      inferenceContext: { controllerToken, transcriptionAttempt: 4 },
    });
  });

  it("translates an existing transcription without reserving or transcribing again", async () => {
    const deps = dependencies();
    const { options } = transcriptionOptions(deps);
    const transcription = await runCaptionTranscription(options);
    if (!transcription) throw new Error("expected a transcription");

    const result = await runCaptionTranslation({
      transcription,
      settings,
      recentContext: [],
      signal: new AbortController().signal,
      isCurrent: () => true,
      onTranslation: vi.fn(),
      onTranslationError: vi.fn(),
      dependencies: { translate: deps.translate },
    });

    expect(deps.calls.reserve).toHaveBeenCalledOnce();
    expect(deps.calls.transcribe).toHaveBeenCalledOnce();
    expect(deps.calls.translate).toHaveBeenCalledOnce();
    expect(result?.translation.text).toBe("Saul speaks to the congregation");
    expect(result?.inferenceContext).toEqual({ controllerToken, transcriptionAttempt: 4 });
  });

  it("composes both stages exactly as the final path did", async () => {
    const deps = dependencies();
    const { options } = transcriptionOptions(deps);
    const onTranslation = vi.fn();

    const result = await runCaptionInference({
      ...options,
      liveNote: " Slow down. ",
      onTranslation,
      onTranslationError: vi.fn(),
      dependencies: { reserve: deps.reserve, transcribe: deps.transcribe, translate: deps.translate },
    });

    expect(result?.sourceText).toBe("Saul berbicara kepada jemaat");
    expect(result?.translation.text).toBe("Saul speaks to the congregation");
    expect(onTranslation).toHaveBeenCalledOnce();
    expect(deps.calls.translate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Saul berbicara kepada jemaat", liveNote: "Slow down." }),
      expect.objectContaining({ transcriptionAttempt: 4 }),
      expect.anything(),
    );
  });

  it("skips translation when the spoken language is already the target", async () => {
    const deps = dependencies();
    const english = normalizeTranslationSessionSettings({
      sourceLanguage: "en",
      targetLanguage: "en",
      recordingWindowMs: "dynamic",
    });
    deps.calls.transcribe.mockResolvedValue({
      segments: [{ text: "Same language", isFinal: true, detectedLanguage: "en" }],
      droppedSegments: 0,
    });

    const result = await runCaptionInference({
      ...transcriptionOptions(deps).options,
      settings: english,
      onTranslation: vi.fn(),
      onTranslationError: vi.fn(),
      dependencies: { reserve: deps.reserve, transcribe: deps.transcribe, translate: deps.translate },
    });

    expect(deps.calls.translate).not.toHaveBeenCalled();
    expect(result?.translation).toEqual({ text: "Same language" });
  });
});
