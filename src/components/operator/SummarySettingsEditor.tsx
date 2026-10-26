"use client";

import { LANGUAGE_OPTIONS } from "@/domain/languages";
import type { SummaryOptions } from "@/experience/contracts";
import { MAX_SUMMARY_GUIDANCE_CHARS } from "@/experience/summary-defaults";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";

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
  return (
    <>
      <SettingGroup
        title="Automatic summary"
        hint="Only for services with transcript saving on. The draft appears in Sermons; check it against the transcript before sharing."
      >
        <label className="checkLabel">
          <input
            type="checkbox"
            name="autoSummary"
            checked={autoSummary}
            disabled={!autoSummaryAvailable}
            onChange={(event) => onAutoSummaryChange(event.target.checked)}
          />
          Make a summary draft automatically after each service
        </label>
        <p className="settingHint" role="status" aria-live="polite">{autoSummaryMessage}</p>
      </SettingGroup>
      <SettingGroup title="Summary style" hint="Used by every summary, automatic or from Generate summary in Sermons.">
        <div className="fieldGrid">
          <label>
            Language
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
            Length
            <select
              name="defaultSummaryLength"
              autoComplete="off"
              value={value.length}
              onChange={(event) => onChange({ ...value, length: event.target.value === "detailed" ? "detailed" : "short" })}
            >
              <option value="short">Short</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
        </div>
        <label>
          What to focus on
          <textarea
            name="defaultSummaryGuidance"
            autoComplete="off"
            rows={4}
            maxLength={MAX_SUMMARY_GUIDANCE_CHARS}
            value={value.guidance}
            spellCheck
            placeholder="e.g. Main points and how to apply them…"
            onChange={(event) => onChange({ ...value, guidance: event.target.value })}
          />
        </label>
        <p className="settingHint">Tone, sections and length only. Don’t include private notes or personal details.</p>
        <div className="buttonRow">
          <button className="secondaryButton" type="button" onClick={onReset}>
            Restore the default
          </button>
        </div>
      </SettingGroup>
      <SaveBar onSave={onSaveBrowserDefault} status={savedMessage} />
    </>
  );
}
