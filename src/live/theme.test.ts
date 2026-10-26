import { describe, expect, it } from "vitest";

import {
  THEME_PREFERENCE_KEY,
  applyTheme,
  normalizeTheme,
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

describe("stored preference readers", () => {
  it("uses the versioned storage keys", () => {
    expect(THEME_PREFERENCE_KEY).toBe("caption-studio:theme:v1");
  });

  it("reads through the storage keys and survives a throwing or missing storage", () => {
    const values: Record<string, string> = { [THEME_PREFERENCE_KEY]: "dark" };
    const storage = { getItem: (key: string) => values[key] ?? null };
    expect(readStoredTheme(storage)).toBe("dark");
    const broken = { getItem: () => { throw new Error("blocked"); } };
    expect(readStoredTheme(broken)).toBe("system");
    expect(readStoredTheme(undefined)).toBe("system");
  });

  it("falls back to system defaults when no window exists", () => {
    expect(readStoredTheme()).toBe("system");
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
