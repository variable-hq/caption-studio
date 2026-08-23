"use client";

import { useId } from "react";

import { MAX_TRANSLATION_SYSTEM_PROMPT_CHARS } from "@/ai/translation-prompt";

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSaveBrowserDefault: () => void;
  onReset: () => void;
  savedMessage: string;
  disabled?: boolean;
}

export function PromptEditor({
  value,
  onChange,
  onSaveBrowserDefault,
  onReset,
  savedMessage,
  disabled = false,
}: PromptEditorProps) {
  const helpId = useId();
  const statusId = useId();

  return (
    <div className="promptEditor">
      <div className="promptHeading">
        <div>
          <strong>Translation system prompt</strong>
          <p id={helpId}>
            These operator instructions are sent to Groq with every translated
            caption. The application-owned envelope remains fixed in the request,
            and the model is told to prioritize it; output still needs human review.
          </p>
        </div>
        <span className="characterCount" aria-label={`${value.length} characters`}>
          {value.length.toLocaleString()} / {MAX_TRANSLATION_SYSTEM_PROMPT_CHARS.toLocaleString()}
        </span>
      </div>
      <label>
        Custom translation instructions
        <textarea
          className="systemPromptInput"
          rows={14}
          value={value}
          maxLength={MAX_TRANSLATION_SYSTEM_PROMPT_CHARS}
          disabled={disabled}
          aria-describedby={`${helpId} ${statusId}`}
          spellCheck
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="promptActions">
        <button
          className="secondaryButton"
          type="button"
          disabled={disabled}
          onClick={onSaveBrowserDefault}
        >
          Save as browser default
        </button>
        <button
          className="textButton"
          type="button"
          disabled={disabled}
          onClick={onReset}
        >
          Reset to safe default
        </button>
      </div>
      <p className="browserStorageNote">
        A saved browser default uses unencrypted local storage. During a live
        service, the applied prompt also stays in this tab&apos;s unencrypted session
        storage for recovery until End, expiry, or takeover. Do not put private
        sermon notes, credentials, or personal data here.
      </p>
      <p id={statusId} className="promptSaveStatus" role="status" aria-live="polite">
        {savedMessage}
      </p>
    </div>
  );
}
