import type { RecordingWindowPolicy } from "@/live/contracts";

export const DYNAMIC_SAMPLE_MS = 100;
export const DYNAMIC_ABS_SILENCE_RMS = 0.03;
export const DYNAMIC_SILENCE_RATIO = 0.2;
/** When the provider is busy, no option cuts before this floor for the rest of the session. */
export const BACKOFF_FLOOR_MS = 6_000;
export const SPEECH_PEAK_DECAY = 0.97;

export interface WindowPolicyState {
  elapsedMs: number;
  silenceMs: number;
  speechPeakRms: number;
}

export type WindowBounds = RecordingWindowPolicy;

export interface WindowDecision {
  decision: "continue" | "cut";
  state: WindowPolicyState;
}

export type DynamicDraftHold = "idle" | "pending" | "rejected";
export type DynamicPauseAction = "continue" | "run-draft" | "hold" | "cut";

const TERMINAL_PUNCTUATION = /[.!?…。？！]\s*["'”’»›)\]}】》」』〕〉〗〙〛]*$/u;

export function draftEndsWithTerminalPunctuation(text: string): boolean {
  return TERMINAL_PUNCTUATION.test(text.trimEnd());
}

/**
 * The silence a pause needs at this point in the window. Fixed options are constant;
 * Dynamic's patience decays linearly from its floor to its cap.
 */
export function requiredPauseMs(bounds: WindowBounds, elapsedMs: number): number {
  if (bounds.pauseAtCapMs === bounds.pauseMs || bounds.maxMs <= bounds.minMs) {
    return bounds.pauseMs;
  }
  const progress = Math.min(
    1,
    Math.max(0, (elapsedMs - bounds.minMs) / (bounds.maxMs - bounds.minMs)),
  );
  return Math.round(
    bounds.pauseMs + (bounds.pauseAtCapMs - bounds.pauseMs) * progress,
  );
}

/** Raise one wait-time option's floor for the rest of a session after a provider limit. */
export function withRaisedFloor(bounds: WindowBounds): WindowBounds {
  return {
    ...bounds,
    minMs: Math.max(bounds.minMs, BACKOFF_FLOOR_MS),
  };
}

export function isDynamicPauseCandidate(state: WindowPolicyState, bounds: WindowBounds): boolean {
  return (
    state.elapsedMs >= bounds.minMs &&
    state.elapsedMs < bounds.maxMs &&
    state.silenceMs >= requiredPauseMs(bounds, state.elapsedMs)
  );
}

/** Choose what to do when Dynamic's pause policy would cut the current window. */
export function dynamicPauseAction(
  decision: WindowDecision,
  bounds: WindowBounds,
  draftHold: DynamicDraftHold,
): DynamicPauseAction {
  if (decision.decision !== "cut") return "continue";
  if (decision.state.elapsedMs >= bounds.maxMs) return "cut";
  if (draftHold === "pending" || draftHold === "rejected") return "hold";
  if (isDynamicPauseCandidate(decision.state, bounds)) return "run-draft";
  return "cut";
}

/** Unavailable drafts retain pause-only behavior; unfinished drafts reject this silence run. */
export function dynamicDraftResult(available: boolean, endsWithTerminalPunctuation: boolean): "cut" | "hold" {
  return available && !endsWithTerminalPunctuation ? "hold" : "cut";
}

export function initialWindowPolicyState(): WindowPolicyState {
  return { elapsedMs: 0, silenceMs: 0, speechPeakRms: 0 };
}

export function nextWindowDecision(
  state: WindowPolicyState,
  sampleRms: number,
  bounds: WindowBounds,
): WindowDecision {
  const sample = Number.isFinite(sampleRms) ? Math.max(0, sampleRms) : 0;
  const speechPeakRms = Math.max(sample, state.speechPeakRms * SPEECH_PEAK_DECAY);
  const silenceThreshold = Math.max(
    DYNAMIC_ABS_SILENCE_RMS,
    DYNAMIC_SILENCE_RATIO * speechPeakRms,
  );
  const silenceMs = sample < silenceThreshold ? state.silenceMs + DYNAMIC_SAMPLE_MS : 0;
  const nextState = {
    elapsedMs: state.elapsedMs + DYNAMIC_SAMPLE_MS,
    silenceMs,
    speechPeakRms,
  };
  return {
    decision:
      nextState.elapsedMs >= bounds.maxMs ||
      (nextState.elapsedMs >= bounds.minMs &&
        silenceMs >= requiredPauseMs(bounds, nextState.elapsedMs))
        ? "cut"
        : "continue",
    state: nextState,
  };
}
