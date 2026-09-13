import type { LanguageLocale, SourceLanguage } from "@/domain/languages";

export const MAX_TRANSLATION_COMPLETION_TOKENS = 256;

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

export interface TranscriptionProvider {
  readonly id: string;
  readonly mode: "cloud-free";
  transcribe(request: TranscriptionRequest): Promise<TranscriptSegment[]>;
}

export interface TranslationProvider {
  readonly id: string;
  readonly mode: "cloud-free";
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
