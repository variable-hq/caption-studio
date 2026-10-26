"use client";

import { useId } from "react";

import {
  INFERENCE_LEVEL_OPTIONS,
  normalizeInferenceLevel,
  type InferenceLevel,
} from "@/ai/contracts";
import { ID_EN_ADDRESS_TERM_GUIDANCE, MAX_TRANSLATION_SYSTEM_PROMPT_CHARS } from "@/ai/translation-prompt";

const INFERENCE_LEVEL_LABELS: Record<InferenceLevel, string> = {
  low: "Low",
  balanced: "Balanced",
  high: "High",
};

interface PromptEditorProps {
  value: string;
  sourceLanguage: string;
  targetLanguage: string;
  inferenceLevel: InferenceLevel;
  defaultInferenceLevel?: InferenceLevel | null;
  onChange: (value: string) => void;
  onInferenceLevelChange: (value: InferenceLevel) => void;
  onSaveBrowserDefault: () => void;
  onReset: () => void;
  savedMessage: string;
  disabled?: boolean;
}

export function PromptEditor({
  value,
  sourceLanguage,
  targetLanguage,
  inferenceLevel,
  defaultInferenceLevel = null,
  onChange,
  onInferenceLevelChange,
  onSaveBrowserDefault,
  onReset,
  savedMessage,
  disabled = false,
}: PromptEditorProps) {
  const helpId = useId();
  const statusId = useId();
  const inferenceHelpId = useId();

  return (
    <div className="promptEditor">
      <div className="promptHeading">
        <div>
          <strong>Instructions for the translator</strong>
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
          name="translationGuidance"
          autoComplete="off"
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
      <label className="fullField">
        Inference level
        <select
          name="inferenceLevel"
          autoComplete="off"
          data-testid="inference-level"
          value={inferenceLevel}
          aria-describedby={inferenceHelpId}
          disabled={disabled}
          onChange={(event) =>
            onInferenceLevelChange(normalizeInferenceLevel(event.target.value))
          }
        >
          {INFERENCE_LEVEL_OPTIONS.map((level) => (
            <option value={level} key={level}>
              {INFERENCE_LEVEL_LABELS[level]}{defaultInferenceLevel === level ? " · Church default" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="helpText" id={inferenceHelpId}>
        Low stays close to word-for-word with minimal corrections. Balanced
        (default) keeps captions coherent without changing meaning. High favors natural
        coherence over literal accuracy, allowing bolder rewording.
      </p>
      <div className="promptActions">
        <button
          className="secondaryButton"
          type="button"
          disabled={disabled}
          onClick={onSaveBrowserDefault}
        >
          Save for everyone
        </button>
      </div>
      <details className="advancedActions">
        <summary>More options</summary>
        <div className="promptActions">
          <button
            className="secondaryButton"
            type="button"
            disabled={disabled || targetLanguage !== "en" || !["id", "auto"].includes(sourceLanguage)}
            onClick={() => onChange([value, ID_EN_ADDRESS_TERM_GUIDANCE].filter(Boolean).join("\n\n"))}
          >
            Add Indonesian address-term guidance
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
      </details>
      <p className="browserStorageNote">
        Saving stores the prompt with your signed-in operator account and keeps an
        unencrypted local copy in this browser. During a live
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
