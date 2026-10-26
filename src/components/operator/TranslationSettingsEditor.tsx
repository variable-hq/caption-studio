"use client";

import { SettingGroup } from "@/components/operator/SettingsParts";

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
  disabled = false,
  defaultSourceLanguage = null,
  defaultTargetLanguage = null,
  defaultRecordingWindowMs = null,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onRecordingWindowChange,
}: TranslationSettingsEditorProps) {
  return (
    <>
      <SettingGroup title="Languages" hint="Choosing the preacher’s language is more reliable than detecting it.">
        <div className="fieldGrid">
            <label>
              Preacher speaks
              <select
                name="sourceLanguage"
                autoComplete="off"
                data-testid="source-language"
                value={sourceLanguage}
                disabled={disabled}
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
        </div>
      </SettingGroup>
      <SettingGroup title="Caption speed" hint="Listening longer gives fuller sentences, but captions appear later.">
          <label>
            <span className="visuallyHidden">Caption speed</span>
            <select
              name="recordingWindow"
              autoComplete="off"
              data-testid="recording-window"
              value={recordingWindowMs}
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
      </SettingGroup>
    </>
  );
}
