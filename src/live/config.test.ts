import { describe, expect, it } from "vitest";

import {
  parseGlossaryInput,
  parseModerationInput,
  preferredTermMap,
} from "@/live/config";
import {
  DEFAULT_SPEECH_BUFFER_MS,
  MAX_LIVE_SESSION_MS,
  MAX_TRANSCRIPTION_REQUESTS,
  MIN_SPEECH_BUFFER_MS,
  SPEECH_BUFFER_OPTIONS_MS,
  normalizeCaptionStyle,
  normalizeSpeechBufferMs,
} from "@/live/contracts";

describe("live caption configuration", () => {
  it("derives the session transcription request cap from the audio cadence", () => {
    expect(DEFAULT_SPEECH_BUFFER_MS).toBe(6_000);
    expect(MIN_SPEECH_BUFFER_MS).toBe(6_000);
    expect(SPEECH_BUFFER_OPTIONS_MS).toEqual([6_000, 9_000, 12_000, 15_000, 18_000]);
    expect(MAX_TRANSCRIPTION_REQUESTS).toBe(900);
    expect(MAX_TRANSCRIPTION_REQUESTS).toBe(
      MAX_LIVE_SESSION_MS / MIN_SPEECH_BUFFER_MS,
    );
  });

  it("accepts only the bounded speech-buffer options", () => {
    expect(normalizeSpeechBufferMs(6_000)).toBe(6_000);
    expect(normalizeSpeechBufferMs("9000")).toBe(9_000);
    expect(normalizeSpeechBufferMs(12_000)).toBe(12_000);
    expect(normalizeSpeechBufferMs(15_000)).toBe(15_000);
    expect(normalizeSpeechBufferMs("18000")).toBe(18_000);
    expect(normalizeSpeechBufferMs(3_000)).toBe(6_000);
    expect(normalizeSpeechBufferMs(21_000)).toBe(6_000);
    expect(normalizeSpeechBufferMs("invalid")).toBe(6_000);
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
