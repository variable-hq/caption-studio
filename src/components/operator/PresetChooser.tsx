"use client";

import { useState } from "react";

import { INFERENCE_LEVEL_LABELS, SANITIZE_LEVEL_LABELS } from "@/components/operator/PromptEditor";
import { RECORDING_WINDOW_LABELS } from "@/components/operator/TranslationSettingsEditor";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";
import type { PresetApplyPlan, PresetRowField } from "@/experience/preset-apply";
import {
  BUILT_IN_PRESETS,
  normalizeProfileId,
  presetLocalizedText,
  resolveWorkspacePreset,
  type BuiltInPresetId,
} from "@/experience/presets";
import { translatePlural, type MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/provider";

const ROW_LABEL_KEYS: Record<PresetRowField, MessageKey> = {
  captionWait: "translationSettings.speedTitle",
  inference: "promptEditor.inferenceTitle",
  sanitize: "promptEditor.sanitizeTitle",
  outputBuffer: "outputBuffer.queueLabel",
  summaryLength: "summarySettings.length",
  summaryGuidance: "summarySettings.focus",
};

/** Chooses the workspace format and previews what applying it fills in; the choice reaches the screens once applied. */
export function PresetChooser({
  savedProfile,
  loaded,
  planFor,
  onApply,
}: Readonly<{
  savedProfile: string | null;
  /** False until the saved setup has loaded; the preview and Apply preset wait for it. */
  loaded: boolean;
  planFor: (profile: BuiltInPresetId) => PresetApplyPlan | null;
  onApply: (profile: BuiltInPresetId) => Promise<boolean>;
}>) {
  const { t, locale, workspacePreset } = useI18n();
  const saved = resolveWorkspacePreset(savedProfile).id as BuiltInPresetId;
  // Null until the operator picks; the select then follows the saved format.
  const [picked, setPicked] = useState<BuiltInPresetId | null>(null);
  const choice = picked ?? saved;
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = resolveWorkspacePreset(choice);
  const plan = loaded ? planFor(choice) : null;
  const formatName = (profile: BuiltInPresetId) => presetLocalizedText(resolveWorkspacePreset(profile).name, locale);

  const apply = () => {
    setSaving(true);
    setStatus(t("common.savingForEveryone"));
    void onApply(choice)
      .then((ok) => setStatus(ok ? t("settings.message.appliedPreset", { format: formatName(choice) }) : t("settings.error.sharedSetup")))
      .finally(() => setSaving(false));
  };

  const rowValue = (field: PresetRowField): string => {
    const defaults = selected.defaults ?? {};
    switch (field) {
      case "captionWait":
        return defaults.recordingWindowMs === undefined ? "" : t(RECORDING_WINDOW_LABELS[defaults.recordingWindowMs]);
      case "inference":
        return defaults.inferenceLevel === undefined ? "" : t(INFERENCE_LEVEL_LABELS[defaults.inferenceLevel]);
      case "sanitize":
        return defaults.sanitizeLevel === undefined ? "" : t(SANITIZE_LEVEL_LABELS[defaults.sanitizeLevel]);
      case "outputBuffer":
        return defaults.outputBufferCount === 0
          ? t("outputBuffer.offOption", { badge: "" })
          : translatePlural(locale, "outputBuffer.waitOption", (defaults.outputBufferDwellMs ?? 0) / 1000, { badge: "" }, workspacePreset);
      case "summaryLength":
        return t(defaults.summaryLength === "detailed" ? "summarySettings.detailed" : "summarySettings.short");
      case "summaryGuidance":
        return defaults.summaryGuidance ?? "";
    }
  };

  const rowStatus = (status: "kept" | "afterSession") =>
    status === "kept" ? t("settings.presets.kept") : t("settings.presets.afterSession");

  return (
    <>
      <SettingGroup title={t("settings.presets.choiceLabel")}>
        <label>
          <span className="visuallyHidden">{t("settings.presets.choiceLabel")}</span>
          <select
            name="profile"
            autoComplete="off"
            value={choice}
            onChange={(event) => setPicked(normalizeProfileId(event.target.value) ?? saved)}
          >
            {BUILT_IN_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{presetLocalizedText(preset.name, locale)}</option>
            ))}
          </select>
        </label>
        <p className="settingHint">{presetLocalizedText(selected.description, locale)}</p>
      </SettingGroup>
      {plan ? (
        <SettingGroup title={t("settings.presets.previewTitle")} hint={t("settings.presets.previewHint")}>
          {plan.rows.length === 0 && !selected.defaults?.starterTerms ? (
            <p className="settingHint">{t("settings.presets.noDefaults")}</p>
          ) : null}
          {plan.rows.map(({ field, status: rowState }) => (
            <div className="statRow" key={field}>
              <span>{t(ROW_LABEL_KEYS[field])}</span>
              <span>{rowState === "fill" ? rowValue(field) : rowStatus(rowState)}</span>
            </div>
          ))}
          {selected.defaults?.starterTerms ? (
            <>
              <div className="statRow">
                <span>{t("settings.presets.starterTerms")}</span>
                <span>{translatePlural(locale, "settings.presets.starterAdded", plan.starterTerms.added, {}, workspacePreset)}</span>
              </div>
              {plan.starterTerms.skipped > 0 ? (
                <p className="settingHint">{t("settings.presets.starterSkipped", { count: plan.starterTerms.skipped })}</p>
              ) : null}
            </>
          ) : null}
        </SettingGroup>
      ) : null}
      <SaveBar onSave={apply} disabled={!loaded || saving} status={status} label={t("settings.presets.apply")} />
    </>
  );
}
