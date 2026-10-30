import type {
  InferenceAttemptContext,
  TranscriptionResult,
  TranslationResult,
} from "@/ai/contracts";
import type { CloudProviderClient } from "@/ai/cloud-provider-client";
import type { TranslationSessionSettings } from "@/live/translation-settings";
import { parseGlossaryInput, preferredTermMap } from "@/live/config";
import { correctApprovedRecognitionVariants } from "@/pipeline/bible-terms";
import { keywordHints } from "@/pipeline/glossary";
import { normalizeLiveNote } from "@/live/live-note";
import type { LiveSessionClient } from "@/live/session-client";

type TranscriptionLease = Awaited<ReturnType<LiveSessionClient["reserveTranscriptionAttempt"]>>;

export interface CaptionInferenceResult {
  lease: TranscriptionLease;
  inferenceContext: InferenceAttemptContext;
  glossary: ReturnType<typeof parseGlossaryInput>;
  originalSource: string;
  sourceText: string;
  detectedLanguage: string;
  translation: TranslationResult;
}

interface CaptionInferenceDependencies {
  reserve: (controllerToken: string) => Promise<TranscriptionLease>;
  transcribe: CloudProviderClient["transcribe"];
  translate: CloudProviderClient["translate"];
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

/** The shared reserve → transcribe → translate path used by finals and drafts. */
export async function runCaptionInference(
  options: RunCaptionInferenceOptions,
): Promise<CaptionInferenceResult | null> {
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

  let translation: TranslationResult = { text: sourceText };
  if (detectedLanguage !== current.targetLanguage) {
    try {
      const liveNote = normalizeLiveNote(options.liveNote);
      translation = await options.dependencies.translate(
        {
          text: sourceText,
          sourceLanguage: detectedLanguage,
          targetLanguage: current.targetLanguage,
          recentContext: options.recentContext,
          preferredTerms: preferredTermMap(glossary, current.targetLanguage),
          translationSystemPrompt: current.translationSystemPrompt,
          inferenceLevel: current.inferenceLevel,
          sanitizeLevel: current.sanitizeLevel,
          filterInappropriateLanguage: current.filterInappropriateLanguage,
          ...(liveNote ? { liveNote } : {}),
        },
        inferenceContext,
        options.signal,
      );
    } catch (error) {
      options.onTranslationError(error);
      throw error;
    }
    options.onTranslation(translation);
  }
  if (!options.isCurrent()) return null;
  return { lease, inferenceContext, glossary, originalSource, sourceText, detectedLanguage, translation };
}
