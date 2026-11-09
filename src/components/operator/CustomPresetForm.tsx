"use client";

import { useState } from "react";

import { INFERENCE_LEVEL_OPTIONS, SANITIZE_LEVEL_OPTIONS } from "@/ai/contracts";
import { INFERENCE_LEVEL_LABELS, SANITIZE_LEVEL_LABELS } from "@/components/operator/PromptEditor";
import { RECORDING_WINDOW_LABELS } from "@/components/operator/TranslationSettingsEditor";
import { SaveBar, SettingGroup } from "@/components/operator/SettingsParts";
import { CustomPresetError, type CustomPresetCommandResult } from "@/experience/custom-presets-client";
import type { StoredCustomPreset, PresetCommand } from "@/experience/custom-presets";
import { BUILT_IN_PRESETS, MAX_PRESET_NAME_CHARS, MAX_PRESET_TERM_CHARS, presetLocalizedText, type Preset } from "@/experience/presets";
import { RECORDING_WINDOW_OPTIONS } from "@/live/contracts";
import { MAX_SUMMARY_GUIDANCE_CHARS } from "@/experience/summary-defaults";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";

type Term = { singular: string; plural: string };
type Draft = {
  name: string;
  description: string;
  session: Term;
  speaker: Term;
  audience: Term;
  transcripts: string;
  recordingWindowMs: string;
  inferenceLevel: string;
  sanitizeLevel: string;
  summaryLength: string;
  summaryGuidance: string;
};

const NOT_SET = "";

function draftFrom(preset: Preset, name: string): Draft {
  const en = preset.terms.en;
  const defaults = preset.defaults ?? {};
  return {
    name,
    description: preset.description.en,
    session: { singular: en.session.singular, plural: en.session.plural ?? "" },
    speaker: { singular: en.speaker.singular, plural: en.speaker.plural ?? "" },
    audience: { singular: en.audience.singular, plural: en.audience.plural ?? "" },
    transcripts: en.transcripts.singular,
    recordingWindowMs: defaults.recordingWindowMs === undefined ? NOT_SET : String(defaults.recordingWindowMs),
    inferenceLevel: defaults.inferenceLevel ?? NOT_SET,
    sanitizeLevel: defaults.sanitizeLevel ?? NOT_SET,
    summaryLength: defaults.summaryLength ?? NOT_SET,
    summaryGuidance: defaults.summaryGuidance ?? "",
  };
}

/** The request body for a preset: the fields the form owns, plus what it does not edit from `base`. */
function presetPayload(draft: Draft, base: Preset): Record<string, unknown> {
  const defaults: Record<string, unknown> = { ...base.defaults };
  delete defaults.recordingWindowMs;
  delete defaults.inferenceLevel;
  delete defaults.sanitizeLevel;
  delete defaults.summaryLength;
  delete defaults.summaryGuidance;
  if (draft.recordingWindowMs !== NOT_SET) {
    defaults.recordingWindowMs = RECORDING_WINDOW_OPTIONS.find((option) => String(option) === draft.recordingWindowMs);
  }
  if (draft.inferenceLevel !== NOT_SET) defaults.inferenceLevel = draft.inferenceLevel;
  if (draft.sanitizeLevel !== NOT_SET) defaults.sanitizeLevel = draft.sanitizeLevel;
  if (draft.summaryLength !== NOT_SET) defaults.summaryLength = draft.summaryLength;
  if (draft.summaryGuidance.trim() !== "") defaults.summaryGuidance = draft.summaryGuidance.trim();
  const terms: Record<string, unknown> = {
    session: { singular: draft.session.singular.trim(), plural: draft.session.plural.trim() },
    speaker: { singular: draft.speaker.singular.trim(), plural: draft.speaker.plural.trim() },
    audience: { singular: draft.audience.singular.trim(), plural: draft.audience.plural.trim() },
    transcripts: { singular: draft.transcripts.trim() },
  };
  // The Indonesian terms of a copied or edited preset are kept; General fills any the preset lacks.
  if (base.terms.id !== undefined) terms.id = base.terms.id;
  return {
    schemaVersion: 1,
    name: { en: draft.name.trim() },
    description: { en: draft.description.trim() },
    terms: { en: terms },
    defaults,
  };
}

