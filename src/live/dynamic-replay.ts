import { recordingWindowBoundsMs } from "@/live/contracts";
import {
  DYNAMIC_SAMPLE_MS,
  type DynamicDraftHold,
  dynamicDraftResult,
  dynamicPauseAction,
  draftEndsWithTerminalPunctuation,
  initialWindowPolicyState,
  nextWindowDecision,
  type WindowBounds,
  type WindowPolicyState,
} from "@/live/window-policy";

/**
 * Offline replay of Dynamic's window policy over labelled synthetic levels. Imported only by
 * tests: it drives the real policy functions with a mock draft, and never calls a provider.
 */

export const REPLAY_SPEECH_RMS = 0.2;
export const REPLAY_SILENCE_RMS = 0.005;
const DEFAULT_DRAFT_LATENCY_MS = 800;

export type ReplayLabel = "speech" | "sentence" | "clause";
export type ReplayReason = "sentence" | "pause" | "limit";

export type ReplaySegment =
  | { kind: "speech"; ms: number; rms?: number }
  | { kind: "pause"; ms: number; label: "sentence" | "clause"; rms?: number };

export interface ReplayTrace {
  /** One RMS level per 100 ms sample. */
  readonly samples: readonly number[];
  /** Ground truth per sample: speech, or the pause that contains it. */
  readonly labels: readonly ReplayLabel[];
}

export interface ReplayOptions {
  /** Defaults to Dynamic's bounds. */
  bounds?: WindowBounds;
  /** Time from a candidate to its draft outcome. Defaults to 800 ms. */
  draftLatencyMs?: number;
  /** Share of mid-clause candidates whose draft ends with terminal punctuation. Defaults to 0. */
  falseConfirmRate?: number;
  /** Share of sentence-end candidates whose draft does not end with terminal punctuation. Defaults to 0. */
  missRate?: number;
}

export interface ReplayCut {
  /** Last sample in the window; the cut takes effect at (cutSample + 1) × 100 ms. */
  cutSample: number;
  timeMs: number;
  reason: ReplayReason;
  lengthMs: number;
  heldDrafts: number;
  /** Ground-truth label of the last sample in the window. */
  location: ReplayLabel;
}

export interface ReplayResult {
  cuts: ReplayCut[];
  /** One entry per labelled sentence end: ms from the end to the cut in its own pause; null if none. */
  sentenceLatencyMs: (number | null)[];
  /** Cuts that do not land in a sentence-end pause. */
  midSentenceFinals: number;
  heldDrafts: number;
  /** Transcription calls made for drafts that were available. */
  draftCalls: number;
  /** Transcription calls for windows sent without a confirming draft. */
  finalTranscriptions: number;
  /** One translation per window sent. */
  translationCalls: number;
  minutes: number;
}

interface ReplayWindow {
  start: number;
  policy: WindowPolicyState;
  draftHold: DynamicDraftHold;
  silenceRun: number;
  heldDrafts: number;
  draftsUsed: number;
  closed: boolean;
}

interface PendingOutcome {
  due: number;
  window: ReplayWindow;
  silenceRun: number;
  /** The mock draft's source text; null when no draft was available. */
  text: string | null;
}

export function buildReplayTrace(segments: readonly ReplaySegment[]): ReplayTrace {
  const samples: number[] = [];
  const labels: ReplayLabel[] = [];
  for (const segment of segments) {
    if (!Number.isInteger(segment.ms) || segment.ms <= 0 || segment.ms % DYNAMIC_SAMPLE_MS !== 0) {
      throw new RangeError("Replay segments must be positive multiples of 100 ms");
    }
    const count = segment.ms / DYNAMIC_SAMPLE_MS;
    const isPause = segment.kind === "pause";
    const rms = segment.rms ?? (isPause ? REPLAY_SILENCE_RMS : REPLAY_SPEECH_RMS);
    const label: ReplayLabel = segment.kind === "pause" ? segment.label : "speech";
    for (let index = 0; index < count; index += 1) {
      samples.push(rms);
      labels.push(label);
    }
  }
  return { samples, labels };
}

/** Deterministic error sequence: the i-th candidate (from 0) of a kind is wrong at the given rate. */
function isWrong(index: number, rate: number): boolean {
  return Math.floor((index + 1) * rate) > Math.floor(index * rate);
}

