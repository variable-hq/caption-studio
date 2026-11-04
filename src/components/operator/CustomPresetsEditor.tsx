"use client";

import { useState } from "react";

import { CustomPresetForm, customPresetMessage } from "@/components/operator/CustomPresetForm";
import { SettingGroup } from "@/components/operator/SettingsParts";
import type { CustomPresetCommandResult } from "@/experience/custom-presets-client";
import type { CustomPresetsView, PresetCommand, StoredCustomPreset } from "@/experience/custom-presets";
import { presetLocalizedText } from "@/experience/presets";
import { useI18n } from "@/i18n/provider";

type Mode = { kind: "new" } | { kind: "edit"; id: string } | null;

/**
 * Lists the workspace's custom presets with their plan allowance, and creates, edits and deletes
 * them. A lowered allowance blocks only new presets; an existing one stays editable and deletable.
 */
export function CustomPresetsEditor({
  view,
  onCommand,
}: Readonly<{
  /** Null until the presets have loaded or when they cannot be read. */
  view: CustomPresetsView | null;
  onCommand: (command: PresetCommand) => Promise<CustomPresetCommandResult>;
}>) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<Mode>(null);
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  if (view === null) {
    return (
      <SettingGroup title={t("settings.presets.customTitle")} hint={t("settings.presets.customHint")}>
        <p className="settingHint" role="status">{t("settings.error.sharedSetup")}</p>
      </SettingGroup>
    );
  }

  const { maxCustomPresets, used } = view.limits;
  const full = used >= maxCustomPresets;
  const editing = mode?.kind === "edit" ? view.presets.find((entry) => entry.preset.id === mode.id) ?? null : null;

  const remove = (entry: StoredCustomPreset) => {
    if (confirming !== entry.preset.id) {
      setConfirming(entry.preset.id);
      return;
    }
    setDeleteError("");
    onCommand({ action: "delete", id: entry.preset.id })
      .then(() => {
        setConfirming(null);
        setMode(null);
        setStatus(t("settings.presets.customDeleted"));
      })
      .catch((failure: unknown) => setDeleteError(customPresetMessage(failure, t)));
  };

  const done = (message: string) => {
    setMode(null);
    setStatus(message);
  };

  return (
    <SettingGroup title={t("settings.presets.customTitle")} hint={t("settings.presets.customHint")}>
      <div className="statRow">
        <span>{t("settings.presets.customTitle")}</span>
        <span>{t("settings.presets.customUsed", { used, max: maxCustomPresets })}</span>
      </div>
      {maxCustomPresets === 0 ? <p className="settingHint">{t("settings.presets.customLocked")}</p> : null}
      {maxCustomPresets > 0 && full ? <p className="settingHint">{t("settings.presets.customFull", { max: maxCustomPresets })}</p> : null}
      {view.presets.length === 0 && maxCustomPresets > 0 ? <p className="settingHint">{t("settings.presets.customEmpty")}</p> : null}
      {view.presets.map((entry) => (
        <div key={entry.preset.id}>
          <div className="statRow">
            <span>
              {presetLocalizedText(entry.preset.name, locale)}
              {entry.modelTextAllowed ? null : <span className="formatTag">{t("settings.presets.customAllowModelText")}</span>}
            </span>
            <button
              type="button"
              className="secondaryButton"
              aria-label={`${t("settings.presets.customEdit")}: ${presetLocalizedText(entry.preset.name, locale)}`}
              disabled={mode?.kind === "edit" && mode.id === entry.preset.id}
              onClick={() => {
                setStatus("");
                setDeleteError("");
                setConfirming(null);
                setMode({ kind: "edit", id: entry.preset.id });
              }}
            >
              {t("settings.presets.customEdit")}
            </button>
          </div>
          <p className="settingHint">{presetLocalizedText(entry.preset.description, locale)}</p>
        </div>
      ))}
      {mode?.kind === "edit" && editing ? (
        <>
          <CustomPresetForm key={editing.preset.id} entry={editing} onCommand={onCommand} onDone={done} />
          <div className="buttonRow">
            <button type="button" className="secondaryButton" onClick={() => remove(editing)}>
              {confirming === editing.preset.id ? t("settings.presets.customDeleteConfirm") : t("settings.presets.customDelete")}
            </button>
          </div>
          <p className="settingHint">{t("settings.presets.customDeleteHint")}</p>
          {deleteError ? <p className="errorText" role="alert">{deleteError}</p> : null}
        </>
      ) : null}
      {mode?.kind === "new" ? (
        <CustomPresetForm key="new" entry={null} onCommand={onCommand} onDone={done} />
      ) : null}
      {mode === null ? (
        <div className="buttonRow">
          <button
            type="button"
            className="secondaryButton"
            disabled={full}
            onClick={() => {
              setStatus("");
              setMode({ kind: "new" });
            }}
          >
            {t("settings.presets.customNew")}
          </button>
        </div>
      ) : null}
      <p className="settingHint" role="status" aria-live="polite">{status}</p>
    </SettingGroup>
  );
}
