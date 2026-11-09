"use client";

import { useEffect, useRef, useState } from "react";

import {
  AI_PROVIDER_LABELS,
  DEFAULT_TRANSCRIPTION_MODELS,
  DEFAULT_TRANSLATION_MODELS,
  KEYED_PROVIDER_IDS,
  SUGGESTED_TRANSLATION_MODELS,
  TRANSCRIPTION_PROVIDER_IDS,
  TRANSLATION_PROVIDER_IDS,
  isKeyedProvider,
  isValidApiKeyInput,
  isValidModelIdInput,
  type KeyedProviderId,
  type ProviderSelections,
  type ProviderSettingsView,
  type TranscriptionProviderId,
  type TranslationProviderId,
} from "@/ai/providers";
import {
  ProviderSettingsError,
  clearProviderKey,
  loadProviderSettings,
  saveProviderKey,
  saveProviderSelections,
} from "@/experience/providers-client";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";

import { ConfirmDialog } from "./ConfirmDialog";
import { SaveBar, SettingGroup } from "./SettingsParts";

const ERROR_KEYS: Record<string, MessageKey> = {
  "provider-key-missing": "settings.providers.error.keyMissing",
  "provider-key-in-use": "settings.providers.error.keyInUse",
  "provider-key-invalid": "settings.providers.error.keyInvalid",
  "provider-key-encryption-unavailable": "settings.providers.error.encryptionUnavailable",
};

function errorMessageKey(error: unknown): MessageKey {
  return (error instanceof ProviderSettingsError && ERROR_KEYS[error.code]) || "settings.providers.error.unavailable";
}

/**
 * The workspace's AI providers (ADR 0041): which provider and model run transcription and
 * translation, and the saved API keys. Keys are write-only; only their last four characters
 * come back. Changes apply to the next caption request, including during a live session.
 */
