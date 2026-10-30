import { describe, expect, it } from "vitest";

import {
  DYNAMIC_ABS_SILENCE_RMS,
  DYNAMIC_PAUSE_MS,
  DYNAMIC_SAMPLE_MS,
  dynamicDraftResult,
  dynamicPauseAction,
  draftEndsWithTerminalPunctuation,
  initialWindowPolicyState,
  isDynamicPauseCandidate,
  nextWindowDecision,
} from "@/live/window-policy";

const BOUNDS = { minMs: 6_000, maxMs: 14_000 };

function advance(state: ReturnType<typeof initialWindowPolicyState>, sample: number, count: number) {
  let current = state;
  let decision: "continue" | "cut" = "continue";
  for (let index = 0; index < count; index += 1) {
    const next = nextWindowDecision(current, sample, BOUNDS);
    current = next.state;
    decision = next.decision;
    if (decision === "cut") break;
  }
  return { state: current, decision };
}

describe("dynamic recording window policy", () => {
  it("recognizes terminal punctuation followed by closing quotes or brackets", () => {
    for (const text of ["Done.", "Done? ”", "Done!】", "完了。』", "完了？】", "Done…)"]) {
      expect(draftEndsWithTerminalPunctuation(text)).toBe(true);
    }
    for (const text of ["An unfinished clause", "Done,", "", "Done. then more"]) {
      expect(draftEndsWithTerminalPunctuation(text)).toBe(false);
    }
  });

  it("marks only the first qualifying pause before the hard limit as a draft candidate", () => {
    const candidate = { elapsedMs: 6_200, silenceMs: DYNAMIC_PAUSE_MS, speechPeakRms: 0.2 };
    expect(isDynamicPauseCandidate(candidate, BOUNDS)).toBe(true);
    expect(isDynamicPauseCandidate({ ...candidate, silenceMs: DYNAMIC_PAUSE_MS + DYNAMIC_SAMPLE_MS }, BOUNDS)).toBe(false);
    expect(isDynamicPauseCandidate({ ...candidate, elapsedMs: BOUNDS.maxMs }, BOUNDS)).toBe(false);
  });

  it("holds a sustained pause after an unfinished draft until speech resumes or the hard limit", () => {
    let draftHold: "idle" | "pending" | "rejected" = "idle";
    const candidate = {
      decision: "cut" as const,
      state: { elapsedMs: 6_200, silenceMs: DYNAMIC_PAUSE_MS, speechPeakRms: 0.2 },
    };

    expect(dynamicPauseAction(candidate, BOUNDS, draftHold)).toBe("run-draft");
    draftHold = "pending";
    expect(dynamicPauseAction({ ...candidate, state: { ...candidate.state, silenceMs: 800 } }, BOUNDS, draftHold)).toBe("hold");
    expect(dynamicDraftResult(true, false)).toBe("hold");
    draftHold = "rejected";
    for (const elapsedMs of [6_400, 8_000, 13_900]) {
      expect(dynamicPauseAction({
        decision: "cut",
        state: { elapsedMs, silenceMs: elapsedMs - 5_500, speechPeakRms: 0.2 },
      }, BOUNDS, draftHold)).toBe("hold");
    }

    // Speech resets this silence run. If the old request is still in flight at the
    // next candidate, admission is unavailable and the pause-only fallback cuts.
    draftHold = "idle";
    expect(dynamicPauseAction(candidate, BOUNDS, draftHold)).toBe("run-draft");
    expect(dynamicDraftResult(false, false)).toBe("cut");

    // An admitted terminal draft confirms its candidate immediately.
    draftHold = "idle";
    expect(dynamicPauseAction(candidate, BOUNDS, draftHold)).toBe("run-draft");
    expect(dynamicDraftResult(true, true)).toBe("cut");

    // The 14s cap always wins, even while a draft is pending.
    expect(dynamicPauseAction({
      decision: "cut",
      state: { elapsedMs: BOUNDS.maxMs, silenceMs: 8_500, speechPeakRms: 0.2 },
    }, BOUNDS, "pending")).toBe("cut");
  });

  it("does not cut continuous speech before the six-second minimum", () => {
    const result = advance(initialWindowPolicyState(), 0.2, 59);
    expect(result.state.elapsedMs).toBe(5_900);
    expect(result.decision).toBe("continue");
  });

  it("cuts at the first 700ms pause after the six-second minimum", () => {
    const state = advance(initialWindowPolicyState(), 0.2, 55).state;
    const result = advance(state, 0, DYNAMIC_PAUSE_MS / DYNAMIC_SAMPLE_MS);
    expect(result.decision).toBe("cut");
    expect(result.state.elapsedMs).toBe(6_200);
    expect(result.state.silenceMs).toBe(DYNAMIC_PAUSE_MS);
  });

  it("forces a cut at 14 seconds during continuous speech", () => {
    const result = advance(initialWindowPolicyState(), 0.2, 140);
    expect(result.decision).toBe("cut");
    expect(result.state.elapsedMs).toBe(14_000);
  });

  it("ignores pauses shorter than 700ms", () => {
    let state = advance(initialWindowPolicyState(), 0.2, 55).state;
    state = advance(state, 0, 5).state;
    const resumed = nextWindowDecision(state, 0.2, BOUNDS);
    expect(resumed.decision).toBe("continue");
    expect(resumed.state.silenceMs).toBe(0);
  });

  it("adapts the speech peak for quiet speakers before interpreting silence", () => {
    let state = initialWindowPolicyState();
    state = advance(state, 1, 1).state;
    const quiet = advance(state, 0.1, 120);
    expect(quiet.state.speechPeakRms).toBeCloseTo(0.1, 1);
    expect(quiet.state.silenceMs).toBe(0);
    const silent = nextWindowDecision(quiet.state, DYNAMIC_ABS_SILENCE_RMS / 2, BOUNDS);
    expect(silent.state.silenceMs).toBe(DYNAMIC_SAMPLE_MS);
  });

  it("starts each new recording window with clean policy state", () => {
    const state = advance(initialWindowPolicyState(), 0, 7).state;
    expect(state.silenceMs).toBe(DYNAMIC_PAUSE_MS);
    expect(initialWindowPolicyState()).toEqual({ elapsedMs: 0, silenceMs: 0, speechPeakRms: 0 });
  });
});
