"use client";

import { useId } from "react";

import { LANGUAGE_OPTIONS } from "@/domain/languages";
import type { SummaryOptions } from "@/experience/contracts";
import { MAX_SUMMARY_GUIDANCE_CHARS } from "@/experience/summary-defaults";

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
  const helpId = useId();
  const statusId = useId();

  return (
    <div className="promptEditor summarySettingsEditor">
      <div className="promptHeading">
        <div>
          <strong>Summary defaults</strong>
          <p id={helpId}>
            Every summary uses these settings, whether you press Generate summary in
            Sermons or it is made automatically below. Summaries need the optional
            Workers AI setting turned on for this deployment.
          </p>
        </div>
        <span className="characterCount" aria-label={`${value.guidance.length} guidance characters`}>
          {value.guidance.length.toLocaleString()} / {MAX_SUMMARY_GUIDANCE_CHARS.toLocaleString()}
        </span>
      </div>
      <div className="fieldGrid">
        <label>
          Default summary language
          <select
            name="defaultSummaryLanguage"
            value={value.language}
            onChange={(event) => onChange({ ...value, language: event.target.value })}
          >
            {LANGUAGE_OPTIONS.map((entry) => (
              <option key={entry.locale} value={entry.locale}>{entry.label}</option>
            ))}
          </select>
        </label>
        <label>
          Default summary length
          <select
            name="defaultSummaryLength"
            value={value.length}
            onChange={(event) => onChange({ ...value, length: event.target.value === "detailed" ? "detailed" : "short" })}
          >
            <option value="short">Short</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>
      <label>
        Default summary guidance
        <textarea
          name="defaultSummaryGuidance"
          autoComplete="off"
          rows={6}
          maxLength={MAX_SUMMARY_GUIDANCE_CHARS}
          value={value.guidance}
          spellCheck
          placeholder="e.g. Main points and how to apply them…"
          onChange={(event) => onChange({ ...value, guidance: event.target.value })}
        />
      </label>
      <div className="promptActions">
        <button className="secondaryButton" type="button" onClick={onSaveBrowserDefault}>
          Save for everyone
        </button>
      </div>
      <details className="advancedActions">
        <summary>More options</summary>
        <button className="textButton" type="button" onClick={onReset}>
          Reset to defaults
        </button>
      </details>
      <p className="browserStorageNote">
        Saving stores these defaults with your signed-in operator account and keeps an
        unencrypted local copy in this browser. Guidance may set
        tone, sections and length only. Do not put private sermon notes,
        credentials, or personal data here.
      </p>
      <p id={statusId} className="promptSaveStatus" role="status" aria-live="polite">
        {savedMessage}
      </p>
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
      <p className="helpText">
        Uses the defaults above as saved for everyone, and only for services with
        transcript saving on. The draft appears in Sermon history; review it against the
        transcript before sharing. It uses the same daily AI budget as Generate summary.
      </p>
      <p className="promptSaveStatus" role="status" aria-live="polite">
        {autoSummaryMessage}
      </p>
    </div>
  );
}
