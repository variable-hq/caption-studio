"use client";

import {
  INFERENCE_LEVEL_OPTIONS,
  SANITIZE_LEVEL_OPTIONS,
  normalizeInferenceLevel,
  normalizeSanitizeLevel,
  type InferenceLevel,
  type SanitizeLevel,
} from "@/ai/contracts";
import { ID_EN_ADDRESS_TERM_GUIDANCE, MAX_TRANSLATION_SYSTEM_PROMPT_CHARS } from "@/ai/translation-prompt";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";

const SANITIZE_LEVEL_LABELS: Record<SanitizeLevel, string> = {
  off: "Off",
  low: "Low",
  balanced: "Balanced · recommended",
  high: "High · may drop soft speech",
};

const SANITIZE_LEVEL_DESCRIPTIONS: Record<SanitizeLevel, string[]> = {
  off: ["No cleanup. Captions keep everything transcribed."],
  low: ["Removes filler sounds and clear non-speech noise."],
  balanced: ["Also removes filler words and keeps only the final version of a self-correction."],
  high: ["Also removes empty openers and tags. May drop very soft speech."],
};

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
  sanitizeLevel: SanitizeLevel;
  defaultSanitizeLevel?: SanitizeLevel | null;
  filterInappropriateLanguage: boolean;
  onChange: (value: string) => void;
  onInferenceLevelChange: (value: InferenceLevel) => void;
  onSanitizeLevelChange: (value: SanitizeLevel) => void;
  onFilterInappropriateLanguageChange: (value: boolean) => void;
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
  sanitizeLevel,
  defaultSanitizeLevel = null,
  filterInappropriateLanguage,
  onChange,
  onInferenceLevelChange,
  onSanitizeLevelChange,
  onFilterInappropriateLanguageChange,
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
      <SettingGroup title="Sanitization">
        <label>
          <span className="visuallyHidden">Sanitization</span>
          <select
            name="sanitizeLevel"
            autoComplete="off"
            data-testid="sanitize-level"
            value={sanitizeLevel}
            disabled={disabled}
            onChange={(event) => onSanitizeLevelChange(normalizeSanitizeLevel(event.target.value))}
          >
            {SANITIZE_LEVEL_OPTIONS.map((level) => (
              <option value={level} key={level}>
                {SANITIZE_LEVEL_LABELS[level]}{defaultSanitizeLevel === level ? " · Church default" : ""}
              </option>
            ))}
          </select>
        </label>
        <ul className="helpText levelDescription" aria-live="polite">
          {SANITIZE_LEVEL_DESCRIPTIONS[sanitizeLevel].map((line) => <li key={line}>{line}</li>)}
        </ul>
      </SettingGroup>
      <SettingGroup title="Filter inappropriate language">
        <label className="checkLabel">
          <input
            type="checkbox"
            name="filterInappropriateLanguage"
            checked={filterInappropriateLanguage}
            disabled={disabled}
            onChange={(event) => onFilterInappropriateLanguageChange(event.target.checked)}
          />
          Filter inappropriate language
        </label>
        <p className="settingHint">On: omits profanity, slurs, and vulgar language from captions. Off: translates them as spoken.</p>
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
