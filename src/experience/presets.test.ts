import { describe, expect, it } from "vitest";

import {
  GENERAL_PRESET,
  GENERAL_PRESET_ID,
  MAX_PRESET_NAME_CHARS,
  PresetValidationError,
  normalizePreset,
  presetTermParams,
  resolvePresetTerm,
} from "@/experience/presets";

const CUSTOM_ID = "custom:3f2a9c1e-6b7d-4e8f-9a0b-1c2d3e4f5a6b";

function customPreset(overrides: Record<string, unknown> = {}) {
  return { ...structuredClone(GENERAL_PRESET), id: CUSTOM_ID, ...overrides };
}

function expectRejected(input: unknown, reason: RegExp) {
  expect(() => normalizePreset(input)).toThrow(PresetValidationError);
  expect(() => normalizePreset(input)).toThrow(reason);
}

describe("workspace preset schema", () => {
  it("accepts the General preset and returns an equal copy", () => {
    expect(normalizePreset(GENERAL_PRESET)).toEqual(GENERAL_PRESET);
    expect(GENERAL_PRESET.id).toBe(GENERAL_PRESET_ID);
  });

  it("accepts a custom preset with an optional author", () => {
    expect(normalizePreset(customPreset({ author: "Worship team" })).author).toBe("Worship team");
  });

  it("rejects unknown fields at every level", () => {
    expectRejected({ ...GENERAL_PRESET, extra: true }, /unknown field "extra"/u);
    expectRejected({ ...GENERAL_PRESET, name: { en: "General", fr: "Général" } }, /unknown field "fr"/u);
    expectRejected(
      { ...GENERAL_PRESET, terms: { ...GENERAL_PRESET.terms, en: { ...GENERAL_PRESET.terms.en, venue: { singular: "hall" } } } },
      /unknown field "venue"/u,
    );
    expectRejected(
      { ...GENERAL_PRESET, terms: { ...GENERAL_PRESET.terms, en: { ...GENERAL_PRESET.terms.en, transcripts: { singular: "transcripts", plural: "transcripts" } } } },
      /unknown field "plural"/u,
    );
  });

  it("rejects an unknown schema version", () => {
    expectRejected({ ...GENERAL_PRESET, schemaVersion: 2 }, /schemaVersion must be 1/u);
    expectRejected({ ...GENERAL_PRESET, schemaVersion: undefined }, /schemaVersion must be 1/u);
  });

  it("rejects values outside their bounds", () => {
    expectRejected({ ...GENERAL_PRESET, version: 0 }, /version must be a whole number/u);
    expectRejected({ ...GENERAL_PRESET, version: 1.5 }, /version must be a whole number/u);
    expectRejected(
      { ...GENERAL_PRESET, name: { en: "x".repeat(MAX_PRESET_NAME_CHARS + 1) } },
      /name\.en must be 40 characters or fewer/u,
    );
    expectRejected({ ...GENERAL_PRESET, name: { en: "  " } }, /name\.en must not be empty/u);
    expectRejected({ ...GENERAL_PRESET, description: { en: "Line\nbreak" } }, /control characters/u);
    expectRejected(customPreset({ author: "a".repeat(81) }), /author must be 80 characters or fewer/u);
  });

  it("accepts only builtin:<name> and custom:<uuid> ids", () => {
    expectRejected({ ...GENERAL_PRESET, id: "builtin:General" }, /id must be builtin:<name> or custom:<uuid>/u);
    expectRejected({ ...GENERAL_PRESET, id: "market:publisher/slug" }, /id must be builtin:<name> or custom:<uuid>/u);
    expectRejected(customPreset({ id: "custom:not-a-uuid" }), /id must be builtin:<name> or custom:<uuid>/u);
  });

  it("requires the English term set and rejects a term set without a required term", () => {
    expectRejected({ ...GENERAL_PRESET, terms: { id: GENERAL_PRESET.terms.id } }, /terms\.en is required/u);
    expectRejected(
      { ...GENERAL_PRESET, terms: { en: { ...GENERAL_PRESET.terms.en, speaker: undefined }, id: GENERAL_PRESET.terms.id } },
      /terms\.en\.speaker is required/u,
    );
  });

  it("requires a plural form for session, speaker and audience only", () => {
    expectRejected(
      { ...GENERAL_PRESET, terms: { ...GENERAL_PRESET.terms, en: { ...GENERAL_PRESET.terms.en, session: { singular: "session" } } } },
      /terms\.en\.session\.plural is required/u,
    );
    expect(() => normalizePreset(GENERAL_PRESET)).not.toThrow();
  });
});

describe("term resolution", () => {
  const sermonLike = customPreset({
    terms: {
      en: { ...GENERAL_PRESET.terms.en, session: { singular: "service", plural: "services" } },
      id: {
        session: { singular: "ibadah", plural: "ibadah" },
        speaker: { singular: "pengkhotbah", plural: "pengkhotbah" },
        audience: { singular: "jemaat", plural: "jemaat" },
        transcripts: { singular: "khotbah" },
      },
    },
  });

  it("fills singular, plural and capitalized placeholders from the preset", () => {
    const params = presetTermParams(normalizePreset(sermonLike), "en");
    expect(params.term_session).toBe("service");
    expect(params.term_sessions).toBe("services");
    expect(params.Term_session).toBe("Service");
    expect(params.Term_sessions).toBe("Services");
    expect(params.term_transcripts).toBe("transcripts");
    expect(params.term_transcriptss).toBeUndefined();
  });

  it("uses the preset for its own language and falls back in the documented order", () => {
    const preset = normalizePreset(sermonLike);
    expect(resolvePresetTerm(preset, "session", "id").singular).toBe("ibadah");
    expect(resolvePresetTerm(preset, "session", "en").singular).toBe("service");

    // Without an Indonesian set, General's Indonesian term applies before the preset's English.
    const englishOnly = normalizePreset(customPreset({ terms: { en: sermonLike.terms.en } }));
    expect(resolvePresetTerm(englishOnly, "session", "id").singular).toBe("sesi");
    expect(resolvePresetTerm(englishOnly, "session", "en").singular).toBe("service");
  });

  it("gives the General preset the words used before the placeholders", () => {
    expect(presetTermParams(GENERAL_PRESET, "en")).toMatchObject({
      term_session: "session",
      Term_session: "Session",
      term_sessions: "sessions",
      term_speaker: "speaker",
      term_audiences: "audiences",
      term_transcripts: "transcripts",
    });
    expect(presetTermParams(GENERAL_PRESET, "id")).toMatchObject({
      term_session: "sesi",
      term_speaker: "pembicara",
      Term_speaker: "Pembicara",
      term_transcripts: "transkrip",
    });
  });
});
