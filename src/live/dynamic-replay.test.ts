import { describe, expect, it } from "vitest";

import {
  buildReplayTrace,
  callsPerMinute,
  replayDynamic,
  sentenceEndSamples,
} from "@/live/dynamic-replay";

// Times below are worked from the policy: Dynamic's floor is 4 s, its cap 14 s, and its required
// pause falls from 700 ms to 200 ms across that span (about 900 ms − 0.05 × elapsed).

describe("Dynamic replay trace", () => {
  it("rejects segments that are not whole 100 ms samples", () => {
    expect(() => buildReplayTrace([{ kind: "speech", ms: 150 }])).toThrow(RangeError);
    expect(() => buildReplayTrace([{ kind: "speech", ms: 0 }])).toThrow(RangeError);
  });

  it("labels each sample with its pause and marks each sentence end once", () => {
    const trace = buildReplayTrace([
      { kind: "speech", ms: 200 },
      { kind: "pause", ms: 300, label: "sentence" },
      { kind: "pause", ms: 200, label: "clause" },
      { kind: "pause", ms: 100, label: "sentence" },
    ]);
    expect(trace.samples).toHaveLength(8);
    expect(trace.labels.join(",")).toBe("speech,speech,sentence,sentence,sentence,clause,clause,sentence");
    expect(sentenceEndSamples(trace.labels)).toEqual([2, 7]);
  });
});

describe("Dynamic replay reproduces today's cuts", () => {
  it("cuts mid-clause at a second hesitation after the first draft went stale", () => {
    const trace = buildReplayTrace([
      { kind: "speech", ms: 3000 },
      { kind: "pause", ms: 500, label: "sentence" },
      { kind: "speech", ms: 2000 },
      { kind: "pause", ms: 800, label: "clause" },
      { kind: "speech", ms: 1000 },
      { kind: "pause", ms: 800, label: "clause" },
      { kind: "speech", ms: 1500 },
      { kind: "pause", ms: 600, label: "sentence" },
      { kind: "speech", ms: 1000 },
    ]);
    const result = replayDynamic(trace);
    // The first hesitation's draft returns after speech resumed, so it is ignored. The second
    // hesitation has no draft left in this window and cuts on the pause alone at 7.9 s.
    expect(result.cuts).toEqual([
      { cutSample: 78, timeMs: 7_900, reason: "pause", lengthMs: 7_900, heldDrafts: 0, location: "clause" },
    ]);
    expect(result.sentenceLatencyMs).toEqual([null, null]);
    expect(result.midSentenceFinals).toBe(1);
    expect(result.draftCalls).toBe(1);
    expect(result.finalTranscriptions).toBe(1);
    expect(result.translationCalls).toBe(1);
  });

  it("holds an unfinished clause and cuts the next sentence end on pause alone", () => {
    const trace = buildReplayTrace([
      { kind: "speech", ms: 4500 },
      { kind: "pause", ms: 2000, label: "clause" },
      { kind: "speech", ms: 1500 },
      { kind: "pause", ms: 500, label: "sentence" },
      { kind: "speech", ms: 1000 },
    ]);
    const result = replayDynamic(trace);
    // The draft at 5.2 s is held (no terminal punctuation) and the window keeps waiting. Its one
    // draft is spent, so the sentence end at 8.0 s cuts at 8.5 s with no draft.
    expect(result.cuts).toEqual([
      { cutSample: 84, timeMs: 8_500, reason: "pause", lengthMs: 8_500, heldDrafts: 1, location: "sentence" },
    ]);
    expect(result.sentenceLatencyMs).toEqual([500]);
    expect(result.heldDrafts).toBe(1);
    expect(result.midSentenceFinals).toBe(0);
    expect(result.draftCalls).toBe(1);
  });

  it("confirms a sentence end on its draft once the pause outlasts the draft", () => {
    const trace = buildReplayTrace([
      { kind: "speech", ms: 3000 },
      { kind: "pause", ms: 2000, label: "sentence" },
      { kind: "speech", ms: 1000 },
    ]);
    const result = replayDynamic(trace);
    expect(result.cuts).toEqual([
      { cutSample: 47, timeMs: 4_800, reason: "sentence", lengthMs: 4_800, heldDrafts: 0, location: "sentence" },
    ]);
    expect(result.sentenceLatencyMs).toEqual([1_800]);
    expect(result.finalTranscriptions).toBe(0);
    expect(result.translationCalls).toBe(1);
  });
});

describe("Dynamic replay error model", () => {
  it("turns a false confirmation at a hesitation into a mid-clause final", () => {
    const trace = buildReplayTrace([
      { kind: "speech", ms: 4500 },
      { kind: "pause", ms: 2000, label: "clause" },
      { kind: "speech", ms: 1500 },
      { kind: "pause", ms: 500, label: "sentence" },
      { kind: "speech", ms: 1000 },
    ]);
    const result = replayDynamic(trace, { falseConfirmRate: 1 });
    expect(result.cuts).toEqual([
      { cutSample: 59, timeMs: 6_000, reason: "sentence", lengthMs: 6_000, heldDrafts: 0, location: "clause" },
    ]);
    expect(result.midSentenceFinals).toBe(1);
    expect(result.sentenceLatencyMs).toEqual([null]);
    expect(result.finalTranscriptions).toBe(0);
  });

  it("holds a missed sentence end, so the window waits for its cap", () => {
    const trace = buildReplayTrace([
      { kind: "speech", ms: 3000 },
      { kind: "pause", ms: 2000, label: "sentence" },
      { kind: "speech", ms: 1000 },
    ]);
    const result = replayDynamic(trace, { missRate: 1 });
    expect(result.cuts).toEqual([]);
    expect(result.heldDrafts).toBe(1);
    expect(result.sentenceLatencyMs).toEqual([null]);
    expect(callsPerMinute(result).translation).toBe(0);
  });
});
