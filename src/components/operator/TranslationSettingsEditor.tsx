"use client";

import { SettingGroup } from "@/components/operator/SettingsParts";
import { useT } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";

import {
  LANGUAGE_OPTIONS,
  type LanguageLocale,
  type SourceLanguage,
} from "@/domain/languages";
import {
  RECORDING_WINDOW_OPTIONS,
  normalizeRecordingWindowMs,
  type RecordingWindowMs,
} from "@/live/contracts";

const RECORDING_WINDOW_LABELS: Record<RecordingWindowMs, MessageKey> = {
  6000: "translationSettings.windowFastest",
  10000: "translationSettings.windowBalanced",
  14000: "translationSettings.windowSmooth",
  dynamic: "translationSettings.windowAutomatic",
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
  const t = useT();
  return (
    <>
      <SettingGroup title={t("translationSettings.languagesTitle")} hint={t("translationSettings.languagesHint")}>
        <div className="fieldGrid">
            <label>
              {t("translationSettings.source")}
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
                <option value="auto">{t("translationSettings.autoDetect")}{defaultSourceLanguage === "auto" ? t("common.churchDefaultBadge") : ""}</option>
                {LANGUAGE_OPTIONS.map((language) => (
                  <option value={language.locale} key={language.locale}>
                    {language.label}{defaultSourceLanguage === language.locale ? t("common.churchDefaultBadge") : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("translationSettings.target")}
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
                    {language.label}{defaultTargetLanguage === language.locale ? t("common.churchDefaultBadge") : ""}
                  </option>
                ))}
              </select>
            </label>
        </div>
      </SettingGroup>
      <SettingGroup title={t("translationSettings.speedTitle")} hint={t("translationSettings.speedHint")}>
          <label>
            <span className="visuallyHidden">{t("translationSettings.speedTitle")}</span>
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
              {RECORDING_WINDOW_OPTIONS.map((value) => (
                <option value={value} key={value}>
                  {t(RECORDING_WINDOW_LABELS[value])}{defaultRecordingWindowMs === value ? t("common.churchDefaultBadge") : ""}
                </option>
              ))}
            </select>
          </label>
      </SettingGroup>
    </>
  );
}
