import { describe, expect, it } from "vitest";

import type { SanitizeLevel } from "@/ai/contracts";
import {
  SANITIZE_GUARD_THRESHOLDS,
  shouldDropSegment,
} from "@/ai/transcript-guard";

const SPEECH = {
  no_speech_prob: 0.02,
  avg_logprob: -0.15,
  compression_ratio: 1.1,
};

describe("Sanitization transcription guard", () => {
  it.each(["low", "balanced", "high"] as const)(
    "drops silence-like and compressed segments at %s",
    (level) => {
      const thresholds = SANITIZE_GUARD_THRESHOLDS[level];
      expect(thresholds).not.toBeNull();
      expect(shouldDropSegment({
        no_speech_prob: thresholds!.noSpeechProbAbove + 0.01,
        avg_logprob: thresholds!.avgLogprobBelow - 0.01,
        compression_ratio: 1.1,
      }, level)).toBe(true);
      expect(shouldDropSegment({
        ...SPEECH,
        compression_ratio: thresholds!.compressionRatioAbove + 0.01,
      }, level)).toBe(true);
    },
  );

  it.each(["low", "balanced", "high"] as const)(
    "uses strict threshold comparisons at %s",
    (level) => {
      const thresholds = SANITIZE_GUARD_THRESHOLDS[level]!;
      const quiet = {
        no_speech_prob: thresholds.noSpeechProbAbove,
        avg_logprob: thresholds.avgLogprobBelow - 0.01,
        compression_ratio: 1.1,
      };
      const lowConfidence = {
        no_speech_prob: thresholds.noSpeechProbAbove + 0.01,
        avg_logprob: thresholds.avgLogprobBelow,
        compression_ratio: 1.1,
      };
      expect(shouldDropSegment(quiet, level)).toBe(false);
      expect(shouldDropSegment(lowConfidence, level)).toBe(false);
      expect(shouldDropSegment({
        ...SPEECH,
        compression_ratio: thresholds.compressionRatioAbove,
      }, level)).toBe(false);
    },
  );

  it.each(["low", "balanced", "high"] as const)(
    "keeps ordinary speech and emphatic repetition at %s",
    (level) => {
      expect(shouldDropSegment(SPEECH, level)).toBe(false);
      const emphaticRepetition = { text: "Amen, amen!", ...SPEECH };
      expect(shouldDropSegment(emphaticRepetition, level)).toBe(false);
    },
  );

  it("never drops at Off, even when every signal points to gibberish", () => {
    expect(shouldDropSegment({
      no_speech_prob: 1,
      avg_logprob: -10,
      compression_ratio: 100,
    }, "off")).toBe(false);
  });

  it("keeps missing, invalid, or out-of-range provider metrics", () => {
    const suspicious = { no_speech_prob: 0.99 };
    expect(shouldDropSegment(suspicious, "balanced")).toBe(false);
    expect(shouldDropSegment({
      no_speech_prob: Number.NaN,
      avg_logprob: -9,
      compression_ratio: Number.POSITIVE_INFINITY,
    }, "balanced")).toBe(false);
    expect(shouldDropSegment({
      no_speech_prob: 3,
      avg_logprob: -9,
      compression_ratio: -1,
    }, "balanced")).toBe(false);
  });

  it("never sets a compression threshold below 2.4", () => {
    const activeLevels: Exclude<SanitizeLevel, "off">[] = ["low", "balanced", "high"];
    expect(Math.min(...activeLevels.map((level) =>
      SANITIZE_GUARD_THRESHOLDS[level].compressionRatioAbove,
    ))).toBe(2.4);
  });
});
