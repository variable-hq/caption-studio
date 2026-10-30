import { describe, expect, it } from "vitest";

import {
  normalizeUiLocale,
  normalizeUiLocalePreference,
  translate,
  translatePlural,
} from "@/i18n";
import { en } from "@/i18n/messages/en";
import { id } from "@/i18n/messages/id";
import { formatCount } from "@/components/operator/format-count";

describe("operator interface translations", () => {
  it("keeps every Indonesian key and placeholder aligned with English", () => {
    const placeholders = (message: string) => [...message.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();

    for (const [key, message] of Object.entries(id)) {
      expect(key in en, `${key} exists in English`).toBe(true);
      expect(message.trim(), `${key} is not empty`).not.toBe("");
      expect(placeholders(message), `${key} placeholders`).toEqual(placeholders(en[key as keyof typeof en]));
    }
    for (const [key, message] of Object.entries(en)) {
      expect(message.trim(), `${key} is not empty`).not.toBe("");
    }
  });

  it("falls back to English when an Indonesian message is not translated yet", () => {
    expect(translate("id", "shell.navigation.live")).toBe("Live");
    expect(translate("id", "shell.status.ready")).toBe("Siap");
  });

  it("interpolates named parameters and leaves absent placeholders intact", () => {
    expect(translate("en", "shell.controls.sessionStatus", { minutes: 12, transcriptState: "saving" }))
      .toBe("12 min left · Transcript saving");
    expect(translate("en", "shell.controls.sessionStatus", { minutes: 12 }))
      .toBe("12 min left · Transcript {transcriptState}");
  });

  it("selects one or other plural forms with Intl plural rules", () => {
    expect(translatePlural("en", "unit.captionCount", 1)).toBe("1 caption");
    expect(translatePlural("en", "unit.captionCount", 2)).toBe("2 captions");
    expect(translatePlural("id", "unit.captionCount", 2)).toBe("2 caption");
  });

  it("normalizes account preferences and detects English or Indonesian browser languages", () => {
    expect(normalizeUiLocalePreference("id")).toBe("id");
    expect(normalizeUiLocalePreference("fr")).toBeNull();
    expect(normalizeUiLocale(null, ["fr-FR", "id-ID"])).toBe("id");
    expect(normalizeUiLocale(null, ["en-US", "id-ID"])).toBe("en");
    expect(normalizeUiLocale("en", ["id-ID"])).toBe("en");
    expect(normalizeUiLocale(null, ["fr-FR"])).toBe("en");
  });

  it("formats counts with the selected interface locale", () => {
    expect(formatCount(12_345, "en")).toBe("12,345");
    expect(formatCount(12_345, "id")).toBe("12.345");
  });
});
