"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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

type I18nValue = {
  locale: UiLocale;
  uiLocalePreference: UiLocalePreference;
  setUiLocalePreference: (preference: UiLocalePreference) => void;
  setAccountUiLocale: (preference: unknown) => void;
  setBrowserFallbackPreference: () => void;
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

export function I18nProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, setLocale] = useState<UiLocale>("en");
  const [uiLocalePreference, setPreference] = useState<UiLocalePreference>(null);
  const userChangedPreference = useRef(false);

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

  const t = useCallback((key: MessageKey, params?: MessageParams) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({
    locale,
    uiLocalePreference,
    setUiLocalePreference,
    setAccountUiLocale,
    setBrowserFallbackPreference,
    t,
  }), [
    locale,
    uiLocalePreference,
    setUiLocalePreference,
    setAccountUiLocale,
    setBrowserFallbackPreference,
    t,
  ]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider.");
  return value;
}
