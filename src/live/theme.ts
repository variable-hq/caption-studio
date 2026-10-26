/**
 * The operator's colour theme, cached in localStorage and normalized defensively on read.
 */

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_KEY = "caption-studio:theme:v1";

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

type ReadableStorage = Pick<Storage, "getItem">;

function browserStorage(): ReadableStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readStoredTheme(storage: ReadableStorage | undefined = browserStorage()): ThemePreference {
  try {
    return normalizeTheme(storage?.getItem(THEME_PREFERENCE_KEY));
  } catch {
    return "system";
  }
}

/** Reflects the preference on `<html data-theme>`; "system" removes the attribute so the OS setting applies. */
export function applyTheme(theme: ThemePreference, root: { dataset: DOMStringMap } = document.documentElement) {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
