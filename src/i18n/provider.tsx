"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

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

type I18nValue = {
  locale: UiLocale;
  uiLocalePreference: UiLocalePreference;
  setUiLocalePreference: (preference: UiLocalePreference) => void;
  setAccountUiLocale: (preference: unknown) => void;
  setBrowserFallbackPreference: () => void;
  /** The workspace's preset; General until the setup or the browser cache says otherwise. */
  workspacePreset: Preset;
  setWorkspaceProfile: (profileId: unknown) => void;
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

export function I18nProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, setLocale] = useState<UiLocale>("en");
  const [uiLocalePreference, setPreference] = useState<UiLocalePreference>(null);
  const profileId = useSyncExternalStore(subscribeProfile, profileSnapshot, () => null);
  const workspacePreset = useMemo(() => resolveWorkspacePreset(profileId), [profileId]);
  const userChangedPreference = useRef(false);

  const setWorkspaceProfile = useCallback((profileId: unknown) => {
    writeProfile(normalizeProfileId(profileId));
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
    t,
  }), [
    locale,
    uiLocalePreference,
    setUiLocalePreference,
    setAccountUiLocale,
    setBrowserFallbackPreference,
    workspacePreset,
    setWorkspaceProfile,
    t,
  ]);
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
