"use client";

import { useId } from "react";
import { TB2_SERVICE_VOCABULARY } from "@/pipeline/bible-terms";

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
import { MAX_TERMINOLOGY_INPUT_CHARS } from "@/live/translation-settings";

const RECORDING_WINDOW_LABELS: Record<RecordingWindowMs, string> = {
  6000: "Fastest: listens 6 seconds at a time",
  9000: "Balanced: listens 9 seconds at a time",
  12000: "Smooth: listens 12 seconds at a time",
  15000: "Smoother: listens 15 seconds at a time",
  18000: "Smoothest: listens 18 seconds at a time",
};

interface TranslationSettingsEditorProps {
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  keywordText: string;
  recordingWindowMs: RecordingWindowMs;
  sourceLabel: string;
  keywordCount: number;
  disabled?: boolean;
  /** The operator's saved account defaults, if any — badges the matching option. */
  defaultSourceLanguage?: SourceLanguage | null;
  defaultTargetLanguage?: LanguageLocale | null;
  defaultRecordingWindowMs?: RecordingWindowMs | null;
  onSourceLanguageChange: (value: SourceLanguage) => void;
  onTargetLanguageChange: (value: LanguageLocale) => void;
  onKeywordTextChange: (value: string) => void;
  onRecordingWindowChange: (value: RecordingWindowMs) => void;
  /** Settings shows languages and words as separate sections; omit to render both. */
  part?: "languages" | "words";
}

export function TranslationSettingsEditor({
  sourceLanguage,
  targetLanguage,
  keywordText,
  recordingWindowMs,
  sourceLabel,
  keywordCount,
  disabled = false,
  defaultSourceLanguage = null,
  defaultTargetLanguage = null,
  defaultRecordingWindowMs = null,
  part,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onKeywordTextChange,
  onRecordingWindowChange,
}: TranslationSettingsEditorProps) {
  const sourceHelpId = useId();
  const windowHelpId = useId();
  const glossaryHelpId = useId();

  const showLanguages = part !== "words";
  const showWords = part !== "languages";

  return (
    <div className="translationSettingsEditor">
      {showLanguages ? (
        <>
          <div className="fieldGrid">
            <label>
              Preacher speaks
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
                <option value="auto">Detect automatically{defaultSourceLanguage === "auto" ? " · Your default" : ""}</option>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option value={language.locale} key={language.locale}>
                    {language.label}{defaultSourceLanguage === language.locale ? " · Your default" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Show captions in
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
              Caption speed
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
          </div>
          <p className="helpText" id={sourceHelpId}>
            Now: {sourceLabel}. Choosing the language is more reliable than detecting it.
          </p>
          <p className="helpText" id={windowHelpId}>
            Listening longer gives fuller sentences, but captions appear later.
          </p>
        </>
      ) : null}
      {showWords ? (
        <>
          <div className="fieldHeading">
            <strong>Names and terms</strong>
            <span>{keywordCount} {keywordCount === 1 ? "term" : "terms"}</span>
          </div>
          <label>
            Names and terms the AI should know
            <textarea
              name="terminology"
              autoComplete="off"
              spellCheck={false}
              rows={5}
              value={keywordText}
              maxLength={MAX_TERMINOLOGY_INPUT_CHARS}
              disabled={disabled}
              aria-describedby={glossaryHelpId}
              onChange={(event) => onKeywordTextChange(event.target.value)}
              placeholder="e.g. Pastor Ken, Betlehem => Bethlehem…"
            />
          </label>
          <p className="helpText" id={glossaryHelpId}>
            Separate entries with commas. A plain name helps the AI hear it. Write{" "}
            <code>word =&gt; translation</code> to always translate it that way, or{" "}
            <code>Saul|swauf =&gt; Saul</code> to fix a word the AI mishears.
          </p>
          <details className="advancedActions">
            <summary>Import Bible names (Indonesian → English)</summary>
            <p className="helpText">
              Adds the TB2 list of names once. Only useful when the preacher speaks
              Indonesian and captions are in English.
            </p>
            <button className="secondaryButton" type="button" disabled={disabled || targetLanguage !== "en" || !["id", "auto"].includes(sourceLanguage)}
              onClick={() => onKeywordTextChange([keywordText, TB2_SERVICE_VOCABULARY].filter(Boolean).join(", "))}>
              Import names
            </button>
          </details>
        </>
      ) : null}
    </div>
  );
}
