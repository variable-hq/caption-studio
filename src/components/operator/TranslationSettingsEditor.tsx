"use client";

import { useId } from "react";
import { TB2_SERVICE_VOCABULARY } from "@/pipeline/bible-terms";

import {
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import {
  SPEECH_BUFFER_OPTIONS_MS,
  normalizeSpeechBufferMs,
  type SpeechBufferMs,
} from "@/live/contracts";
import {
  MAX_FILTER_INPUT_CHARS,
  MAX_TERMINOLOGY_INPUT_CHARS,
} from "@/live/translation-settings";

const SPEECH_BUFFER_LABELS: Record<SpeechBufferMs, string> = {
  6000: "6 sec · Fast",
  9000: "9 sec · Balanced",
  12000: "12 sec · More context",
  15000: "15 sec · Longer phrases",
  18000: "18 sec · Longest context",
};

interface TranslationSettingsEditorProps {
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  keywordText: string;
  filterText: string;
  speechBufferMs: SpeechBufferMs;
  sourceLabel: string;
  keywordCount: number;
  disabled?: boolean;
  onSourceLanguageChange: (value: SourceLanguage) => void;
  onTargetLanguageChange: (value: LanguageLocale) => void;
  onKeywordTextChange: (value: string) => void;
  onFilterTextChange: (value: string) => void;
  onSpeechBufferChange: (value: SpeechBufferMs) => void;
}

export function TranslationSettingsEditor({
  sourceLanguage,
  targetLanguage,
  keywordText,
  filterText,
  speechBufferMs,
  sourceLabel,
  keywordCount,
  disabled = false,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onKeywordTextChange,
  onFilterTextChange,
  onSpeechBufferChange,
}: TranslationSettingsEditorProps) {
  const sourceHelpId = useId();
  const bufferHelpId = useId();
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
            <option value="auto">Auto detect</option>
            {LANGUAGE_OPTIONS.map((language) => (
              <option value={language.locale} key={language.locale}>
                {language.label}
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
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <label className="fullField">
          Speech buffer before translation
          <select
            name="speechBuffer"
            autoComplete="off"
            data-testid="speech-buffer"
            value={speechBufferMs}
            aria-describedby={bufferHelpId}
            disabled={disabled}
            onChange={(event) =>
              onSpeechBufferChange(normalizeSpeechBufferMs(event.target.value))
            }
          >
            {SPEECH_BUFFER_OPTIONS_MS.map((value) => (
              <option value={value} key={value}>
                {SPEECH_BUFFER_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="helpText" id={sourceHelpId}>
        Selected source: {sourceLabel}. Explicit selection is recommended live.
      </p>
      <p className="helpText" id={bufferHelpId}>
        Longer windows can reduce chopped sentences, but captions appear later.
        Refreshing discards the unfinished audio window and recent translation context.
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
      <button className="secondaryButton" type="button" disabled={disabled || targetLanguage !== "en" || !["id", "auto"].includes(sourceLanguage)}
        onClick={() => onKeywordTextChange([keywordText, TB2_SERVICE_VOCABULARY].filter(Boolean).join(", "))}>
        Add TB2 names for Indonesian to English
      </button>
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
          placeholder="Words to mask, separated by commas…"
        />
      </label>
      <p className="privacyNote" id={filterHelpId}>
        Filtering changes only the public caption. Source text stays in this operator tab.
      </p>
    </div>
  );
}
