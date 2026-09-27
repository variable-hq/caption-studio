import { describe, expect, it } from "vitest";

import { DEFAULT_TRANSLATION_SYSTEM_PROMPT } from "@/ai/translation-prompt";
import {
  normalizeTranslationSessionSettings,
  parseStoredTranslationSessionSettings,
  serializeTranslationSessionSettings,
  translationSessionSnapshotMatches,
  translationSettingsChanges,
  translationSettingsFingerprint,
} from "@/live/translation-settings";

const BASE_SETTINGS = normalizeTranslationSessionSettings({
  sourceLanguage: "en",
  targetLanguage: "id",
  keywordText: "Grace => Kasih karunia",
  filterText: "private",
  recordingWindowMs: 6_000,
  translationSystemPrompt: DEFAULT_TRANSLATION_SYSTEM_PROMPT,
});
const SERVICE_IDENTITY = {
  startedAt: "2026-08-23T00:00:00.000Z",
  expiresAt: "2026-08-23T01:30:00.000Z",
  translationRevision: 7,
};

describe("translation-session settings", () => {
  it("normalizes a complete atomic snapshot", () => {
    expect(
      normalizeTranslationSessionSettings({
        ...BASE_SETTINGS,
        sourceLanguage: "auto",
        targetLanguage: "zh-Hant",
        recordingWindowMs: 12_000,
      }),
    ).toMatchObject({
      sourceLanguage: "auto",
      targetLanguage: "zh-Hant",
      recordingWindowMs: 12_000,
    });
  });

  it("reports only draft categories that differ from the active snapshot", () => {
    expect(
      translationSettingsChanges(BASE_SETTINGS, {
        ...BASE_SETTINGS,
        targetLanguage: "ja",
        recordingWindowMs: 9_000,
        keywordText: "Bethlehem",
        translationSystemPrompt: "Prefer concise, natural captions.",
      }),
    ).toEqual([
      "Translation language",
      "Recording window",
      "Terminology",
      "System prompt",
    ]);
  });

  it("creates stable fingerprints for equivalent normalized settings", () => {
    expect(translationSettingsFingerprint(BASE_SETTINGS)).toBe(
      translationSettingsFingerprint({ ...BASE_SETTINGS }),
    );
  });

  it("round-trips a versioned same-tab recovery snapshot", () => {
    const stored = serializeTranslationSessionSettings(
      BASE_SETTINGS,
      SERVICE_IDENTITY,
    );
    const snapshot = parseStoredTranslationSessionSettings(stored);
    expect(snapshot).toEqual({
      ...SERVICE_IDENTITY,
      settings: BASE_SETTINGS,
    });
    expect(
      translationSessionSnapshotMatches(snapshot!, SERVICE_IDENTITY),
    ).toBe(true);
    expect(
      translationSessionSnapshotMatches(snapshot!, {
        ...SERVICE_IDENTITY,
        translationRevision: 8,
      }),
    ).toBe(false);
  });

  it("fails closed for stale, malformed, or incomplete recovery snapshots", () => {
    expect(
      parseStoredTranslationSessionSettings(
        JSON.stringify({
          version: 1,
          settings: BASE_SETTINGS,
          ...SERVICE_IDENTITY,
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredTranslationSessionSettings(
        JSON.stringify({
          version: 3,
          settings: { targetLanguage: "id" },
          ...SERVICE_IDENTITY,
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredTranslationSessionSettings(
        JSON.stringify({
          version: 3,
          settings: BASE_SETTINGS,
          ...SERVICE_IDENTITY,
          translationRevision: "7",
        }),
      ),
    ).toBeNull();
    expect(parseStoredTranslationSessionSettings("not json")).toBeNull();
  });
});
