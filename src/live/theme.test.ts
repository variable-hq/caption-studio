import { describe, expect, it } from "vitest";

import {
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  THEME_PREFERENCE_KEY,
  applyTheme,
  normalizeSidebarWidth,
  normalizeTheme,
  readStoredSidebarWidth,
  readStoredTheme,
} from "@/live/theme";

describe("normalizeTheme", () => {
  it("accepts only the three known preferences", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("system")).toBe("system");
  });

  it("falls back to system for anything else", () => {
    expect(normalizeTheme(null)).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
    expect(normalizeTheme("Dark")).toBe("system");
    expect(normalizeTheme(42)).toBe("system");
    expect(normalizeTheme({ theme: "dark" })).toBe("system");
  });
});

describe("normalizeSidebarWidth", () => {
  it("clamps to the supported range and rounds", () => {
    expect(normalizeSidebarWidth(264)).toBe(264);
    expect(normalizeSidebarWidth(199)).toBe(SIDEBAR_WIDTH_MIN);
    expect(normalizeSidebarWidth(9999)).toBe(SIDEBAR_WIDTH_MAX);
    expect(normalizeSidebarWidth(300.4)).toBe(300);
    expect(SIDEBAR_WIDTH_MIN).toBe(200);
    expect(SIDEBAR_WIDTH_MAX).toBe(420);
    expect(SIDEBAR_WIDTH_DEFAULT).toBe(264);
  });

  it("parses stored strings and rejects garbage", () => {
    expect(normalizeSidebarWidth("312")).toBe(312);
    expect(normalizeSidebarWidth("312px")).toBe(312);
    expect(normalizeSidebarWidth("wide")).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(normalizeSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(normalizeSidebarWidth(null)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(normalizeSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});

describe("stored preference readers", () => {
  it("uses the versioned storage keys", () => {
    expect(THEME_PREFERENCE_KEY).toBe("church-live-caption:theme:v1");
    expect(SIDEBAR_WIDTH_KEY).toBe("church-live-caption:sidebar-width:v1");
  });

  it("reads through the storage keys and survives a throwing or missing storage", () => {
    const values: Record<string, string> = { [THEME_PREFERENCE_KEY]: "dark", [SIDEBAR_WIDTH_KEY]: "240" };
    const storage = { getItem: (key: string) => values[key] ?? null };
    expect(readStoredTheme(storage)).toBe("dark");
    expect(readStoredSidebarWidth(storage)).toBe(240);
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(readStoredTheme(broken)).toBe("system");
    expect(readStoredSidebarWidth(broken)).toBe(SIDEBAR_WIDTH_DEFAULT);
    expect(readStoredTheme(undefined)).toBe("system");
    expect(readStoredSidebarWidth(undefined)).toBe(SIDEBAR_WIDTH_DEFAULT);
  });

  it("falls back to system defaults when no window exists", () => {
    expect(readStoredTheme()).toBe("system");
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});

describe("applyTheme", () => {
  it("sets an explicit theme and removes it for system", () => {
    const root = { dataset: {} as DOMStringMap };
    applyTheme("dark", root);
    expect(root.dataset.theme).toBe("dark");
    applyTheme("light", root);
    expect(root.dataset.theme).toBe("light");
    applyTheme("system", root);
    expect("theme" in root.dataset).toBe(false);
  });
});
