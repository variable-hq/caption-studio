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
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";

const SANITIZE_LEVEL_LABELS: Record<SanitizeLevel, MessageKey> = {
  off: "sanitize.off",
  low: "sanitize.low",
  balanced: "sanitize.balanced",
  high: "sanitize.high",
};

const SANITIZE_LEVEL_DESCRIPTIONS: Record<SanitizeLevel, MessageKey> = {
  off: "sanitize.off.detail",
  low: "sanitize.low.detail",
  balanced: "sanitize.balanced.detail",
  high: "sanitize.high.detail",
};

const INFERENCE_LEVEL_DESCRIPTIONS: Record<InferenceLevel, MessageKey> = {
  low: "inference.low.detail",
  balanced: "inference.balanced.detail",
  high: "inference.high.detail",
};

function LevelDescription({ messageKey, id }: { messageKey: MessageKey; id?: string }) {
  const t = useI18n().t;
  return (
    <ul id={id} className="helpText levelDescription" aria-live="polite">
      <li>{t(messageKey)}</li>
    </ul>
  );
}

const INFERENCE_LEVEL_LABELS: Record<InferenceLevel, MessageKey> = {
  low: "inference.low",
  balanced: "inference.balanced",
  high: "inference.high",
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
  const { locale, t } = useI18n();
  const numberFormatter = new Intl.NumberFormat(locale);
  const addressTermsAvailable = targetLanguage === "en" && ["id", "auto"].includes(sourceLanguage);
  return (
    <>
      <SettingGroup title={t("promptEditor.inferenceTitle")}>
        <label>
          <span className="visuallyHidden">{t("promptEditor.inferenceTitle")}</span>
          <select
            name="inferenceLevel"
            autoComplete="off"
            data-testid="inference-level"
            aria-describedby="inference-level-description"
            value={inferenceLevel}
            disabled={disabled}
            onChange={(event) => onInferenceLevelChange(normalizeInferenceLevel(event.target.value))}
          >
            {INFERENCE_LEVEL_OPTIONS.map((level) => (
              <option value={level} key={level}>
                {t(INFERENCE_LEVEL_LABELS[level])}{defaultInferenceLevel === level ? t("common.churchDefaultBadge") : ""}
              </option>
            ))}
          </select>
        </label>
        <LevelDescription id="inference-level-description" messageKey={INFERENCE_LEVEL_DESCRIPTIONS[inferenceLevel]} />
      </SettingGroup>
      <SettingGroup title={t("promptEditor.sanitizeTitle")}>
        <label>
          <span className="visuallyHidden">{t("promptEditor.sanitizeTitle")}</span>
          <select
            name="sanitizeLevel"
            autoComplete="off"
            data-testid="sanitize-level"
            aria-describedby="sanitize-level-description"
            value={sanitizeLevel}
            disabled={disabled}
            onChange={(event) => onSanitizeLevelChange(normalizeSanitizeLevel(event.target.value))}
          >
            {SANITIZE_LEVEL_OPTIONS.map((level) => (
              <option value={level} key={level}>
                {t(SANITIZE_LEVEL_LABELS[level])}{defaultSanitizeLevel === level ? t("common.churchDefaultBadge") : ""}
              </option>
            ))}
          </select>
        </label>
        <LevelDescription id="sanitize-level-description" messageKey={SANITIZE_LEVEL_DESCRIPTIONS[sanitizeLevel]} />
      </SettingGroup>
      <SettingGroup title={t("promptEditor.filterTitle")}>
        <label className="checkLabel">
          <input
            type="checkbox"
            name="filterInappropriateLanguage"
            aria-describedby="filter-inappropriate-language-help"
            checked={filterInappropriateLanguage}
            disabled={disabled}
            onChange={(event) => onFilterInappropriateLanguageChange(event.target.checked)}
          />
          {t("promptEditor.filterTitle")}
        </label>
        <p id="filter-inappropriate-language-help" className="settingHint">{t("promptEditor.filterHint")}</p>
      </SettingGroup>
      <SettingGroup
        title={t("promptEditor.instructionsTitle")}
        hint={t("promptEditor.instructionsHint")}
      >
        <details className="advancedActions">
          <summary>{t("promptEditor.editInstructions")}</summary>
          <label>
            <span className="visuallyHidden">{t("promptEditor.instructionsTitle")}</span>
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
            {t("promptEditor.characters", {
              count: numberFormatter.format(value.length),
              max: numberFormatter.format(MAX_TRANSLATION_SYSTEM_PROMPT_CHARS),
            })}
          </p>
          <div className="buttonRow">
            <button
              className="secondaryButton"
              type="button"
              disabled={disabled || !addressTermsAvailable}
              onClick={() => onChange([value, ID_EN_ADDRESS_TERM_GUIDANCE].filter(Boolean).join("\n\n"))}
            >
              {t("promptEditor.addAddressForms")}
            </button>
            <button className="secondaryButton" type="button" disabled={disabled} onClick={onReset}>
              {t("common.restoreDefault")}
            </button>
          </div>
        </details>
      </SettingGroup>
      <SaveBar onSave={onSaveBrowserDefault} disabled={disabled} status={savedMessage} />
    </>
  );
}
