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
  it("keeps the live note outside the translation settings fingerprint", () => {
    const withLiveNote = { ...BASE_SETTINGS, liveNote: "Synthetic live note" };
    expect(translationSettingsFingerprint(BASE_SETTINGS)).toBe(
      translationSettingsFingerprint(withLiveNote),
    );
  });
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
        inferenceLevel: "high",
        sanitizeLevel: "balanced",
        filterInappropriateLanguage: false,
      }),
    ).toEqual([
      "Translation language",
      "Recording window",
      "Terminology",
      "System prompt",
      "Inference level",
      "Sanitization",
      "Inappropriate language filter",
    ]);
  });

  it("falls back to balanced for a missing or invalid inference level", () => {
    expect(
      normalizeTranslationSessionSettings({ ...BASE_SETTINGS }).inferenceLevel,
    ).toBe("balanced");
    expect(
      normalizeTranslationSessionSettings({
        ...BASE_SETTINGS,
        inferenceLevel: "extreme" as never,
      }).inferenceLevel,
    ).toBe("balanced");
    expect(
      normalizeTranslationSessionSettings({
        ...BASE_SETTINGS,
        inferenceLevel: "low",
      }).inferenceLevel,
    ).toBe("low");
  });

  it("defaults Sanitization to Off and normalizes invalid levels to Off", () => {
    expect(normalizeTranslationSessionSettings({ ...BASE_SETTINGS }).sanitizeLevel).toBe("off");
    expect(normalizeTranslationSessionSettings({
      ...BASE_SETTINGS,
      sanitizeLevel: "extreme" as never,
    }).sanitizeLevel).toBe("off");
    expect(normalizeTranslationSessionSettings({
      ...BASE_SETTINGS,
      sanitizeLevel: "high",
    }).sanitizeLevel).toBe("high");
  });

  it("reads an older same-version snapshot without Sanitization as Off", () => {
    const stored = JSON.stringify({
      version: 4,
      settings: { ...BASE_SETTINGS, sanitizeLevel: undefined, filterInappropriateLanguage: undefined },
      ...SERVICE_IDENTITY,
    });
    expect(parseStoredTranslationSessionSettings(stored)?.settings.sanitizeLevel).toBe("off");
    expect(parseStoredTranslationSessionSettings(stored)?.settings.filterInappropriateLanguage).toBe(true);
  });

  it("keeps inappropriate-language filtering on unless explicitly false", () => {
    expect(BASE_SETTINGS.filterInappropriateLanguage).toBe(true);
    expect(normalizeTranslationSessionSettings({ ...BASE_SETTINGS, filterInappropriateLanguage: undefined }).filterInappropriateLanguage).toBe(true);
    expect(normalizeTranslationSessionSettings({ ...BASE_SETTINGS, filterInappropriateLanguage: "false" as never }).filterInappropriateLanguage).toBe(true);
    expect(normalizeTranslationSessionSettings({ ...BASE_SETTINGS, filterInappropriateLanguage: false }).filterInappropriateLanguage).toBe(false);
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
          version: 4,
          settings: { targetLanguage: "id" },
          ...SERVICE_IDENTITY,
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredTranslationSessionSettings(
        JSON.stringify({
          version: 4,
          settings: { ...BASE_SETTINGS, inferenceLevel: "extreme" },
          ...SERVICE_IDENTITY,
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredTranslationSessionSettings(
        JSON.stringify({
          version: 4,
          settings: BASE_SETTINGS,
          ...SERVICE_IDENTITY,
          translationRevision: "7",
        }),
      ),
    ).toBeNull();
    expect(parseStoredTranslationSessionSettings("not json")).toBeNull();
  });
});
