"use client";

import { useState } from "react";

import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";
import {
  BUILT_IN_PRESETS,
  normalizeProfileId,
  presetLocalizedText,
  resolveWorkspacePreset,
  type BuiltInPresetId,
} from "@/experience/presets";
import { useI18n } from "@/i18n/provider";

/** Chooses the workspace format; the choice reaches the screens only once it is saved for everyone. */
export function PresetChooser({
  savedProfile,
  onSave,
}: Readonly<{
  savedProfile: string | null;
  onSave: (profile: BuiltInPresetId) => Promise<boolean>;
}>) {
  const { t, locale } = useI18n();
  const saved = resolveWorkspacePreset(savedProfile).id as BuiltInPresetId;
  // Null until the operator picks; the select then follows the saved format.
  const [picked, setPicked] = useState<BuiltInPresetId | null>(null);
  const choice = picked ?? saved;
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const selected = resolveWorkspacePreset(choice);
  const formatName = (profile: BuiltInPresetId) => presetLocalizedText(resolveWorkspacePreset(profile).name, locale);

  const save = () => {
    setSaving(true);
    setStatus(t("common.savingForEveryone"));
    void onSave(choice)
      .then((ok) => setStatus(ok ? t("settings.message.savedProfile", { format: formatName(choice) }) : t("settings.error.sharedSetup")))
      .finally(() => setSaving(false));
  };

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
      <SaveBar onSave={save} disabled={saving} status={status} />
    </>
  );
}
