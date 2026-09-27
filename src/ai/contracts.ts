import type { LanguageLocale, SourceLanguage } from "@/domain/languages";

export const MAX_TRANSLATION_COMPLETION_TOKENS = 256;
/** Matches OUTPUT_BUFFER_BACKING_CAPACITY in src/live/output-buffer.ts. */
export const MAX_BUFFER_REVIEW_ENTRIES = 4;
export const MAX_BUFFER_REVIEW_TEXT_CHARS = 2_000;
export const MAX_BUFFER_REVIEW_COMPLETION_TOKENS = 1_024;

export interface TranscriptSegment {
  text: string;
  isFinal: boolean;
  detectedLanguage?: LanguageLocale;
}

export interface TranscriptionRequest {
  audio: Blob;
  sourceLanguage: SourceLanguage;
  keywordHints: string[];
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: LanguageLocale;
  targetLanguage: LanguageLocale;
  recentContext: string[];
  preferredTerms: Readonly<Record<string, string>>;
  translationSystemPrompt?: string;
}

export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ProviderRateLimitWindow {
  limit: number;
  remaining: number;
  reset: string | null;
}

export interface LlmProviderRateLimitSnapshot {
  model: string;
  observedAt: string;
  requestsPerDay: ProviderRateLimitWindow | null;
  tokensPerMinute: ProviderRateLimitWindow | null;
}

export interface LlmSessionUsage extends LlmTokenUsage {
  translationRequests: number;
  providerRateLimit: LlmProviderRateLimitSnapshot | null;
}

export interface TranslationResult {
  text: string;
  incomplete?: true;
  usage?: LlmTokenUsage;
  rateLimit?: LlmProviderRateLimitSnapshot;
}

export interface InferenceAttemptContext {
  controllerToken: string;
  transcriptionAttempt: number;
}

export interface BufferReviewEntry {
  id: string;
  text: string;
}

/**
 * Beta feature: the model reviews the queued output-buffer captions (never the already
 * published Live caption) for continuity with what is currently on Live.
 */
export interface BufferReviewRequest {
  targetLanguage: LanguageLocale;
  liveText: string;
  entries: BufferReviewEntry[];
}

export interface BufferReviewResult {
  revisions: BufferReviewEntry[];
  incomplete?: true;
  usage?: LlmTokenUsage;
  rateLimit?: LlmProviderRateLimitSnapshot;
}

export interface TranscriptionProvider {
  readonly id: string;
  readonly mode: "cloud-free";
  transcribe(
    request: TranscriptionRequest,
    context: InferenceAttemptContext,
    signal?: AbortSignal,
  ): Promise<TranscriptSegment[]>;
}

export interface TranslationProvider {
  readonly id: string;
  readonly mode: "cloud-free";
  translate(
    request: TranslationRequest,
    context: InferenceAttemptContext,
    signal?: AbortSignal,
  ): Promise<TranslationResult>;
}
