"use client";

import {
  INFERENCE_LEVEL_OPTIONS,
  normalizeInferenceLevel,
  type InferenceLevel,
} from "@/ai/contracts";
import { ID_EN_ADDRESS_TERM_GUIDANCE, MAX_TRANSLATION_SYSTEM_PROMPT_CHARS } from "@/ai/translation-prompt";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";

const INFERENCE_LEVEL_LABELS: Record<InferenceLevel, string> = {
  low: "Close: nearly word for word",
  balanced: "Balanced: clear captions, same meaning",
  high: "Free: natural speech, bolder rewording",
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

/** Settings › AI translator: how closely to translate, and the setup person's instructions. */
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
  const addressTermsAvailable = targetLanguage === "en" && ["id", "auto"].includes(sourceLanguage);
  return (
    <>
      <SettingGroup title="How closely to follow the words">
        <label>
          <span className="visuallyHidden">How closely to follow the words</span>
          <select
            name="inferenceLevel"
            autoComplete="off"
            data-testid="inference-level"
            value={inferenceLevel}
            disabled={disabled}
            onChange={(event) => onInferenceLevelChange(normalizeInferenceLevel(event.target.value))}
          >
            {INFERENCE_LEVEL_OPTIONS.map((level) => (
              <option value={level} key={level}>
                {INFERENCE_LEVEL_LABELS[level]}{defaultInferenceLevel === level ? " · Church default" : ""}
              </option>
            ))}
          </select>
        </label>
      </SettingGroup>
      <SettingGroup
        title="Instructions for the translator"
        hint="For the person who looks after the setup; volunteers don’t need to change this. Fixed safety rules always apply on top. Don’t include private notes or personal details."
      >
        <details className="advancedActions">
          <summary>Edit the instructions</summary>
          <label>
            <span className="visuallyHidden">Instructions for the translator</span>
            <textarea
              name="translationGuidance"
              autoComplete="off"
              className="systemPromptInput"
              rows={12}
              value={value}
              maxLength={MAX_TRANSLATION_SYSTEM_PROMPT_CHARS}
              disabled={disabled}
              spellCheck
              onChange={(event) => onChange(event.target.value)}
            />
          </label>
          <p className="settingHint">
            {value.length.toLocaleString()} of {MAX_TRANSLATION_SYSTEM_PROMPT_CHARS.toLocaleString()} characters
          </p>
          <div className="buttonRow">
            <button
              className="secondaryButton"
              type="button"
              disabled={disabled || !addressTermsAvailable}
              onClick={() => onChange([value, ID_EN_ADDRESS_TERM_GUIDANCE].filter(Boolean).join("\n\n"))}
            >
              Add Indonesian forms of address
            </button>
            <button className="secondaryButton" type="button" disabled={disabled} onClick={onReset}>
              Restore the default
            </button>
          </div>
        </details>
      </SettingGroup>
      <SaveBar onSave={onSaveBrowserDefault} disabled={disabled} status={savedMessage} />
    </>
  );
}
