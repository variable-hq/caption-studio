import { describe, expect, it } from "vitest";

import {
  CUT_LENGTH_BINS,
  classifyCut,
  countCutWindows,
  createCutMetrics,
  cutLengthPercentileMs,
  recordCutWindow,
  recordQueuedCutWindow,
  type CutMetrics,
  type CutReason,
} from "@/live/cut-metrics";

function record(metrics: CutMetrics, reason: CutReason, lengthMs: number, heldDrafts = 0) {
  return recordCutWindow(metrics, { reason, lengthMs, heldDrafts });
}

describe("cut metrics", () => {
  it("starts empty with a fixed-size histogram", () => {
    const metrics = createCutMetrics();
    expect(metrics).toMatchObject({ sentence: 0, pause: 0, limit: 0, heldDrafts: 0 });
    expect(metrics.lengthBins).toHaveLength(141);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBeNull();
    expect(cutLengthPercentileMs(metrics, 0.9)).toBeNull();
  });

  it("counts each reason once per window and sums held drafts", () => {
    let metrics = createCutMetrics();
    metrics = record(metrics, "sentence", 5_200, 1);
    metrics = record(metrics, "pause", 7_900);
    metrics = record(metrics, "pause", 6_000, 2);
    metrics = record(metrics, "limit", 14_000);
    expect(metrics).toMatchObject({ sentence: 1, pause: 2, limit: 1, heldDrafts: 3 });
    expect(countCutWindows(metrics)).toBe(4);
  });

  it("does not mutate the previous value", () => {
    const before = createCutMetrics();
    const after = record(before, "limit", 14_000);
    expect(countCutWindows(before)).toBe(0);
    expect(before.limit).toBe(0);
    expect(after.limit).toBe(1);
  });

  it("reads the percentile at bin boundaries for one window", () => {
    const metrics = record(createCutMetrics(), "pause", 4_100);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(4_100);
    expect(cutLengthPercentileMs(metrics, 0.9)).toBe(4_100);
  });

  it("uses the nearest rank for odd and even counts", () => {
    const odd = [4_000, 6_000, 9_000].reduce((m, ms) => record(m, "pause", ms), createCutMetrics());
    expect(cutLengthPercentileMs(odd, 0.5)).toBe(6_000);
    expect(cutLengthPercentileMs(odd, 0.9)).toBe(9_000);
    const even = [4_000, 6_000, 8_000, 12_000].reduce((m, ms) => record(m, "pause", ms), createCutMetrics());
    expect(cutLengthPercentileMs(even, 0.5)).toBe(6_000);
    expect(cutLengthPercentileMs(even, 0.9)).toBe(12_000);
  });

  it("takes the 90th percentile from the tenth-longest of twenty", () => {
    let metrics = createCutMetrics();
    for (let index = 0; index < 18; index += 1) metrics = record(metrics, "pause", 5_000);
    metrics = record(metrics, "limit", 13_000);
    metrics = record(metrics, "limit", 14_000);
    expect(cutLengthPercentileMs(metrics, 0.9)).toBe(5_000);
    expect(cutLengthPercentileMs(metrics, 0.95)).toBe(13_000);
  });

  it("bins 0 ms, 99 ms and 14 s, and clamps longer or invalid lengths", () => {
    let metrics = record(createCutMetrics(), "pause", 0);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(0);
    metrics = record(createCutMetrics(), "pause", 99);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(0);
    metrics = record(createCutMetrics(), "limit", 14_000);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(14_000);
    metrics = record(createCutMetrics(), "limit", 20_000);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(14_000);
    metrics = record(createCutMetrics(), "pause", Number.NaN);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(0);
    metrics = record(createCutMetrics(), "pause", -5);
    expect(cutLengthPercentileMs(metrics, 0.5)).toBe(0);
  });

  it("keeps constant memory over many windows", () => {
    let metrics = createCutMetrics();
    for (let index = 0; index < 5_000; index += 1) metrics = record(metrics, "pause", 4_000 + (index % 100) * 100);
    expect(metrics.lengthBins).toHaveLength(CUT_LENGTH_BINS);
    expect(countCutWindows(metrics)).toBe(5_000);
  });

  it("ignores negative or fractional held-draft counts safely", () => {
    const metrics = recordCutWindow(createCutMetrics(), { reason: "pause", lengthMs: 5_000, heldDrafts: -3 });
    expect(metrics.heldDrafts).toBe(0);
  });
});

describe("cut classification", () => {
  it("calls a window that reached the cap a limit, even past it", () => {
    expect(classifyCut({ elapsedMs: 14_000, capMs: 14_000, confirmedByDraft: false })).toBe("limit");
    expect(classifyCut({ elapsedMs: 14_100, capMs: 14_000, confirmedByDraft: false })).toBe("limit");
  });

  it("calls a cut before the cap a pause", () => {
    expect(classifyCut({ elapsedMs: 13_900, capMs: 14_000, confirmedByDraft: false })).toBe("pause");
    expect(classifyCut({ elapsedMs: 6_000, capMs: 10_000, confirmedByDraft: false })).toBe("pause");
  });

  it("calls a cut confirmed by an available draft a sentence", () => {
    expect(classifyCut({ elapsedMs: 5_200, capMs: 14_000, confirmedByDraft: true })).toBe("sentence");
  });

  it("calls a qualifying pause without an available draft a pause", () => {
    expect(classifyCut({ elapsedMs: 5_200, capMs: 14_000, confirmedByDraft: false })).toBe("pause");
  });
});

describe("queued windows only", () => {
  const window = { reason: "pause", lengthMs: 5_000, heldDrafts: 1 } as const;

  it("counts a window that was queued", () => {
    const metrics = recordQueuedCutWindow(createCutMetrics(), window, true);
    expect(metrics).toMatchObject({ pause: 1, heldDrafts: 1 });
    expect(countCutWindows(metrics)).toBe(1);
  });

  it("leaves every counter and the histogram unchanged for a dropped window", () => {
    const before = record(createCutMetrics(), "sentence", 5_000);
    const after = recordQueuedCutWindow(before, window, false);
    expect(after).toBe(before);
    expect(countCutWindows(after)).toBe(1);
    expect(after.heldDrafts).toBe(0);
  });
});
