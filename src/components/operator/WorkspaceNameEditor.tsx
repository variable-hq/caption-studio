"use client";

import { useState } from "react";

import { WORKSPACE_NAME, isValidWorkspaceNameInput } from "@/domain/workspace";
import { useI18n } from "@/i18n/provider";

import { SaveBar, SettingGroup } from "./SettingsParts";

/** Edits the workspace name shown in the top bar and on operator screens; saved for everyone. */
export function WorkspaceNameEditor({
  savedName,
  loaded,
  onSave,
}: Readonly<{
  savedName: string | null;
  /** False until the saved setup has loaded; Save waits for it. */
  loaded: boolean;
  onSave: (name: string) => Promise<boolean>;
}>) {
  const { t } = useI18n();
  // Null until the operator types; the field then follows the saved name.
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const value = draft ?? savedName ?? "";
  const valid = isValidWorkspaceNameInput(value);

  const save = () => {
    setSaving(true);
    setStatus(t("common.savingForEveryone"));
    void onSave(value)
      .then((ok) => setStatus(ok ? t("settings.message.savedForEveryone") : t("settings.error.sharedSetup")))
      .finally(() => setSaving(false));
  };

  return (
    <SettingGroup title={t("settings.presets.workspaceTitle")} hint={t("settings.presets.workspaceNameHint", { name: WORKSPACE_NAME })}>
      <label>
        <span>{t("settings.presets.workspaceNameLabel")}</span>
        <input
          type="text"
          name="workspaceName"
          autoComplete="off"
          value={value}
          placeholder={WORKSPACE_NAME}
          aria-invalid={valid ? undefined : true}
          aria-describedby={valid ? undefined : "workspace-name-error"}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {valid ? null : <p id="workspace-name-error" className="settingHint" role="alert">{t("settings.presets.workspaceNameInvalid")}</p>}
      <SaveBar onSave={save} disabled={!loaded || saving || !valid} status={status} />
    </SettingGroup>
  );
}