export function AiProvidersEditor() {
  const { t, locale } = useI18n();
  const [view, setView] = useState<ProviderSettingsView | null>(null);
  const [draft, setDraft] = useState<ProviderSelections | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadProviderSettings()
      .then((loaded) => { if (active) setView(loaded); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, []);

  if (loadFailed) {
    return <p className="settingHint" role="alert">{t("settings.providers.error.unavailable")}</p>;
  }
  if (!view) return <p className="settingHint" role="status">{t("settings.providers.loading")}</p>;

  const selections = draft ?? view.selections;
  const modelsValid = isValidModelIdInput(selections.transcription.model) && isValidModelIdInput(selections.translation.model);
  const missingKey = [selections.transcription.provider, selections.translation.provider]
    .find((provider) => isKeyedProvider(provider) && !view.keys[provider]);

  const saveSelections = () => {
    setSaving(true);
    setStatus(t("common.savingForEveryone"));
    void saveProviderSelections(selections)
      .then((next) => {
        setView(next);
        setDraft(null);
        setStatus(t("settings.message.savedForEveryone"));
      })
      .catch((error: unknown) => setStatus(t(errorMessageKey(error))))
      .finally(() => setSaving(false));
  };

  const keyName = (provider: string) => AI_PROVIDER_LABELS[provider as KeyedProviderId] ?? provider;

  return (
    <>
      <SettingGroup title={t("settings.providers.transcriptionTitle")} hint={t("settings.providers.transcriptionHint")}>
        <label>
          <span>{t("settings.providers.providerLabel")}</span>
          <select
            name="transcriptionProvider"
            value={selections.transcription.provider}
            onChange={(event) => setDraft({ ...selections, transcription: { provider: event.target.value as TranscriptionProviderId, model: "" } })}
          >
            {TRANSCRIPTION_PROVIDER_IDS.map((id) => <option key={id} value={id}>{AI_PROVIDER_LABELS[id]}</option>)}
          </select>
        </label>
        <label>
          <span>{t("settings.providers.modelLabel")}</span>
          <input
            type="text"
            name="transcriptionModel"
            autoComplete="off"
            spellCheck={false}
            value={selections.transcription.model}
            placeholder={DEFAULT_TRANSCRIPTION_MODELS[selections.transcription.provider]}
            aria-invalid={isValidModelIdInput(selections.transcription.model) ? undefined : true}
            aria-describedby={modelsValid ? undefined : "provider-model-error"}
            onChange={(event) => setDraft({ ...selections, transcription: { ...selections.transcription, model: event.target.value } })}
          />
        </label>
      </SettingGroup>

      <SettingGroup title={t("settings.providers.translationTitle")} hint={t("settings.providers.translationHint")}>
        <label>
          <span>{t("settings.providers.providerLabel")}</span>
          <select
            name="translationProvider"
            value={selections.translation.provider}
            onChange={(event) => setDraft({ ...selections, translation: { provider: event.target.value as TranslationProviderId, model: "" } })}
          >
            {TRANSLATION_PROVIDER_IDS.map((id) => <option key={id} value={id}>{AI_PROVIDER_LABELS[id]}</option>)}
          </select>
        </label>
        <label>
          <span>{t("settings.providers.modelLabel")}</span>
          <input
            type="text"
            name="translationModel"
            autoComplete="off"
            spellCheck={false}
            list="translation-model-suggestions"
            value={selections.translation.model}
            placeholder={DEFAULT_TRANSLATION_MODELS[selections.translation.provider]}
            aria-invalid={isValidModelIdInput(selections.translation.model) ? undefined : true}
            aria-describedby={modelsValid ? undefined : "provider-model-error"}
            onChange={(event) => setDraft({ ...selections, translation: { ...selections.translation, model: event.target.value } })}
          />
          <datalist id="translation-model-suggestions">
            {SUGGESTED_TRANSLATION_MODELS[selections.translation.provider].map((model) => <option key={model} value={model} />)}
          </datalist>
        </label>
        <p className="settingHint">{t("settings.providers.modelHint")}</p>
        {missingKey ? (
          <p className="settingHint" role="alert">{t("settings.providers.needsKey", { provider: keyName(missingKey) })}</p>
        ) : null}
        {modelsValid ? null : <p id="provider-model-error" className="settingHint" role="alert">{t("settings.providers.modelInvalid")}</p>}
        <SaveBar onSave={saveSelections} disabled={saving || !draft || !modelsValid || Boolean(missingKey)} status={status || (draft ? "" : t("settings.providers.noChanges"))} />
      </SettingGroup>

      <SettingGroup title={t("settings.providers.keysTitle")} hint={t("settings.providers.keysHint")}>
        <div className="providerKeyList">
        {KEYED_PROVIDER_IDS.map((provider) => (
          <ProviderKeyField
            key={provider}
            provider={provider}
            saved={view.keys[provider]}
            inUse={selections.transcription.provider === provider || selections.translation.provider === provider}
            locale={locale}
            onChange={setView}
          />
        ))}
        </div>
      </SettingGroup>
    </>
  );
}

function ProviderKeyField({ provider, saved, inUse, locale, onChange }: Readonly<{
  provider: KeyedProviderId;
  saved: ProviderSettingsView["keys"][KeyedProviderId];
  inUse: boolean;
  locale: string;
  onChange: (view: ProviderSettingsView) => void;
}>) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const name = AI_PROVIDER_LABELS[provider];
  const valid = isValidApiKeyInput(value);
  const inputId = `provider-key-${provider}`;
  const removeDialogRef = useRef<HTMLDialogElement>(null);

  const run = (action: () => Promise<ProviderSettingsView>, done: MessageKey) => {
    setBusy(true);
    setStatus(t("common.savingForEveryone"));
    void action()
      .then((next) => {
        onChange(next);
        setValue("");
        setStatus(t(done));
      })
      .catch((error: unknown) => setStatus(t(errorMessageKey(error))))
      .finally(() => setBusy(false));
  };

  return (
    <div className="providerKeyField">
      <label>
        <span>{t("settings.providers.keyLabel", { provider: name })}</span>
        <input
          type="password"
          name={inputId}
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={saved ? t("settings.providers.keySavedPlaceholder", { last4: saved.last4 }) : ""}
          aria-describedby={`${inputId}-saved`}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p id={`${inputId}-saved`} className="settingHint">
        {saved
          ? t("settings.providers.keySaved", { last4: saved.last4, savedAt: new Date(saved.savedAt).toLocaleDateString(locale) })
          : t("settings.providers.keyNotSaved")}
      </p>
      <div className="buttonRow">
        <button type="button" className="secondaryButton" disabled={busy || !valid}
          onClick={() => run(() => saveProviderKey(provider, value), "settings.providers.keySavedMessage")}>
          {t("settings.providers.saveKey", { provider: name })}
        </button>
        {saved ? (
          <button type="button" className="secondaryButton" disabled={busy || inUse}
            title={inUse ? t("settings.providers.error.keyInUse") : undefined}
            onClick={() => removeDialogRef.current?.showModal()}>
            {t("settings.providers.removeKey", { provider: name })}
          </button>
        ) : null}
      </div>
      <p className="settingHint" role="status" aria-live="polite">{status}</p>
      <ConfirmDialog
        dialogRef={removeDialogRef}
        title={t("settings.providers.removeKeyTitle", { provider: name })}
        body={t("settings.providers.removeKeyBody", { provider: name })}
        cancelLabel={t("common.cancel")}
        actionLabel={t("settings.providers.removeKey", { provider: name })}
        disabled={busy}
        onConfirm={() => {
          removeDialogRef.current?.close();
          run(() => clearProviderKey(provider), "settings.providers.keyRemovedMessage");
        }}
      />
    </div>
  );
}