export function replayDynamic(trace: ReplayTrace, options: ReplayOptions = {}): ReplayResult {
  const bounds = options.bounds ?? recordingWindowBoundsMs("dynamic");
  const latencySamples = Math.round((options.draftLatencyMs ?? DEFAULT_DRAFT_LATENCY_MS) / DYNAMIC_SAMPLE_MS);
  const falseConfirmRate = options.falseConfirmRate ?? 0;
  const missRate = options.missRate ?? 0;
  const { samples, labels } = trace;

  const cuts: ReplayCut[] = [];
  const pending: PendingOutcome[] = [];
  let sentenceCandidates = 0;
  let clauseCandidates = 0;
  let draftCalls = 0;
  let heldDrafts = 0;
  let active = openWindow(0);

  function openWindow(start: number): ReplayWindow {
    return {
      start,
      policy: initialWindowPolicyState(),
      draftHold: "idle",
      silenceRun: 0,
      heldDrafts: 0,
      draftsUsed: 0,
      closed: false,
    };
  }

  function endWindow(current: ReplayWindow, lastSample: number, reason: ReplayReason) {
    current.closed = true;
    cuts.push({
      cutSample: lastSample,
      timeMs: (lastSample + 1) * DYNAMIC_SAMPLE_MS,
      reason,
      lengthMs: (lastSample - current.start + 1) * DYNAMIC_SAMPLE_MS,
      heldDrafts: current.heldDrafts,
      location: labels[lastSample] ?? "speech",
    });
    active = openWindow(lastSample + 1);
  }

  function applyOutcome(outcome: PendingOutcome, nextSample: number) {
    const current = outcome.window;
    if (current.closed || outcome.silenceRun !== current.silenceRun) return;
    const endsWithTerminal = outcome.text !== null && draftEndsWithTerminalPunctuation(outcome.text);
    const result = dynamicDraftResult(outcome.text !== null, endsWithTerminal);
    if (result === "hold") {
      current.draftHold = "rejected";
      current.heldDrafts += 1;
      heldDrafts += 1;
      return;
    }
    endWindow(current, nextSample - 1, outcome.text !== null ? "sentence" : "pause");
  }

  function startCandidate(current: ReplayWindow, sample: number) {
    const isSentence = labels[sample] === "sentence";
    current.draftHold = "pending";
    const silenceRun = current.silenceRun;
    if (current.draftsUsed > 0) {
      pending.push({ due: sample + 1, window: current, silenceRun, text: null });
      return;
    }
    current.draftsUsed += 1;
    draftCalls += 1;
    let text: string;
    if (isSentence) {
      const index = sentenceCandidates;
      sentenceCandidates += 1;
      text = isWrong(index, missRate) ? "synthetic clause" : "synthetic sentence.";
    } else {
      const index = clauseCandidates;
      clauseCandidates += 1;
      text = isWrong(index, falseConfirmRate) ? "synthetic sentence." : "synthetic clause";
    }
    pending.push({ due: sample + 1 + latencySamples, window: current, silenceRun, text });
  }

  function processSample(sample: number) {
    const current = active;
    const previousSilenceMs = current.policy.silenceMs;
    const result = nextWindowDecision(current.policy, samples[sample] ?? 0, bounds);
    if (previousSilenceMs > 0 && result.state.silenceMs === 0) {
      current.silenceRun += 1;
      current.draftHold = "idle";
    }
    current.policy = result.state;
    const action = dynamicPauseAction(result, bounds, current.draftHold);
    if (action === "continue" || action === "hold") return;
    if (action === "run-draft") {
      startCandidate(current, sample);
      return;
    }
    endWindow(current, sample, "limit");
  }

  for (let sample = 0; sample < samples.length; sample += 1) {
    for (let index = 0; index < pending.length; ) {
      const outcome = pending[index];
      if (outcome.due > sample) {
        index += 1;
        continue;
      }
      pending.splice(index, 1);
      applyOutcome(outcome, sample);
    }
    processSample(sample);
  }

  const sentenceLatencyMs = sentenceEndSamples(labels).map((start) => {
    const cut = cuts.find((candidate) =>
      candidate.location === "sentence" && sentenceRunStart(labels, candidate.cutSample) === start);
    return cut ? cut.timeMs - start * DYNAMIC_SAMPLE_MS : null;
  });
  const confirmed = cuts.filter((cut) => cut.reason === "sentence").length;
  return {
    cuts,
    sentenceLatencyMs,
    midSentenceFinals: cuts.filter((cut) => cut.location !== "sentence").length,
    heldDrafts,
    draftCalls,
    finalTranscriptions: cuts.length - confirmed,
    translationCalls: cuts.length,
    minutes: (samples.length * DYNAMIC_SAMPLE_MS) / 60_000,
  };
}

/** First sample of every sentence-end pause. */
export function sentenceEndSamples(labels: readonly ReplayLabel[]): number[] {
  const starts: number[] = [];
  labels.forEach((label, index) => {
    if (label === "sentence" && labels[index - 1] !== "sentence") starts.push(index);
  });
  return starts;
}

function sentenceRunStart(labels: readonly ReplayLabel[], sample: number): number {
  let start = sample;
  while (start > 0 && labels[start - 1] === "sentence") start -= 1;
  return start;
}

/** Calls per minute for a replay result, counting transcription and translation separately. */
export function callsPerMinute(result: ReplayResult): { transcription: number; translation: number } {
  return {
    transcription: (result.draftCalls + result.finalTranscriptions) / result.minutes,
    translation: result.translationCalls / result.minutes,
  };
}
