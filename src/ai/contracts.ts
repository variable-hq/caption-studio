import type { LanguageLocale, SourceLanguage } from "@/domain/languages";

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

export interface TranslationResult {
  text: string;
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