function filled(draft: Draft) {
  return [draft.name, draft.session.singular, draft.session.plural, draft.speaker.singular, draft.speaker.plural,
    draft.audience.singular, draft.audience.plural, draft.transcripts].every((value) => value.trim() !== "");
}

/** The form for a new custom preset (started from General or a built-in) or an existing one. */
export function CustomPresetForm({
  entry,
  onCommand,
  onDone,
}: Readonly<{
  /** The preset being edited; null starts a new one. */
  entry: StoredCustomPreset | null;
  onCommand: (command: PresetCommand) => Promise<CustomPresetCommandResult>;
  onDone: (message: string) => void;
}>) {
  const { t, locale, presetFor } = useI18n();
  const [source, setSource] = useState<Preset>(() => (entry ? entry.preset : BUILT_IN_PRESETS[0]));
  const [draft, setDraft] = useState<Draft>(() => draftFrom(source, ""));
  const [allowModelText, setAllowModelText] = useState(entry?.modelTextAllowed ?? true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const heldText = entry !== null && !entry.modelTextAllowed;
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const term = (field: "session" | "speaker" | "audience", part: keyof Term, label: MessageKey) => (
    <label>
      <span>{t(label)}</span>
      <input
        type="text"
        name={`${field}-${part}`}
        autoComplete="off"
        maxLength={MAX_PRESET_TERM_CHARS}
        value={draft[field][part]}
        onChange={(event) => update({ [field]: { ...draft[field], [part]: event.target.value } } as Partial<Draft>)}
      />
    </label>
  );

  const copyFrom = (presetId: string) => {
    const next = presetFor(presetId);
    setSource(next);
    setDraft((current) => ({ ...draftFrom(next, current.name), name: current.name }));
  };

  const save = () => {
    if (!filled(draft)) {
      setError(t("settings.presets.customRequired"));
      return;
    }
    const payload = presetPayload(draft, entry ? entry.preset : source);
    const command: PresetCommand = entry
      ? { action: "update", id: entry.preset.id, preset: payload, modelTextAllowed: allowModelText }
      : { action: "create", preset: payload };
    setError("");
    setSaving(true);
    setStatus(t("common.savingForEveryone"));
    onCommand(command)
      .then(() => onDone(t("settings.message.savedForEveryone")))
      .catch((failure: unknown) => {
        setStatus("");
        setError(customPresetMessage(failure, t));
      })
      .finally(() => setSaving(false));
  };

  return (
    <SettingGroup title={entry ? t("settings.presets.customEditTitle") : t("settings.presets.customNewTitle")}>
      {entry === null ? (
        <label>
          <span>{t("settings.presets.customStartFrom")}</span>
          <select name="startFrom" autoComplete="off" value={source.id} onChange={(event) => copyFrom(event.target.value)}>
            {BUILT_IN_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{presetLocalizedText(preset.name, locale)}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <span>{t("settings.presets.customName")}</span>
        <input type="text" name="presetName" autoComplete="off" maxLength={MAX_PRESET_NAME_CHARS} value={draft.name}
          onChange={(event) => update({ name: event.target.value })} />
      </label>
      <label>
        <span>{t("settings.presets.customDescription")}</span>
        <input type="text" name="presetDescription" autoComplete="off" maxLength={200} value={draft.description}
          onChange={(event) => update({ description: event.target.value })} />
      </label>
      <SettingGroup title={t("settings.presets.customTermsTitle")} hint={t("settings.presets.customTermsHint")}>
        {term("session", "singular", "settings.presets.customTermSession")}
        {term("session", "plural", "settings.presets.customTermSessionPlural")}
        {term("speaker", "singular", "settings.presets.customTermSpeaker")}
        {term("speaker", "plural", "settings.presets.customTermSpeakerPlural")}
        {term("audience", "singular", "settings.presets.customTermAudience")}
        {term("audience", "plural", "settings.presets.customTermAudiencePlural")}
        <label>
          <span>{t("settings.presets.customTermTranscripts")}</span>
          <input type="text" name="transcripts-singular" autoComplete="off" maxLength={MAX_PRESET_TERM_CHARS} value={draft.transcripts}
            onChange={(event) => update({ transcripts: event.target.value })} />
        </label>
      </SettingGroup>
      <SettingGroup title={t("settings.presets.customDefaultsTitle")} hint={t("settings.presets.customDefaultsHint")}>
        <label>
          <span>{t("translationSettings.speedTitle")}</span>
          <select name="presetRecordingWindow" autoComplete="off" value={draft.recordingWindowMs} onChange={(event) => update({ recordingWindowMs: event.target.value })}>
            <option value={NOT_SET}>{t("settings.presets.customNotSet")}</option>
            {RECORDING_WINDOW_OPTIONS.map((option) => (
              <option key={String(option)} value={String(option)}>{t(RECORDING_WINDOW_LABELS[option])}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("promptEditor.inferenceTitle")}</span>
          <select name="presetInference" autoComplete="off" value={draft.inferenceLevel} onChange={(event) => update({ inferenceLevel: event.target.value })}>
            <option value={NOT_SET}>{t("settings.presets.customNotSet")}</option>
            {INFERENCE_LEVEL_OPTIONS.map((option) => <option key={option} value={option}>{t(INFERENCE_LEVEL_LABELS[option])}</option>)}
          </select>
        </label>
        <label>
          <span>{t("promptEditor.sanitizeTitle")}</span>
          <select name="presetSanitize" autoComplete="off" value={draft.sanitizeLevel} onChange={(event) => update({ sanitizeLevel: event.target.value })}>
            <option value={NOT_SET}>{t("settings.presets.customNotSet")}</option>
            {SANITIZE_LEVEL_OPTIONS.map((option) => <option key={option} value={option}>{t(SANITIZE_LEVEL_LABELS[option])}</option>)}
          </select>
        </label>
        <label>
          <span>{t("summarySettings.length")}</span>
          <select name="presetSummaryLength" autoComplete="off" value={draft.summaryLength} onChange={(event) => update({ summaryLength: event.target.value })}>
            <option value={NOT_SET}>{t("settings.presets.customNotSet")}</option>
            <option value="short">{t("summarySettings.short")}</option>
            <option value="detailed">{t("summarySettings.detailed")}</option>
          </select>
        </label>
        <label>
          <span>{t("summarySettings.focus")}</span>
          <textarea name="presetSummaryGuidance" autoComplete="off" rows={3} maxLength={MAX_SUMMARY_GUIDANCE_CHARS} value={draft.summaryGuidance}
            onChange={(event) => update({ summaryGuidance: event.target.value })} />
        </label>
      </SettingGroup>
      {heldText ? (
        <label className="checkLabel">
          <input type="checkbox" name="allowModelText" checked={allowModelText} disabled={saving} onChange={(event) => setAllowModelText(event.target.checked)} />
          {t("settings.presets.customAllowModelText")}
        </label>
      ) : null}
      {heldText ? <p className="settingHint">{t("settings.presets.customAllowModelTextHint")}</p> : null}
      {error ? <p className="errorText" role="alert">{error}</p> : null}
      <SaveBar onSave={save} disabled={saving} status={status} label={t("settings.presets.customSave")} />
      <div className="buttonRow">
        <button type="button" className="secondaryButton" disabled={saving} onClick={() => onDone("")}>{t("common.cancel")}</button>
      </div>
    </SettingGroup>
  );
}

/** The message for a refused command: the server's reason when it has one, else the service message. */
export function customPresetMessage(failure: unknown, t: (key: MessageKey) => string): string {
  if (!(failure instanceof CustomPresetError)) return t("settings.error.sharedSetup");
  switch (failure.code) {
    case "name-taken": return t("settings.presets.customErrorName");
    case "limit-reached": return t("settings.presets.customErrorLimit");
    case "invalid": return t("settings.presets.customErrorInvalid");
    case "too-large": return t("settings.presets.customErrorTooLarge");
    case "not-found": return t("settings.presets.customErrorNotFound");
    default: return t("settings.error.sharedSetup");
  }
}
