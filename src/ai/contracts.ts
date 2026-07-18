import type { LanguageLocale, SourceLanguage } from "@/domain/languages";

export type ProviderMode = "cloud-free" | "paid" | "synthetic";

export interface TranscriptSegment {
  id: string;
  text: string;
  startedAtMs: number;
  endedAtMs: number;
  isFinal: boolean;
  detectedLanguage?: LanguageLocale;
  confidence?: number;
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

export interface SummaryProvider {
  readonly id: string;
  readonly mode: ProviderMode;
  summarize(transcript: string): Promise<{ text: string; warnings: string[] }>;
}
