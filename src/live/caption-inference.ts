import type {
  InferenceAttemptContext,
  TranscriptionResult,
  TranslationResult,
} from "@/ai/contracts";
import type { CloudProviderClient } from "@/ai/cloud-provider-client";
import type { LanguageLocale } from "@/domain/languages";
import type { TranslationSessionSettings } from "@/live/translation-settings";
import { parseGlossaryInput, preferredTermMap } from "@/live/config";
import { correctApprovedRecognitionVariants } from "@/pipeline/recognition-variants";
import { keywordHints } from "@/pipeline/glossary";
import { normalizeLiveNote } from "@/live/live-note";
import type { LiveSessionClient } from "@/live/session-client";

type TranscriptionLease = Awaited<ReturnType<LiveSessionClient["reserveTranscriptionAttempt"]>>;

/** One reserve → transcribe pass, before any translation. */
export interface CaptionTranscriptionResult {
  lease: TranscriptionLease;
  inferenceContext: InferenceAttemptContext;
  glossary: ReturnType<typeof parseGlossaryInput>;
  originalSource: string;
  sourceText: string;
  detectedLanguage: LanguageLocale;
  droppedSegments: number;
}

export interface CaptionInferenceResult extends CaptionTranscriptionResult {
  translation: TranslationResult;
}

interface CaptionInferenceDependencies {
  reserve: (controllerToken: string) => Promise<TranscriptionLease>;
  transcribe: CloudProviderClient["transcribe"];
  translate: CloudProviderClient["translate"];
}

interface RunCaptionTranscriptionOptions {
  audio: Blob;
  settings: TranslationSessionSettings;
  glossary?: ReturnType<typeof parseGlossaryInput>;
  controllerToken: string;
  recentContext: string[];
  signal: AbortSignal;
  isCurrent: () => boolean;
  currentRevision: number;
  onRevisionMismatch: (lease: TranscriptionLease) => void;
  onLease: (lease: TranscriptionLease) => void;
  onDroppedSegments: (count: number) => void;
  onTranscriptionError?: (error: unknown) => void;
  dependencies: Pick<CaptionInferenceDependencies, "reserve" | "transcribe">;
}

interface RunCaptionTranslationOptions {
  transcription: CaptionTranscriptionResult;
  settings: TranslationSessionSettings;
  recentContext: string[];
  liveNote?: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  onTranslation: (translation: TranslationResult) => void;
  onTranslationError: (error: unknown) => void;
  dependencies: Pick<CaptionInferenceDependencies, "translate">;
}

interface RunCaptionInferenceOptions {
  audio: Blob;
  settings: TranslationSessionSettings;
  glossary?: ReturnType<typeof parseGlossaryInput>;
  controllerToken: string;
  recentContext: string[];
  liveNote?: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  currentRevision: number;
  onRevisionMismatch: (lease: TranscriptionLease) => void;
  onLease: (lease: TranscriptionLease) => void;
  onDroppedSegments: (count: number) => void;
  onTranscriptionError?: (error: unknown) => void;
  onTranslation: (translation: TranslationResult) => void;
  onTranslationError: (error: unknown) => void;
  dependencies: CaptionInferenceDependencies;
}

/** Reserve an attempt and transcribe one window; no translation call. */
export async function runCaptionTranscription(
  options: RunCaptionTranscriptionOptions,
): Promise<CaptionTranscriptionResult | null> {
  const lease = await options.dependencies.reserve(options.controllerToken);
  options.onLease(lease);
  if (!options.isCurrent()) return null;
  if (lease.translationRevision !== options.currentRevision) {
    options.onRevisionMismatch(lease);
    return null;
  }
  const current = options.settings;
  const glossary = options.glossary ?? parseGlossaryInput(current.keywordText, current.targetLanguage);
  const inferenceContext: InferenceAttemptContext = {
    controllerToken: options.controllerToken,
    transcriptionAttempt: lease.transcriptionRequests,
  };
  let transcription: TranscriptionResult;
  try {
    transcription = await options.dependencies.transcribe(
      {
        audio: options.audio,
        sourceLanguage: current.sourceLanguage,
        keywordHints: keywordHints(glossary.map((entry) => ({ ...entry, variants: [] }))),
        previousTranscript: options.recentContext.at(-1),
        sanitizeLevel: current.sanitizeLevel,
      },
      inferenceContext,
      options.signal,
    );
  } catch (error) {
    options.onTranscriptionError?.(error);
    throw error;
  }
  if (!options.isCurrent()) return null;
  if (transcription.droppedSegments > 0) options.onDroppedSegments(transcription.droppedSegments);

  const finalSegments = transcription.segments.filter(({ isFinal, text }) => isFinal && text.trim());
  if (!finalSegments.length) return null;
  const originalSource = finalSegments.map(({ text }) => text.trim()).join(" ");
  const sourceText = correctApprovedRecognitionVariants(originalSource, glossary);
  const detectedLanguage = current.sourceLanguage === "auto"
    ? finalSegments.find(({ detectedLanguage: locale }) => locale)?.detectedLanguage
    : current.sourceLanguage;
  if (!detectedLanguage) {
    throw new Error("The spoken language could not be detected. Select it explicitly and restart.");
  }
  return {
    lease,
    inferenceContext,
    glossary,
    originalSource,
    sourceText,
    detectedLanguage,
    droppedSegments: transcription.droppedSegments,
  };
}

/** Translate a transcription result, returning the complete caption inference. */
export async function runCaptionTranslation(
  options: RunCaptionTranslationOptions,
): Promise<CaptionInferenceResult | null> {
  const { transcription } = options;
  const current = options.settings;
  let translation: TranslationResult = { text: transcription.sourceText };
  if (transcription.detectedLanguage !== current.targetLanguage) {
    try {
      const liveNote = normalizeLiveNote(options.liveNote);
      translation = await options.dependencies.translate(
        {
          text: transcription.sourceText,
          sourceLanguage: transcription.detectedLanguage,
          targetLanguage: current.targetLanguage,
          recentContext: options.recentContext,
          preferredTerms: preferredTermMap(transcription.glossary, current.targetLanguage),
          translationSystemPrompt: current.translationSystemPrompt,
          inferenceLevel: current.inferenceLevel,
          sanitizeLevel: current.sanitizeLevel,
          filterInappropriateLanguage: current.filterInappropriateLanguage,
          ...(liveNote ? { liveNote } : {}),
        },
        transcription.inferenceContext,
        options.signal,
      );
    } catch (error) {
      options.onTranslationError(error);
      throw error;
    }
    options.onTranslation(translation);
  }
  if (!options.isCurrent()) return null;
  return { ...transcription, translation };
}

/** The shared reserve → transcribe → translate path used by finals. */
export async function runCaptionInference(
  options: RunCaptionInferenceOptions,
): Promise<CaptionInferenceResult | null> {
  const transcription = await runCaptionTranscription(options);
  if (!transcription) return null;
  return runCaptionTranslation({
    transcription,
    settings: options.settings,
    recentContext: options.recentContext,
    liveNote: options.liveNote,
    signal: options.signal,
    isCurrent: options.isCurrent,
    onTranslation: options.onTranslation,
    onTranslationError: options.onTranslationError,
    dependencies: { translate: options.dependencies.translate },
  });
}
