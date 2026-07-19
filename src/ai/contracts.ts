import type { LanguageLocale, SourceLanguage } from "@/domain/languages";

export type ProviderMode = "cloud-free" | "paid";

export interface TranscriptSegment {
  id: string;
  text: string;
  startedAtMs: number;
  endedAtMs: number;
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
}

export interface TranslationResult {
  text: string;
  providerLatencyMs: number;
}

export interface TranscriptionProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  transcribe(request: TranscriptionRequest): Promise<TranscriptSegment[]>;
}

export interface TranslationProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  translate(request: TranslationRequest): Promise<TranslationResult>;
}
