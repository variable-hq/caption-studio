/**
 * AI providers a workspace can choose per stage (ADR 0041). Shared by the server and the
 * operator UI, so it holds no credentials. Groq runs on the deployment's own key; the other
 * providers need a key the workspace saves (write-only, encrypted at rest).
 */

export const AI_PROVIDER_IDS = ["groq", "openai", "anthropic", "deepseek"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

/** Providers whose key an operator saves; Groq uses the `GROQ_API_KEY` deployment secret. */
export const KEYED_PROVIDER_IDS = ["openai", "anthropic", "deepseek"] as const;
export type KeyedProviderId = (typeof KEYED_PROVIDER_IDS)[number];

/** Only providers with a speech-to-text API that returns per-segment quality metadata. */
export const TRANSCRIPTION_PROVIDER_IDS = ["groq", "openai"] as const;
export type TranscriptionProviderId = (typeof TRANSCRIPTION_PROVIDER_IDS)[number];

export const TRANSLATION_PROVIDER_IDS = AI_PROVIDER_IDS;
export type TranslationProviderId = AiProviderId;

export const AI_PROVIDER_LABELS: Readonly<Record<AiProviderId, string>> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Claude (Anthropic)",
  deepseek: "DeepSeek",
};

/** Default model per provider; an operator may enter another id, which readiness verifies. */
export const DEFAULT_TRANSCRIPTION_MODELS: Readonly<Record<TranscriptionProviderId, string>> = {
  groq: "whisper-large-v3-turbo",
  // whisper-1 returns verbose_json segments, which the transcript guard needs.
  openai: "whisper-1",
};

export const DEFAULT_TRANSLATION_MODELS: Readonly<Record<TranslationProviderId, string>> = {
  groq: "openai/gpt-oss-20b",
  openai: "gpt-5.4-nano",
  anthropic: "claude-opus-5-5",
  deepseek: "deepseek-flash",
};

/** Suggestions offered in the model field; not an allow-list. */
export const SUGGESTED_TRANSLATION_MODELS: Readonly<Record<TranslationProviderId, readonly string[]>> = {
  groq: ["openai/gpt-oss-20b"],
  openai: ["gpt-5.4-nano", "gpt-5.4-mini"],
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  deepseek: ["deepseek-flash", "deepseek-v4-pro"],
};

export interface StageSelection<P extends string = AiProviderId> {
  provider: P;
  /** Empty means the provider's default model. */
  model: string;
}

export interface ProviderSelections {
  transcription: StageSelection<TranscriptionProviderId>;
  translation: StageSelection<TranslationProviderId>;
}

export const DEFAULT_PROVIDER_SELECTIONS: ProviderSelections = {
  transcription: { provider: "groq", model: "" },
  translation: { provider: "groq", model: "" },
};

export const MAX_MODEL_ID_LENGTH = 120;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;

export function isKeyedProvider(value: unknown): value is KeyedProviderId {
  return KEYED_PROVIDER_IDS.includes(value as KeyedProviderId);
}

export function isTranscriptionProvider(value: unknown): value is TranscriptionProviderId {
  return TRANSCRIPTION_PROVIDER_IDS.includes(value as TranscriptionProviderId);
}

export function isTranslationProvider(value: unknown): value is TranslationProviderId {
  return TRANSLATION_PROVIDER_IDS.includes(value as TranslationProviderId);
}

/** A model id is optional (empty → default) and otherwise a short, path-safe identifier. */
export function isValidModelIdInput(value: string) {
  const trimmed = value.trim();
  return trimmed === "" || (trimmed.length <= MAX_MODEL_ID_LENGTH && MODEL_ID_PATTERN.test(trimmed));
}

function normalizeModel(value: unknown) {
  return typeof value === "string" && isValidModelIdInput(value) ? value.trim() : "";
}

export function normalizeProviderSelections(value: unknown): ProviderSelections {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const transcription = (record.transcription ?? {}) as Record<string, unknown>;
  const translation = (record.translation ?? {}) as Record<string, unknown>;
  return {
    transcription: isTranscriptionProvider(transcription.provider)
      ? { provider: transcription.provider, model: normalizeModel(transcription.model) }
      : { ...DEFAULT_PROVIDER_SELECTIONS.transcription },
    translation: isTranslationProvider(translation.provider)
      ? { provider: translation.provider, model: normalizeModel(translation.model) }
      : { ...DEFAULT_PROVIDER_SELECTIONS.translation },
  };
}

export function effectiveTranscriptionModel(selection: StageSelection<TranscriptionProviderId>) {
  return selection.model || DEFAULT_TRANSCRIPTION_MODELS[selection.provider];
}

export function effectiveTranslationModel(selection: StageSelection<TranslationProviderId>) {
  return selection.model || DEFAULT_TRANSLATION_MODELS[selection.provider];
}

export const MIN_API_KEY_LENGTH = 20;
export const MAX_API_KEY_LENGTH = 400;
const API_KEY_PATTERN = /^[\x21-\x7e]+$/u;

/** Printable ASCII with no spaces; providers' keys all fit this shape. */
export function isValidApiKeyInput(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= MIN_API_KEY_LENGTH && trimmed.length <= MAX_API_KEY_LENGTH && API_KEY_PATTERN.test(trimmed);
}

/** What the browser may see about a saved key: never the key itself. */
export interface SavedKeySummary {
  last4: string;
  savedAt: number;
}

export interface ProviderSettingsView {
  selections: ProviderSelections;
  keys: Partial<Record<KeyedProviderId, SavedKeySummary>>;
}
