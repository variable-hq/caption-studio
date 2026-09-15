"use client";

import { useId } from "react";

import { LANGUAGE_OPTIONS } from "@/domain/languages";
import { SUMMARY_MODELS, type SummaryModel, type SummaryOptions } from "@/experience/contracts";
import { MAX_SUMMARY_GUIDANCE_CHARS } from "@/experience/summary-defaults";

interface SummarySettingsEditorProps {
  value: SummaryOptions;
  onChange: (value: SummaryOptions) => void;
  onSaveBrowserDefault: () => void;
  onReset: () => void;
  savedMessage: string;
}

export const SUMMARY_MODEL_LABELS: Record<SummaryModel, string> = {
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "Llama 3.3 70B · Cloudflare",
  "@cf/meta/llama-3.1-8b-instruct-fp8": "Llama 3.1 8B · Cloudflare",
};

export function SummarySettingsEditor({
  value,
  onChange,
  onSaveBrowserDefault,
  onReset,
  savedMessage,
}: SummarySettingsEditorProps) {
  const helpId = useId();
  const statusId = useId();

  return (
    <div className="promptEditor summarySettingsEditor">
      <div className="promptHeading">
        <div>
          <strong>Default summary configuration</strong>
          <p id={helpId}>
            These defaults prefill the Summary assistant in Sermon history. Each
            summary request still shows and sends its own values, and generation
            only happens when optional Workers AI is enabled and you choose
            Generate summary. Server-owned grounding rules stay fixed.
          </p>
        </div>
        <span className="characterCount" aria-label={`${value.guidance.length} guidance characters`}>
          {value.guidance.length.toLocaleString()} / {MAX_SUMMARY_GUIDANCE_CHARS.toLocaleString()}
        </span>
      </div>
      <div className="fieldGrid">
        <label>
          Default summary model
          <select
            name="defaultSummaryModel"
            value={value.model}
            aria-describedby={helpId}
            onChange={(event) => onChange({ ...value, model: event.target.value as SummaryModel })}
          >
            {SUMMARY_MODELS.map((entry) => (
              <option key={entry} value={entry}>{SUMMARY_MODEL_LABELS[entry]}</option>
            ))}
          </select>
        </label>
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
          placeholder="Emphasize main points and speaker-stated applications…"
          onChange={(event) => onChange({ ...value, guidance: event.target.value })}
        />
      </label>
      <div className="promptActions">
        <button className="secondaryButton" type="button" onClick={onSaveBrowserDefault}>
          Save to my account
        </button>
        <button className="textButton" type="button" onClick={onReset}>
          Reset to defaults
        </button>
      </div>
      <p className="browserStorageNote">
        Saving stores these defaults with your signed-in operator account and keeps an
        unencrypted local copy in this browser. Guidance may set
        tone, sections and length only. Do not put private sermon notes,
        credentials, or personal data here.
      </p>
      <p id={statusId} className="promptSaveStatus" role="status" aria-live="polite">
        {savedMessage}
      </p>
    </div>
  );
}
