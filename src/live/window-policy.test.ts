import { describe, expect, it } from "vitest";

import {
  RECORDING_WINDOW_POLICIES,
  recordingWindowBoundsMs,
} from "@/live/contracts";
import {
  BACKOFF_FLOOR_MS,
  DYNAMIC_ABS_SILENCE_RMS,
  DYNAMIC_SAMPLE_MS,
  dynamicDraftResult,
  dynamicPauseAction,
  draftEndsWithTerminalPunctuation,
  initialWindowPolicyState,
  isDynamicPauseCandidate,
  nextWindowDecision,
  requiredPauseMs,
  withRaisedFloor,
} from "@/live/window-policy";

const DYNAMIC = recordingWindowBoundsMs("dynamic");

function advance(state: ReturnType<typeof initialWindowPolicyState>, sample: number, count: number, bounds = DYNAMIC) {
  let current = state;
  let decision: "continue" | "cut" = "continue";
  for (let index = 0; index < count; index += 1) {
    const next = nextWindowDecision(current, sample, bounds);
    current = next.state;
    decision = next.decision;
    if (decision === "cut") break;
  }
  return { state: current, decision };
}

describe("caption wait-time policy", () => {
  it("gives every option a cap, a floor and a required pause", () => {
    expect(recordingWindowBoundsMs(6_000)).toEqual({
      minMs: 3_000,
      maxMs: 6_000,
      pauseMs: 500,
      pauseAtCapMs: 500,
    });
    expect(recordingWindowBoundsMs(10_000)).toEqual({
      minMs: 5_000,
      maxMs: 10_000,
      pauseMs: 700,
      pauseAtCapMs: 700,
    });
    expect(recordingWindowBoundsMs(14_000)).toEqual({
      minMs: 7_000,
      maxMs: 14_000,
      pauseMs: 900,
      pauseAtCapMs: 900,
    });
    expect(recordingWindowBoundsMs("dynamic")).toEqual({
      minMs: 4_000,
      maxMs: 14_000,
      pauseMs: 700,
      pauseAtCapMs: 200,
    });
    expect(RECORDING_WINDOW_POLICIES.dynamic.maxMs).toBe(14_000);
  });

  it("never cuts before an option's floor, even during a long silence", () => {
    for (const setting of [6_000, 10_000, 14_000, "dynamic"] as const) {
      const bounds = recordingWindowBoundsMs(setting);
      const ticks = bounds.minMs / DYNAMIC_SAMPLE_MS - 1;
      expect(advance(initialWindowPolicyState(), 0, ticks, bounds).decision, String(setting)).toBe("continue");
    }
  });

  it("cuts a numbered option at its constant pause once the floor has passed", () => {
    const bounds = recordingWindowBoundsMs(6_000);
    const atFloor = advance(initialWindowPolicyState(), 0.2, bounds.minMs / DYNAMIC_SAMPLE_MS, bounds).state;
    const result = advance(atFloor, 0, bounds.pauseMs / DYNAMIC_SAMPLE_MS, bounds);
    expect(result.decision).toBe("cut");
    expect(result.state.elapsedMs).toBe(bounds.minMs + bounds.pauseMs);
  });

  it("always cuts at the cap during continuous speech", () => {
    for (const setting of [6_000, 10_000, 14_000, "dynamic"] as const) {
      const bounds = recordingWindowBoundsMs(setting);
      const result = advance(initialWindowPolicyState(), 0.2, bounds.maxMs / DYNAMIC_SAMPLE_MS, bounds);
      expect(result.decision, String(setting)).toBe("cut");
      expect(result.state.elapsedMs, String(setting)).toBe(bounds.maxMs);
    }
  });

  it("keeps the numbered options' pause constant and decays Dynamic's", () => {
    for (const [setting, pause] of [[6_000, 500], [10_000, 700], [14_000, 900]] as const) {
      const bounds = recordingWindowBoundsMs(setting);
      expect(requiredPauseMs(bounds, bounds.minMs)).toBe(pause);
      expect(requiredPauseMs(bounds, bounds.maxMs)).toBe(pause);
    }
    expect(requiredPauseMs(DYNAMIC, DYNAMIC.minMs)).toBe(700);
    expect(requiredPauseMs(DYNAMIC, DYNAMIC.maxMs)).toBe(200);
    let previous = Number.POSITIVE_INFINITY;
    for (let elapsedMs = DYNAMIC.minMs; elapsedMs <= DYNAMIC.maxMs; elapsedMs += 250) {
      const required = requiredPauseMs(DYNAMIC, elapsedMs);
      expect(required).toBeLessThanOrEqual(previous);
      expect(required).toBeGreaterThanOrEqual(200);
      previous = required;
    }
  });

  it("cuts Dynamic at a pause after its floor and before its cap", () => {
    const atFloor = advance(initialWindowPolicyState(), 0.2, DYNAMIC.minMs / DYNAMIC_SAMPLE_MS).state;
    const result = advance(atFloor, 0, 20);
    expect(result.decision).toBe("cut");
    expect(result.state.elapsedMs).toBeLessThan(DYNAMIC.maxMs);
    expect(result.state.elapsedMs).toBeGreaterThan(DYNAMIC.minMs);
  });

  it("marks a pause candidate only between the floor and the cap", () => {
    const required = requiredPauseMs(DYNAMIC, 6_200);
    const candidate = { elapsedMs: 6_200, silenceMs: required, speechPeakRms: 0.2 };
    expect(isDynamicPauseCandidate(candidate, DYNAMIC)).toBe(true);
    expect(isDynamicPauseCandidate({ ...candidate, elapsedMs: DYNAMIC.minMs - 100 }, DYNAMIC)).toBe(false);
    expect(isDynamicPauseCandidate({ ...candidate, elapsedMs: DYNAMIC.maxMs }, DYNAMIC)).toBe(false);
    expect(isDynamicPauseCandidate({ ...candidate, silenceMs: required - DYNAMIC_SAMPLE_MS }, DYNAMIC)).toBe(false);
  });

  it("raises every floor to six seconds after a limit and never lowers one", () => {
    const raised = [6_000, 10_000, 14_000, "dynamic"].map((setting) =>
      withRaisedFloor(recordingWindowBoundsMs(setting as keyof typeof RECORDING_WINDOW_POLICIES)),
    );
    expect(raised.map(({ minMs }) => minMs)).toEqual([6_000, 6_000, 7_000, 6_000]);
    expect(raised.every(({ minMs }) => minMs >= BACKOFF_FLOOR_MS)).toBe(true);
    expect(withRaisedFloor(recordingWindowBoundsMs("dynamic")).maxMs).toBe(14_000);
  });

  it("recognizes terminal punctuation followed by closing quotes or brackets", () => {
    for (const text of ["Done.", "Done? ”", "Done!】", "完了。』", "完了？】", "Done…)"]) {
      expect(draftEndsWithTerminalPunctuation(text)).toBe(true);
    }
    for (const text of ["An unfinished clause", "Done,", "", "Done. then more"]) {
      expect(draftEndsWithTerminalPunctuation(text)).toBe(false);
    }
  });

  it("holds a sustained pause after an unfinished draft until speech resumes or the cap", () => {
    let draftHold: "idle" | "pending" | "rejected" = "idle";
    const candidate = {
      decision: "cut" as const,
      state: { elapsedMs: 6_200, silenceMs: requiredPauseMs(DYNAMIC, 6_200), speechPeakRms: 0.2 },
    };

    expect(dynamicPauseAction(candidate, DYNAMIC, draftHold)).toBe("run-draft");
    draftHold = "pending";
    expect(dynamicPauseAction({ ...candidate, state: { ...candidate.state, silenceMs: 800 } }, DYNAMIC, draftHold)).toBe("hold");
    expect(dynamicDraftResult(true, false)).toBe("hold");
    draftHold = "rejected";
    for (const elapsedMs of [6_400, 8_000, 13_900]) {
      expect(dynamicPauseAction({
        decision: "cut",
        state: { elapsedMs, silenceMs: elapsedMs - 5_500, speechPeakRms: 0.2 },
      }, DYNAMIC, draftHold)).toBe("hold");
    }

    // Speech resets this silence run. If the old request is still in flight at the
    // next candidate, admission is unavailable and the pause-only fallback cuts.
    draftHold = "idle";
    expect(dynamicPauseAction(candidate, DYNAMIC, draftHold)).toBe("run-draft");
    expect(dynamicDraftResult(false, false)).toBe("cut");

    // An admitted terminal draft confirms its candidate immediately.
    draftHold = "idle";
    expect(dynamicPauseAction(candidate, DYNAMIC, draftHold)).toBe("run-draft");
    expect(dynamicDraftResult(true, true)).toBe("cut");

    // The 14s cap always wins, even while a draft is pending.
    expect(dynamicPauseAction({
      decision: "cut",
      state: { elapsedMs: DYNAMIC.maxMs, silenceMs: 8_500, speechPeakRms: 0.2 },
    }, DYNAMIC, "pending")).toBe("cut");
  });

  it("ignores pauses shorter than the required pause", () => {
    const atFloor = advance(initialWindowPolicyState(), 0.2, DYNAMIC.minMs / DYNAMIC_SAMPLE_MS).state;
    const shortPause = advance(atFloor, 0, 5).state;
    const resumed = nextWindowDecision(shortPause, 0.2, DYNAMIC);
    expect(resumed.decision).toBe("continue");
    expect(resumed.state.silenceMs).toBe(0);
  });

  it("adapts the speech peak for quiet speakers before interpreting silence", () => {
    let state = initialWindowPolicyState();
    state = advance(state, 1, 1).state;
    const quiet = advance(state, 0.1, 120);
    expect(quiet.state.speechPeakRms).toBeCloseTo(0.1, 1);
    expect(quiet.state.silenceMs).toBe(0);
    const silent = nextWindowDecision(quiet.state, DYNAMIC_ABS_SILENCE_RMS / 2, DYNAMIC);
    expect(silent.state.silenceMs).toBe(DYNAMIC_SAMPLE_MS);
  });

  it("starts each new recording window with clean policy state", () => {
    const state = advance(initialWindowPolicyState(), 0, 7).state;
    expect(state.silenceMs).toBe(700);
    expect(initialWindowPolicyState()).toEqual({ elapsedMs: 0, silenceMs: 0, speechPeakRms: 0 });
  });
});
