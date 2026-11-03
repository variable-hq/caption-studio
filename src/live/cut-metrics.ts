/**
 * Content-free counters for how recording windows end. They hold numbers only, live in the
 * controlling tab's memory, and are never stored, sent or logged.
 */

export const CUT_LENGTH_BIN_MS = 100;
export const CUT_LENGTH_MAX_MS = 14_000;
export const CUT_LENGTH_BINS = CUT_LENGTH_MAX_MS / CUT_LENGTH_BIN_MS + 1;

/**
 * `sentence`: a draft confirmed the pause. `pause`: a pause cut without a confirming draft.
 * `limit`: the window reached its cap.
 */
export type CutReason = "sentence" | "pause" | "limit";

export interface CutMetrics {
  sentence: number;
  pause: number;
  limit: number;
  /** Unfinished drafts held across the windows counted above. */
  heldDrafts: number;
  /** Window lengths in 100 ms bins from 0 to 14 s; the last bin also holds anything longer. */
  lengthBins: readonly number[];
}

export interface CutWindow {
  reason: CutReason;
  lengthMs: number;
  heldDrafts: number;
}

export function createCutMetrics(): CutMetrics {
  return {
    sentence: 0,
    pause: 0,
    limit: 0,
    heldDrafts: 0,
    lengthBins: new Array<number>(CUT_LENGTH_BINS).fill(0),
  };
}

function lengthBin(lengthMs: number): number {
  if (!Number.isFinite(lengthMs) || lengthMs <= 0) return 0;
  return Math.min(CUT_LENGTH_BINS - 1, Math.floor(lengthMs / CUT_LENGTH_BIN_MS));
}

/** Count one window that was sent for transcription. Returns a new value. */
export function recordCutWindow(metrics: CutMetrics, window: CutWindow): CutMetrics {
  const lengthBins = metrics.lengthBins.slice();
  lengthBins[lengthBin(window.lengthMs)] += 1;
  return {
    sentence: metrics.sentence + (window.reason === "sentence" ? 1 : 0),
    pause: metrics.pause + (window.reason === "pause" ? 1 : 0),
    limit: metrics.limit + (window.reason === "limit" ? 1 : 0),
    heldDrafts: metrics.heldDrafts + Math.max(0, Math.floor(window.heldDrafts)),
    lengthBins,
  };
}

export function countCutWindows(metrics: CutMetrics): number {
  return metrics.lengthBins.reduce((total, count) => total + count, 0);
}

/**
 * Nearest-rank percentile (`fraction` in 0 to 1) of window length, in milliseconds at the
 * start of its 100 ms bin; null before the first window.
 */
export function cutLengthPercentileMs(metrics: CutMetrics, fraction: number): number | null {
  const total = countCutWindows(metrics);
  if (total === 0) return null;
  const rank = Math.min(total, Math.max(1, Math.ceil(total * fraction)));
  let seen = 0;
  for (let bin = 0; bin < metrics.lengthBins.length; bin += 1) {
    seen += metrics.lengthBins[bin];
    if (seen >= rank) return bin * CUT_LENGTH_BIN_MS;
  }
  return null;
}
