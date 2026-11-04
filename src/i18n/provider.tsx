"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { WORKSPACE_NAME, normalizeWorkspaceName } from "@/domain/workspace";
import {
  normalizeProfileId,
  resolveWorkspacePreset,
  type BuiltInPresetId,
  type Preset,
} from "@/experience/presets";
import {
  normalizeUiLocale,
  normalizeUiLocalePreference,
  translate,
  type MessageKey,
  type MessageParams,
  type UiLocale,
  type UiLocalePreference,
} from "./index";

const UI_LOCALE_PREFERENCE_KEY = "caption-studio:ui-locale:v1";
const WORKSPACE_PROFILE_KEY = "caption-studio:profile:v1";
const WORKSPACE_NAME_KEY = "caption-studio:workspace-name:v1";

type I18nValue = {
  locale: UiLocale;
  uiLocalePreference: UiLocalePreference;
  setUiLocalePreference: (preference: UiLocalePreference) => void;
  setAccountUiLocale: (preference: unknown) => void;
  setBrowserFallbackPreference: () => void;
  /** The workspace's preset; General until the setup or the browser cache says otherwise. */
  workspacePreset: Preset;
  setWorkspaceProfile: (profileId: unknown) => void;
  /** The workspace name; the default name until the setup or the browser cache says otherwise. */
  workspaceName: string;
  setWorkspaceName: (name: unknown) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function readStoredPreference(): UiLocalePreference {
  try {
    return normalizeUiLocalePreference(window.localStorage.getItem(UI_LOCALE_PREFERENCE_KEY));
  } catch {
    return null;
  }
}

function cachePreference(preference: UiLocalePreference) {
  try {
    if (preference === null) window.localStorage.removeItem(UI_LOCALE_PREFERENCE_KEY);
    else window.localStorage.setItem(UI_LOCALE_PREFERENCE_KEY, preference);
  } catch {
    // The selected language still applies for this visit when browser storage is blocked.
  }
}

function readStoredProfile(): BuiltInPresetId | null {
  try {
    return normalizeProfileId(window.localStorage.getItem(WORKSPACE_PROFILE_KEY));
  } catch {
    return null;
  }
}

function cacheProfile(profileId: BuiltInPresetId | null) {
  try {
    if (profileId === null) window.localStorage.removeItem(WORKSPACE_PROFILE_KEY);
    else window.localStorage.setItem(WORKSPACE_PROFILE_KEY, profileId);
  } catch {
    // The saved format still applies for this visit when browser storage is blocked.
  }
}

// The workspace format is an external store: the browser cache, then the shared setup
// replaces it. The server render uses General, so the first client render matches it.
const profileListeners = new Set<() => void>();
let cachedProfile: { value: BuiltInPresetId | null } | null = null;

function subscribeProfile(listener: () => void) {
  profileListeners.add(listener);
  return () => {
    profileListeners.delete(listener);
  };
}

function profileSnapshot(): BuiltInPresetId | null {
  cachedProfile ??= { value: readStoredProfile() };
  return cachedProfile.value;
}

function writeProfile(profileId: BuiltInPresetId | null) {
  cachedProfile = { value: profileId };
  cacheProfile(profileId);
  for (const listener of profileListeners) listener();
}

function readStoredWorkspaceName(): string | null {
  try {
    return normalizeWorkspaceName(window.localStorage.getItem(WORKSPACE_NAME_KEY));
  } catch {
    return null;
  }
}

function cacheWorkspaceName(name: string | null) {
  try {
    if (name === null) window.localStorage.removeItem(WORKSPACE_NAME_KEY);
    else window.localStorage.setItem(WORKSPACE_NAME_KEY, name);
  } catch {
    // The saved name still applies for this visit when browser storage is blocked.
  }
}

// The workspace name is an external store, like the format: the browser cache, then the
// shared setup replaces it. The server render uses the default name.
const workspaceNameListeners = new Set<() => void>();
let cachedWorkspaceName: { value: string | null } | null = null;

function subscribeWorkspaceName(listener: () => void) {
  workspaceNameListeners.add(listener);
  return () => {
    workspaceNameListeners.delete(listener);
  };
}

function workspaceNameSnapshot(): string | null {
  cachedWorkspaceName ??= { value: readStoredWorkspaceName() };
  return cachedWorkspaceName.value;
}

function writeWorkspaceName(name: string | null) {
  cachedWorkspaceName = { value: name };
  cacheWorkspaceName(name);
  for (const listener of workspaceNameListeners) listener();
}

export function I18nProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, setLocale] = useState<UiLocale>("en");
  const [uiLocalePreference, setPreference] = useState<UiLocalePreference>(null);
  const profileId = useSyncExternalStore(subscribeProfile, profileSnapshot, () => null);
  const workspacePreset = useMemo(() => resolveWorkspacePreset(profileId), [profileId]);
  const savedWorkspaceName = useSyncExternalStore(subscribeWorkspaceName, workspaceNameSnapshot, () => null);
  const workspaceName = savedWorkspaceName ?? WORKSPACE_NAME;
  const userChangedPreference = useRef(false);

  const setWorkspaceProfile = useCallback((profileId: unknown) => {
    writeProfile(normalizeProfileId(profileId));
  }, []);

  const setWorkspaceName = useCallback((name: unknown) => {
    writeWorkspaceName(normalizeWorkspaceName(name));
  }, []);

  const applyPreference = useCallback((preference: UiLocalePreference) => {
    setPreference(preference);
    setLocale(normalizeUiLocale(preference));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setUiLocalePreference = useCallback((preference: UiLocalePreference) => {
    const normalized = normalizeUiLocalePreference(preference);
    userChangedPreference.current = true;
    cachePreference(normalized);
    applyPreference(normalized);
  }, [applyPreference]);

  const setAccountUiLocale = useCallback((preference: unknown) => {
    if (userChangedPreference.current) return;
    const normalized = normalizeUiLocalePreference(preference);
    cachePreference(normalized);
    applyPreference(normalized);
  }, [applyPreference]);

  const setBrowserFallbackPreference = useCallback(() => {
    if (!userChangedPreference.current) applyPreference(readStoredPreference());
  }, [applyPreference]);

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => translate(locale, key, params, workspacePreset),
    [locale, workspacePreset],
  );
  const value = useMemo(() => ({
    locale,
    uiLocalePreference,
    setUiLocalePreference,
    setAccountUiLocale,
    setBrowserFallbackPreference,
    workspacePreset,
    setWorkspaceProfile,
    workspaceName,
    setWorkspaceName,
    t,
  }), [
    locale,
    uiLocalePreference,
    setUiLocalePreference,
    setAccountUiLocale,
    setBrowserFallbackPreference,
    workspacePreset,
    setWorkspaceProfile,
    workspaceName,
    setWorkspaceName,
    t,
  ]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Renders its children with the wording of a session's format, so the screens that follow a
 * running session read its terms. A null id leaves the surrounding wording unchanged.
 */
export function PresetScope({ presetId, children }: Readonly<{ presetId: BuiltInPresetId | null; children: React.ReactNode }>) {
  const parent = useI18n();
  const preset = useMemo(() => (presetId === null ? null : resolveWorkspacePreset(presetId)), [presetId]);
  const value = useMemo<I18nValue>(
    () => preset === null
      ? parent
      : { ...parent, workspacePreset: preset, t: (key: MessageKey, params?: MessageParams) => translate(parent.locale, key, params, preset) },
    [parent, preset],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider.");
  return value;
}

export function useT() {
  return useI18n().t;
}

/** The workspace name shown in the top bar and in `{workspace}` messages. */
export function useWorkspaceName() {
  return useI18n().workspaceName;
}
