import {
  DEFAULT_INFERENCE_LEVEL,
  INFERENCE_LEVEL_OPTIONS,
  normalizeInferenceLevel,
  type InferenceLevel,
} from "@/ai/contracts";
import {
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  normalizeTranslationSystemPrompt,
} from "@/ai/translation-prompt";
import {
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TARGET_LANGUAGE,
  isLanguageLocale,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import {
  DEFAULT_RECORDING_WINDOW_MS,
  RECORDING_WINDOW_OPTIONS_MS,
  normalizeRecordingWindowMs,
  type RecordingWindowMs,
} from "@/live/contracts";

const TRANSLATION_SETTINGS_STORAGE_VERSION = 4;
export const MAX_TERMINOLOGY_INPUT_CHARS = 8_000;
export const MAX_FILTER_INPUT_CHARS = 4_000;

export interface TranslationSessionSettings {
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  keywordText: string;
  filterText: string;
  recordingWindowMs: RecordingWindowMs;
  translationSystemPrompt: string;
  inferenceLevel: InferenceLevel;
}

interface TranslationSessionIdentity {
  startedAt: string;
  expiresAt: string;
  translationRevision: number;
}

interface StoredTranslationSessionSnapshot
  extends TranslationSessionIdentity {
  settings: TranslationSessionSettings;
}

type TranslationSettingsChange =
  | "Spoken language"
  | "Translation language"
  | "Recording window"
  | "Terminology"
  | "Public filter"
  | "System prompt"
  | "Inference level";

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

export function normalizeTranslationSessionSettings(
  input: Partial<TranslationSessionSettings>,
): TranslationSessionSettings {
  const sourceLanguage =
    input.sourceLanguage === "auto" ||
    (typeof input.sourceLanguage === "string" &&
      isLanguageLocale(input.sourceLanguage))
      ? input.sourceLanguage
      : DEFAULT_SOURCE_LANGUAGE;
  const targetLanguage =
    typeof input.targetLanguage === "string" &&
    isLanguageLocale(input.targetLanguage)
      ? input.targetLanguage
      : DEFAULT_TARGET_LANGUAGE;

  return {
    sourceLanguage,
    targetLanguage,
    keywordText: boundedText(input.keywordText, MAX_TERMINOLOGY_INPUT_CHARS),
    filterText: boundedText(input.filterText, MAX_FILTER_INPUT_CHARS),
    recordingWindowMs: normalizeRecordingWindowMs(
      input.recordingWindowMs ?? DEFAULT_RECORDING_WINDOW_MS,
    ),
    translationSystemPrompt: normalizeTranslationSystemPrompt(
      input.translationSystemPrompt ?? DEFAULT_TRANSLATION_SYSTEM_PROMPT,
    ),
    inferenceLevel: normalizeInferenceLevel(
      input.inferenceLevel ?? DEFAULT_INFERENCE_LEVEL,
    ),
  };
}

export function translationSettingsFingerprint(
  settings: TranslationSessionSettings,
) {
  return JSON.stringify(normalizeTranslationSessionSettings(settings));
}

export function translationSettingsChanges(
  active: TranslationSessionSettings,
  draft: TranslationSessionSettings,
): TranslationSettingsChange[] {
  const current = normalizeTranslationSessionSettings(active);
  const next = normalizeTranslationSessionSettings(draft);
  const changes: TranslationSettingsChange[] = [];

  if (current.sourceLanguage !== next.sourceLanguage) {
    changes.push("Spoken language");
  }
  if (current.targetLanguage !== next.targetLanguage) {
    changes.push("Translation language");
  }
  if (current.recordingWindowMs !== next.recordingWindowMs) {
    changes.push("Recording window");
  }
  if (current.keywordText !== next.keywordText) {
    changes.push("Terminology");
  }
  if (current.filterText !== next.filterText) {
    changes.push("Public filter");
  }
  if (current.translationSystemPrompt !== next.translationSystemPrompt) {
    changes.push("System prompt");
  }
  if (current.inferenceLevel !== next.inferenceLevel) {
    changes.push("Inference level");
  }

  return changes;
}

export function serializeTranslationSessionSettings(
  settings: TranslationSessionSettings,
  identity: TranslationSessionIdentity,
) {
  if (!validTranslationSessionIdentity(identity)) {
    throw new Error("The live-service identity is invalid.");
  }
  return JSON.stringify({
    version: TRANSLATION_SETTINGS_STORAGE_VERSION,
    settings: normalizeTranslationSessionSettings(settings),
    startedAt: identity.startedAt,
    expiresAt: identity.expiresAt,
    translationRevision: identity.translationRevision,
  });
}

export function parseStoredTranslationSessionSettings(
  value: string | null,
): StoredTranslationSessionSnapshot | null {
  if (!value) return null;
  try {
    const payload = JSON.parse(value) as {
      version?: unknown;
      settings?: Partial<TranslationSessionSettings>;
      startedAt?: unknown;
      expiresAt?: unknown;
      translationRevision?: unknown;
    };
    const settings = payload.settings;
    if (
      payload.version !== TRANSLATION_SETTINGS_STORAGE_VERSION ||
      !settings ||
      !(
        settings.sourceLanguage === "auto" ||
        (typeof settings.sourceLanguage === "string" &&
          isLanguageLocale(settings.sourceLanguage))
      ) ||
      typeof settings.targetLanguage !== "string" ||
      !isLanguageLocale(settings.targetLanguage) ||
      typeof settings.keywordText !== "string" ||
      settings.keywordText.length > MAX_TERMINOLOGY_INPUT_CHARS ||
      typeof settings.filterText !== "string" ||
      settings.filterText.length > MAX_FILTER_INPUT_CHARS ||
      !RECORDING_WINDOW_OPTIONS_MS.includes(
        Number(settings.recordingWindowMs) as RecordingWindowMs,
      ) ||
      typeof settings.translationSystemPrompt !== "string" ||
      !INFERENCE_LEVEL_OPTIONS.includes(settings.inferenceLevel as InferenceLevel) ||
      !validTranslationSessionIdentity(payload)
    ) {
      return null;
    }
    return {
      settings: normalizeTranslationSessionSettings(settings),
      startedAt: payload.startedAt,
      expiresAt: payload.expiresAt,
      translationRevision: payload.translationRevision,
    };
  } catch {
    return null;
  }
}

export function translationSessionSnapshotMatches(
  snapshot: StoredTranslationSessionSnapshot,
  identity: TranslationSessionIdentity,
) {
  return (
    validTranslationSessionIdentity(identity) &&
    snapshot.startedAt === identity.startedAt &&
    snapshot.expiresAt === identity.expiresAt &&
    snapshot.translationRevision === identity.translationRevision
  );
}

function validTranslationSessionIdentity(
  value: {
    startedAt?: unknown;
    expiresAt?: unknown;
    translationRevision?: unknown;
  },
): value is TranslationSessionIdentity {
  if (
    typeof value.startedAt !== "string" ||
    typeof value.expiresAt !== "string" ||
    !Number.isSafeInteger(value.translationRevision) ||
    Number(value.translationRevision) < 0
  ) {
    return false;
  }
  const startedAt = Date.parse(value.startedAt);
  const expiresAt = Date.parse(value.expiresAt);
  return (
    Number.isFinite(startedAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > startedAt
  );
}
