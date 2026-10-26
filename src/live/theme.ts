/**
 * Operator-facing appearance preferences: colour theme and navigation rail width.
 * Both are cached in localStorage and normalized defensively on read.
 */

export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_KEY = "caption-studio:theme:v1";
export const SIDEBAR_WIDTH_KEY = "caption-studio:sidebar-width:v1";

export const SIDEBAR_WIDTH_DEFAULT = 264;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 420;
export const SIDEBAR_WIDTH_STEP = 16;

export function normalizeTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function normalizeSidebarWidth(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(parsed)));
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

export function readStoredSidebarWidth(storage: ReadableStorage | undefined = browserStorage()): number {
  try {
    return normalizeSidebarWidth(storage?.getItem(SIDEBAR_WIDTH_KEY));
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

/** Reflects the preference on `<html data-theme>`; "system" removes the attribute so the OS setting applies. */
export function applyTheme(theme: ThemePreference, root: { dataset: DOMStringMap } = document.documentElement) {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
