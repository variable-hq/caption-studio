"use client";

import { useId } from "react";
import { TB2_SERVICE_VOCABULARY } from "@/pipeline/bible-terms";

import {
  INFERENCE_LEVEL_OPTIONS,
  normalizeInferenceLevel,
  type InferenceLevel,
} from "@/ai/contracts";
import {
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import {
  RECORDING_WINDOW_OPTIONS_MS,
  normalizeRecordingWindowMs,
  type RecordingWindowMs,
} from "@/live/contracts";
import {
  MAX_FILTER_INPUT_CHARS,
  MAX_TERMINOLOGY_INPUT_CHARS,
} from "@/live/translation-settings";

const RECORDING_WINDOW_LABELS: Record<RecordingWindowMs, string> = {
  6000: "6 sec · Fast",
  9000: "9 sec · Balanced",
  12000: "12 sec · More context",
  15000: "15 sec · Longer phrases",
  18000: "18 sec · Longest context",
};

const INFERENCE_LEVEL_LABELS: Record<InferenceLevel, string> = {
  low: "Low",
  balanced: "Balanced",
  high: "High",
};

interface TranslationSettingsEditorProps {
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  keywordText: string;
  filterText: string;
  recordingWindowMs: RecordingWindowMs;
  inferenceLevel: InferenceLevel;
  sourceLabel: string;
  keywordCount: number;
  disabled?: boolean;
  /** The operator's saved account defaults, if any — badges the matching option. */
  defaultSourceLanguage?: SourceLanguage | null;
  defaultTargetLanguage?: LanguageLocale | null;
  defaultRecordingWindowMs?: RecordingWindowMs | null;
  defaultInferenceLevel?: InferenceLevel | null;
  onSourceLanguageChange: (value: SourceLanguage) => void;
  onTargetLanguageChange: (value: LanguageLocale) => void;
  onKeywordTextChange: (value: string) => void;
  onFilterTextChange: (value: string) => void;
  onRecordingWindowChange: (value: RecordingWindowMs) => void;
  onInferenceLevelChange: (value: InferenceLevel) => void;
}

export function TranslationSettingsEditor({
  sourceLanguage,
  targetLanguage,
  keywordText,
  filterText,
  recordingWindowMs,
  inferenceLevel,
  sourceLabel,
  keywordCount,
  disabled = false,
  defaultSourceLanguage = null,
  defaultTargetLanguage = null,
  defaultRecordingWindowMs = null,
  defaultInferenceLevel = null,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onKeywordTextChange,
  onFilterTextChange,
  onRecordingWindowChange,
  onInferenceLevelChange,
}: TranslationSettingsEditorProps) {
  const sourceHelpId = useId();
  const windowHelpId = useId();
  const inferenceHelpId = useId();
  const glossaryHelpId = useId();
  const filterHelpId = useId();

  return (
    <div className="translationSettingsEditor">
      <div className="fieldGrid">
        <label>
          Spoken language
          <select
            name="sourceLanguage"
            autoComplete="off"
            data-testid="source-language"
            value={sourceLanguage}
            disabled={disabled}
            aria-describedby={sourceHelpId}
            onChange={(event) =>
              onSourceLanguageChange(event.target.value as SourceLanguage)
            }
          >
            <option value="auto">Auto detect{defaultSourceLanguage === "auto" ? " · Your default" : ""}</option>
            {LANGUAGE_OPTIONS.map((language) => (
              <option value={language.locale} key={language.locale}>
                {language.label}{defaultSourceLanguage === language.locale ? " · Your default" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Translate captions to
          <select
            name="targetLanguage"
            autoComplete="off"
            data-testid="target-language"
            value={targetLanguage}
            disabled={disabled}
            onChange={(event) =>
              onTargetLanguageChange(event.target.value as LanguageLocale)
            }
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option value={language.locale} key={language.locale}>
                {language.label}{defaultTargetLanguage === language.locale ? " · Your default" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="fullField">
          Recording window before translation
          <select
            name="recordingWindow"
            autoComplete="off"
            data-testid="recording-window"
            value={recordingWindowMs}
            aria-describedby={windowHelpId}
            disabled={disabled}
            onChange={(event) =>
              onRecordingWindowChange(normalizeRecordingWindowMs(event.target.value))
            }
          >
            {RECORDING_WINDOW_OPTIONS_MS.map((value) => (
              <option value={value} key={value}>
                {RECORDING_WINDOW_LABELS[value]}{defaultRecordingWindowMs === value ? " · Your default" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="fullField">
          Inference level
          <select
            name="inferenceLevel"
            autoComplete="off"
            data-testid="inference-level"
            value={inferenceLevel}
            aria-describedby={inferenceHelpId}
            disabled={disabled}
            onChange={(event) =>
              onInferenceLevelChange(normalizeInferenceLevel(event.target.value))
            }
          >
            {INFERENCE_LEVEL_OPTIONS.map((level) => (
              <option value={level} key={level}>
                {INFERENCE_LEVEL_LABELS[level]}{defaultInferenceLevel === level ? " · Your default" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="helpText" id={sourceHelpId}>
        Selected source: {sourceLabel}. Explicit selection is recommended live.
      </p>
      <p className="helpText" id={windowHelpId}>
        Longer windows can reduce chopped sentences, but captions appear later.
        Refreshing discards the unfinished audio window and recent translation context.
      </p>
      <p className="helpText" id={inferenceHelpId}>
        Low stays close to word-for-word with minimal corrections — fastest. Balanced
        (default) keeps captions coherent without changing meaning. High favors natural
        coherence over literal accuracy, allowing bolder rewording.
      </p>
      <div className="divider" />
      <div className="fieldHeading">
        <strong>Church terminology</strong>
        <span>{keywordCount} terms</span>
      </div>
      <label>
        Biblical names and keyword hints
        <textarea
          name="terminology"
          autoComplete="off"
          rows={4}
          value={keywordText}
          maxLength={MAX_TERMINOLOGY_INPUT_CHARS}
          disabled={disabled}
          aria-describedby={glossaryHelpId}
          onChange={(event) => onKeywordTextChange(event.target.value)}
          placeholder="Saul => Saul, Betlehem => Bethlehem…"
        />
      </label>
      <p className="helpText" id={glossaryHelpId}>
        Use <code>source =&gt; approved translation</code> for deterministic terms.
        Other entries boost transcription recognition. An approved recognition correction
        uses <code>Saul|swauf =&gt; Saul</code>. Review variants before adding them;
        these replace whole words in the source transcript.
      </p>
      <details className="advancedActions">
        <summary>More options</summary>
        <button className="secondaryButton" type="button" disabled={disabled || targetLanguage !== "en" || !["id", "auto"].includes(sourceLanguage)}
          onClick={() => onKeywordTextChange([keywordText, TB2_SERVICE_VOCABULARY].filter(Boolean).join(", "))}>
          Add TB2 names for Indonesian to English
        </button>
      </details>
      <label>
        Public caption filter
        <input
          name="publicFilter"
          autoComplete="off"
          value={filterText}
          maxLength={MAX_FILTER_INPUT_CHARS}
          disabled={disabled}
          aria-describedby={filterHelpId}
          onChange={(event) => onFilterTextChange(event.target.value)}
          placeholder="word, word=>replacement, word=>!hide…"
        />
      </label>
      <p className="privacyNote" id={filterHelpId}>
        Filtering changes only the public caption. Source text stays in this operator tab.
        A plain word masks it; <code>word=&gt;replacement</code> substitutes text;
        <code>word=&gt;!hide</code> blanks the whole caption.
      </p>
    </div>
  );
}
