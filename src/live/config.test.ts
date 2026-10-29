import { describe, expect, it } from "vitest";

import {
  parseGlossaryInput,
  parseModerationInput,
  preferredTermMap,
} from "@/live/config";
import {
  DEFAULT_RECORDING_WINDOW_MS,
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
  MIN_RECORDING_WINDOW_MS,
  RECORDING_WINDOW_OPTIONS,
  normalizeCaptionStyle,
  normalizeRecordingWindowMs,
} from "@/live/contracts";

describe("live caption configuration", () => {
  it("derives the session transcription request cap from the audio cadence", () => {
    expect(DEFAULT_RECORDING_WINDOW_MS).toBe("dynamic");
    expect(MIN_RECORDING_WINDOW_MS).toBe(6_000);
    expect(RECORDING_WINDOW_OPTIONS).toEqual([6_000, 10_000, 14_000, "dynamic"]);
    expect(MAX_TRANSCRIPTION_REQUESTS).toBe(900);
    expect(MAX_TRANSCRIPTION_REQUESTS).toBe(
      MAX_LIVE_SESSION_MS / MIN_RECORDING_WINDOW_MS,
    );
  });

  it("accepts only the bounded recording-window options", () => {
    expect(normalizeRecordingWindowMs(6_000)).toBe(6_000);
    expect(normalizeRecordingWindowMs("10000")).toBe(10_000);
    expect(normalizeRecordingWindowMs(14_000)).toBe(14_000);
    expect(normalizeRecordingWindowMs("dynamic")).toBe("dynamic");
    expect(normalizeRecordingWindowMs(9_000)).toBe(10_000);
    expect(normalizeRecordingWindowMs(12_000)).toBe(14_000);
    expect(normalizeRecordingWindowMs(15_000)).toBe(14_000);
    expect(normalizeRecordingWindowMs(18_000)).toBe(14_000);
    expect(normalizeRecordingWindowMs(3_000)).toBe("dynamic");
    expect(normalizeRecordingWindowMs(21_000)).toBe("dynamic");
    expect(normalizeRecordingWindowMs("invalid")).toBe("dynamic");
  });

  it("parses recognition hints and target-language preferred terms", () => {
    const glossary = parseGlossaryInput(
      "Jesus Christ => Yesus Kristus, Nebuchadnezzar",
      "id",
    );

    expect(glossary.map(({ canonical }) => canonical)).toEqual([
      "Jesus Christ",
      "Nebuchadnezzar",
    ]);
    expect(preferredTermMap(glossary, "id")).toEqual({
      "Jesus Christ": "Yesus Kristus",
    });
  });

  it("bounds operator-supplied moderation and display values", () => {
    expect(parseModerationInput("badword, another")).toHaveLength(2);
    expect(parseModerationInput("badword")).toEqual([
      { id: "operator-filter-0", term: "badword", mode: "mask" },
    ]);
    expect(parseModerationInput("badword=>darn")).toEqual([
      { id: "operator-filter-0", term: "badword", mode: "replace", replacement: "darn" },
    ]);
    expect(parseModerationInput("badword=>!hide")).toEqual([
      { id: "operator-filter-0", term: "badword", mode: "hide-segment" },
    ]);
    expect(parseModerationInput("badword=>!HIDE")).toEqual([
      { id: "operator-filter-0", term: "badword", mode: "hide-segment" },
    ]);
    expect(parseModerationInput("=>darn")).toEqual([]);
    expect(
      normalizeCaptionStyle({
        fontSize: 500,
        textColor: "not-a-colour",
        backgroundColor: "#123456",
        backgroundTransparency: 34,
        horizontalMarginPercent: 30,
        verticalMarginPercent: -4,
        horizontalAlign: "right",
        verticalAlign: "top",
        fontFamily: "serif",
      }),
    ).toEqual({
      fontSize: 72,
      textColor: "#ffffff",
      backgroundColor: "#123456",
      backgroundTransparency: 34,
      horizontalMarginPercent: 20,
      verticalMarginPercent: 0,
      horizontalAlign: "right",
      verticalAlign: "top",
      fontFamily: "serif",
    });

    expect(normalizeCaptionStyle({ fontSize: -20, backgroundTransparency: 120 })).toEqual({
      fontSize: 10,
      textColor: "#ffffff",
      backgroundColor: "#101827",
      backgroundTransparency: 100,
      horizontalMarginPercent: 4,
      verticalMarginPercent: 6,
      horizontalAlign: "center",
      verticalAlign: "bottom",
      fontFamily: "sans-serif",
    });
  });
});
