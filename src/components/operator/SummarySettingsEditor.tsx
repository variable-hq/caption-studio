"use client";

import { LANGUAGE_OPTIONS } from "@/domain/languages";
import type { SummaryOptions } from "@/experience/contracts";
import { MAX_SUMMARY_GUIDANCE_CHARS } from "@/experience/summary-defaults";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";
import { useT } from "@/i18n/provider";

interface SummarySettingsEditorProps {
  value: SummaryOptions;
  onChange: (value: SummaryOptions) => void;
  onSaveBrowserDefault: () => void;
  onReset: () => void;
  savedMessage: string;
  autoSummary: boolean;
  /** False when the account record is unavailable, since this setting is account-only. */
  autoSummaryAvailable: boolean;
  onAutoSummaryChange: (enabled: boolean) => void;
  autoSummaryMessage: string;
}

export function SummarySettingsEditor({
  value,
  onChange,
  onSaveBrowserDefault,
  onReset,
  savedMessage,
  autoSummary,
  autoSummaryAvailable,
  onAutoSummaryChange,
  autoSummaryMessage,
}: SummarySettingsEditorProps) {
  const t = useT();
  return (
    <>
      <SettingGroup
        title={t("summarySettings.autoTitle")}
        hint={t("summarySettings.autoHint")}
      >
        <label className="checkLabel">
          <input
            type="checkbox"
            name="autoSummary"
            checked={autoSummary}
            disabled={!autoSummaryAvailable}
            onChange={(event) => onAutoSummaryChange(event.target.checked)}
          />
          {t("summarySettings.autoLabel")}
        </label>
        <p className="settingHint" role="status" aria-live="polite">{autoSummaryMessage}</p>
      </SettingGroup>
      <SettingGroup title={t("summarySettings.styleTitle")} hint={t("summarySettings.styleHint")}>
        <div className="fieldGrid">
          <label>
            {t("summarySettings.language")}
            <select
              name="defaultSummaryLanguage"
              autoComplete="off"
              value={value.language}
              onChange={(event) => onChange({ ...value, language: event.target.value })}
            >
              {LANGUAGE_OPTIONS.map((entry) => (
                <option key={entry.locale} value={entry.locale}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label>
            {t("summarySettings.length")}
            <select
              name="defaultSummaryLength"
              autoComplete="off"
              value={value.length}
              onChange={(event) => onChange({ ...value, length: event.target.value === "detailed" ? "detailed" : "short" })}
            >
              <option value="short">{t("summarySettings.short")}</option>
              <option value="detailed">{t("summarySettings.detailed")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("summarySettings.focus")}
          <textarea
            name="defaultSummaryGuidance"
            autoComplete="off"
            rows={4}
            maxLength={MAX_SUMMARY_GUIDANCE_CHARS}
            value={value.guidance}
            spellCheck
            placeholder={t("summarySettings.focusPlaceholder")}
            onChange={(event) => onChange({ ...value, guidance: event.target.value })}
          />
        </label>
        <p className="settingHint">{t("summarySettings.focusHint")}</p>
        <div className="buttonRow">
          <button className="secondaryButton" type="button" onClick={onReset}>
            {t("common.restoreDefault")}
          </button>
        </div>
      </SettingGroup>
      <SaveBar onSave={onSaveBrowserDefault} status={savedMessage} />
    </>
  );
}
