"use client";

import type { PresetDifference, PresetRowField } from "@/experience/preset-apply";
import { useI18n } from "@/i18n/provider";

import { ROW_LABEL_KEYS, presetValueText } from "./PresetChooser";
import { SettingGroup } from "./SettingsParts";

/** Lists saved settings that differ from the active format; each row can fill the format's value as a draft. */
export function PresetDifferences({
  rows,
  onUse,
}: Readonly<{
  rows: PresetDifference[];
  onUse: (field: PresetRowField) => void;
}>) {
  const { t, locale, workspacePreset } = useI18n();
  if (rows.length === 0) return null;
  return (
    <SettingGroup title={t("settings.presets.differencesTitle")} hint={t("settings.presets.differencesHint")}>
      {rows.map((row) => {
        const label = t(ROW_LABEL_KEYS[row.field]);
        const savedText = presetValueText(row.field, row.saved, t, locale, workspacePreset);
        const formatText = presetValueText(row.field, row.preset, t, locale, workspacePreset);
        return (
          <div key={row.field}>
            <div className="statRow">
              <span>{label}</span>
              <span>{t("settings.presets.savedValue", { value: savedText })}</span>
            </div>
            {row.status === "afterSession" ? (
              <p className="settingHint">{t("settings.presets.afterSession")}</p>
            ) : (
              <div className="buttonRow">
                <p className="settingHint">{t("settings.presets.formatValue", { value: formatText })}</p>
                <button
                  type="button"
                  className="secondaryButton"
                  aria-label={t("settings.presets.usePresetDefaultFor", { setting: label })}
                  onClick={() => onUse(row.field)}
                >
                  {t("settings.presets.usePresetDefault")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </SettingGroup>
  );
}
