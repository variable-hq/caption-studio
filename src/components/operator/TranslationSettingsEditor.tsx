"use client";

import { useId } from "react";

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
  recordingWindowMs: RecordingWindowMs;
  sourceLabel: string;
  disabled?: boolean;
  /** The operator's saved account defaults, if any — badges the matching option. */
  defaultSourceLanguage?: SourceLanguage | null;
  defaultTargetLanguage?: LanguageLocale | null;
  defaultRecordingWindowMs?: RecordingWindowMs | null;
  onSourceLanguageChange: (value: SourceLanguage) => void;
  onTargetLanguageChange: (value: LanguageLocale) => void;
  onRecordingWindowChange: (value: RecordingWindowMs) => void;
}

export function TranslationSettingsEditor({
  sourceLanguage,
  targetLanguage,
  recordingWindowMs,
  sourceLabel,
  disabled = false,
  defaultSourceLanguage = null,
  defaultTargetLanguage = null,
  defaultRecordingWindowMs = null,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onRecordingWindowChange,
}: TranslationSettingsEditorProps) {
  const sourceHelpId = useId();
  const windowHelpId = useId();

  return (
    <div className="translationSettingsEditor">
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
            <option value="auto">Detect automatically{defaultSourceLanguage === "auto" ? " · Church default" : ""}</option>
            {LANGUAGE_OPTIONS.map((language) => (
              <option value={language.locale} key={language.locale}>
                {language.label}{defaultSourceLanguage === language.locale ? " · Church default" : ""}
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
                {language.label}{defaultTargetLanguage === language.locale ? " · Church default" : ""}
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
                {RECORDING_WINDOW_LABELS[value]}{defaultRecordingWindowMs === value ? " · Church default" : ""}
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
    </div>
  );
}
