"use client";

import { useRef, useState } from "react";

import type { CustomPresetCommandResult } from "@/experience/custom-presets-client";
import type { OperatorPreferences } from "@/experience/preferences";
import type { Preset } from "@/experience/presets";
import {
  MAX_SETUP_FILE_BYTES,
  SETUP_ROW_LABEL_KEYS,
  buildSetupFile,
  parseSetupFile,
  planSetupImport,
  remapImportedProfile,
  type SetupFileFailure,
} from "@/experience/setup-file";
import { useI18n } from "@/i18n/provider";

import { SettingGroup } from "./SettingsParts";

const SETUP_FILE_NAME = "caption-studio-setup.json";

type Parsed = { setup: Partial<OperatorPreferences>; presets: Preset[] };

/** Whether a custom preset carries summary focus or starter Terms, which stay off until allowed. */
function holdsModelText(preset: Preset) {
  return preset.defaults?.summaryGuidance !== undefined || preset.defaults?.starterTerms !== undefined;
}

/**
 * Exports the saved setup and the workspace's custom presets as a file, and imports one. The
 * preview is computed from the setup, Terms and plan as they are now, and the import is planned
 * again at confirm, so nothing saved in between is overwritten.
 */
export function SetupShare({
  setup,
  terms,
  presets,
  presetRoom,
  onImportPresets,
  onImport,
}: Readonly<{
  /** The setup in effect for this operator; null until it has loaded. */
  setup: OperatorPreferences | null;
  terms: { keywordText: string; filterText: string };
  /** The workspace's custom presets, exported with the setup. */
  presets: readonly Preset[];
  /** How many more custom presets the plan allows; a file's presets beyond it are not added. */
  presetRoom: number;
  onImportPresets: (presets: Preset[]) => Promise<CustomPresetCommandResult | null>;
  onImport: (patch: Partial<OperatorPreferences>) => Promise<boolean>;
}>) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [allowModelText, setAllowModelText] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The presets the plan has room for, and the custom format they would select, drive the preview.
  const room = Math.max(0, presetRoom);
  const previewAdded = parsed ? parsed.presets.slice(0, room).map((preset) => ({ fromId: preset.id, id: preset.id })) : [];
  const previewSetup = parsed ? { ...parsed.setup, profile: remapImportedProfile(parsed.setup.profile, previewAdded) } : null;
  const plan = previewSetup && setup ? planSetupImport(previewSetup, setup, terms, { allowModelText }) : null;
  const presetsAdded = parsed ? Math.min(parsed.presets.length, room) : 0;
  const presetsDropped = parsed ? parsed.presets.length - presetsAdded : 0;
  const presetsHeld = parsed ? parsed.presets.slice(0, presetsAdded).filter(holdsModelText).length : 0;
  const hasPresetFill = presetsAdded > 0;
  const hasFills = plan !== null && plan.rows.some((row) => row.status === "fill");
  // Shown while the file has model-facing text that is not already saved, so an allowance can be withdrawn.
  const hasModelText = plan !== null && plan.rows.some((row) =>
    (row.field === "translationSystemPrompt" || row.field === "summaryGuidance") && row.status !== "kept");

  const failureMessage = (failure: SetupFileFailure) => {
    switch (failure.reason) {
      case "too-large":
        return t("settings.setup.errorTooLarge", { kilobytes: MAX_SETUP_FILE_BYTES / 1024 });
      case "not-json":
        return t("settings.setup.errorNotJson");
      case "not-setup-file":
        return t("settings.setup.errorNotSetup");
      case "unsupported-version":
        return t("settings.setup.errorVersion");
      case "unknown-field":
        return t("settings.setup.errorUnknownField", { field: failure.field });
      case "invalid-preset":
        return t("settings.setup.errorInvalidPreset");
    }
  };

  const review = (source: string) => {
    setStatus("");
    setParsed(null);
    setAllowModelText(false);
    const result = parseSetupFile(source);
    if (!result.ok) {
      setError(failureMessage(result.failure));
      return;
    }
    setError("");
    setParsed({ setup: result.setup, presets: result.presets });
  };

  const exportSetup = () => {
    if (!setup) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(buildSetupFile(setup, presets), null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = SETUP_FILE_NAME;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const chooseFile = async (file: File) => {
    if (file.size > MAX_SETUP_FILE_BYTES) {
      setParsed(null);
      setError(failureMessage({ reason: "too-large" }));
      return;
    }
    try {
      const contents = await file.text();
      setText(contents);
      review(contents);
    } catch {
      setParsed(null);
      setError(t("settings.setup.errorUnreadable"));
    }
  };

  const confirm = async () => {
    if (!parsed || !setup) return;
    setBusy(true);
    setStatus(t("common.savingForEveryone"));
    // Custom presets first, so the setup can select one of them under its new id.
    let added: { fromId: string; id: string }[] = [];
    if (parsed.presets.length > 0 && hasPresetFill) {
      const result = await onImportPresets(parsed.presets);
      if (!result) {
        setStatus(t("settings.error.sharedSetup"));
        setBusy(false);
        return;
      }
      added = result.added ?? [];
    }
    // Planned again from the setup and Terms at this moment, so the save matches what is shown.
    const current = planSetupImport(
      { ...parsed.setup, profile: remapImportedProfile(parsed.setup.profile, added) },
      setup,
      terms,
      { allowModelText },
    );
    const settingsFilled = current.rows.some((row) => row.status === "fill");
    const ok = settingsFilled ? await onImport(current.patch) : true;
    const messages = [
      added.length > 0 ? t("settings.setup.presetsImported", { count: added.length }) : "",
      ok && settingsFilled ? t("settings.setup.imported") : "",
    ].filter(Boolean);
    setStatus(ok ? messages.join(" ") : t("settings.error.sharedSetup"));
    if (ok) {
      setParsed(null);
      setAllowModelText(false);
      setText("");
    }
    setBusy(false);
  };

  return (
    <SettingGroup title={t("settings.setup.title")} hint={t("settings.setup.hint")}>
      <div className="buttonRow">
        <button type="button" className="secondaryButton" disabled={!setup} onClick={exportSetup}>
          {t("settings.setup.export")}
        </button>
      </div>
      <label>
        {t("settings.setup.pasteLabel")}
        <textarea
          name="setupImport"
          autoComplete="off"
          spellCheck={false}
          rows={4}
          value={text}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            setError("");
            setParsed(null);
            setStatus("");
          }}
        />
      </label>
      <div className="buttonRow">
        <button type="button" className="secondaryButton" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          {t("settings.setup.chooseFile")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="visuallyHidden"
          aria-label={t("settings.setup.chooseFile")}
          tabIndex={-1}
          accept=".json,application/json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void chooseFile(file);
          }}
        />
        <button type="button" className="secondaryButton" disabled={busy || !text.trim()} onClick={() => review(text)}>
          {t("settings.setup.preview")}
        </button>
      </div>
      {error ? <p className="errorText" role="alert">{error}</p> : null}
      {plan ? (
        <>
          <p className="settingHint">{t("settings.setup.previewTitle")}</p>
          {plan.rows.length === 0 && parsed?.presets.length === 0 ? <p className="settingHint">{t("settings.setup.empty")}</p> : null}
          {plan.rows.map((row) => (
            <div key={row.field}>
              <div className="statRow">
                <span>{t(SETUP_ROW_LABEL_KEYS[row.field])}</span>
                <span>
                  {row.status === "fill"
                    ? t("settings.setup.willFill")
                    : row.status === "held"
                      ? t("settings.setup.heldForApproval")
                      : t("settings.presets.kept")}
                </span>
              </div>
              {row.status === "held" && row.text ? <p className="settingHint">{row.text}</p> : null}
            </div>
          ))}
          {presetsAdded > 0 ? <p className="settingHint">{t("settings.setup.presetsAdded", { count: presetsAdded })}</p> : null}
          {presetsDropped > 0 ? <p className="settingHint">{t("settings.setup.presetsDropped", { count: presetsDropped })}</p> : null}
          {presetsHeld > 0 ? <p className="settingHint">{t("settings.setup.presetsHeld", { count: presetsHeld })}</p> : null}
          {hasModelText ? (
            <label className="checkLabel">
              <input
                type="checkbox"
                name="allowModelText"
                checked={allowModelText}
                disabled={busy}
                onChange={(event) => setAllowModelText(event.target.checked)}
              />
              {t("settings.setup.allowModelText")}
            </label>
          ) : null}
          {plan.rows.length > 0 && !hasFills && !hasPresetFill ? <p className="settingHint">{t("settings.setup.nothingToFill")}</p> : null}
          <div className="buttonRow">
            <button type="button" className="primaryButton" disabled={busy || (!hasFills && !hasPresetFill)} onClick={() => void confirm()}>
              {t("settings.setup.importAction")}
            </button>
          </div>
        </>
      ) : null}
      <p className="settingHint" role="status" aria-live="polite">{status}</p>
    </SettingGroup>
  );
}
