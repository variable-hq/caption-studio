import { describe, expect, it } from "vitest";

import type { PublicCaptionRequest } from "@/live/contracts";
import {
  EMPTY_OUTPUT_BUFFER_QUEUE,
  OUTPUT_BUFFER_DWELL_MS,
  applyReviewResults,
  beginEdit,
  beginReview,
  cancelEdit,
  clearEntry,
  enqueueTranslation,
  endReview,
  fastForwardEntry,
  isOutputBufferEntryPaused,
  normalizeOutputBufferCount,
  outputBufferCapacity,
  setManualPause,
  submitEdit,
  tick,
  updateEditDraft,
  type NewOutputBufferEntry,
} from "@/live/output-buffer";

const REQUEST: PublicCaptionRequest = {
  publicText: "",
  targetLanguage: "en",
  style: {
    fontSize: 48,
    textColor: "#ffffff",
    backgroundColor: "#101827",
    backgroundTransparency: 0,
    horizontalMarginPercent: 4,
    verticalMarginPercent: 6,
    horizontalAlign: "center",
    verticalAlign: "bottom",
    fontFamily: "sans-serif",
  },
  translationRevision: 1,
};

function candidate(id: string, publicText: string): NewOutputBufferEntry {
  return {
    id,
    sourceText: `source ${id}`,
    targetLanguage: "en",
    publicText,
    request: { ...REQUEST, publicText },
  };
}

describe("normalizeOutputBufferCount / outputBufferCapacity", () => {
  it("is a strict on/off setting that falls back to off", () => {
    expect(normalizeOutputBufferCount(1)).toBe(1);
    expect(normalizeOutputBufferCount(0)).toBe(0);
    expect(normalizeOutputBufferCount(2)).toBe(0);
    expect(normalizeOutputBufferCount("nope")).toBe(0);
  });

  it("maps on/off to the engine's real queue depth", () => {
    expect(outputBufferCapacity(0)).toBe(0);
    expect(outputBufferCapacity(1)).toBeGreaterThan(1);
  });
});

describe("enqueueTranslation", () => {
  it("always drops when capacity is zero or negative, even on an empty queue", () => {
    const outcome = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 0, candidate("a", "Hi"), 0);
    expect(outcome.dropped).toBe(true);
    expect(outcome.queue).toEqual(EMPTY_OUTPUT_BUFFER_QUEUE);
  });

  it("admits entries up to capacity with a flat dwell time", () => {
    const { queue, publishNow, dropped } = enqueueTranslation(
      EMPTY_OUTPUT_BUFFER_QUEUE,
      4,
      candidate("a", "Hello"),
      1_000,
    );
    expect(dropped).toBe(false);
    expect(publishNow).toEqual([]);
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].dueAt).toBe(1_000 + OUTPUT_BUFFER_DWELL_MS);
  });

  it("force-advances the front entry to make room when the queue is full", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    const outcome = enqueueTranslation(queue, 1, candidate("b", "There"), 100);
    expect(outcome.dropped).toBe(false);
    expect(outcome.publishNow.map((entry) => entry.id)).toEqual(["a"]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("drops the incoming translation (leakage) when the queue is full and the front is paused", () => {
    const queued = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    const paused = setManualPause(queued, "a", true, 50);
    const outcome = enqueueTranslation(paused, 1, candidate("b", "There"), 100);
    expect(outcome.dropped).toBe(true);
    expect(outcome.publishNow).toEqual([]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("drains down to a newly-shrunk capacity in one call instead of getting stuck above it", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, candidate("b", "There"), 0).queue;
    expect(queue.entries).toHaveLength(2);

    // Capacity drops to 1; the next translation must not merely swap 1-for-1 and stay
    // stuck at length 2 forever.
    const outcome = enqueueTranslation(queue, 1, candidate("c", "Amen"), 1_000);
    expect(outcome.dropped).toBe(false);
    expect(outcome.publishNow.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("stops draining for a shrunk capacity at a paused entry, and still drops the candidate if that leaves no room", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, candidate("b", "There"), 0).queue;
    queue = setManualPause(queue, "a", true, 50);

    const outcome = enqueueTranslation(queue, 1, candidate("c", "Amen"), 1_000);
    expect(outcome.dropped).toBe(true);
    expect(outcome.publishNow).toEqual([]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("gives a paused front real headroom before a full backing capacity starts dropping arrivals", () => {
    const capacity = outputBufferCapacity(1);
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, capacity, candidate("a", "Hi"), 0).queue;
    queue = setManualPause(queue, "a", true, 10);
    for (let i = 1; i < capacity; i += 1) {
      const outcome = enqueueTranslation(queue, capacity, candidate(`n${i}`, `n${i}`), 10 + i);
      expect(outcome.dropped).toBe(false);
      queue = outcome.queue;
    }
    // Now at capacity with the front still paused: the next arrival leaks.
    expect(enqueueTranslation(queue, capacity, candidate("overflow", "overflow"), 999).dropped).toBe(true);
  });

  it("holds each caption for exactly the fixed dwell under sustained arrivals, with no growing lag", () => {
    const capacity = outputBufferCapacity(1);
    const arrivalIntervalMs = 6_000; // the fastest recording window
    let queue = EMPTY_OUTPUT_BUFFER_QUEUE;
    const lags: number[] = [];

    for (let i = 0; i < 20; i += 1) {
      const arrivedAt = i * arrivalIntervalMs;
      queue = enqueueTranslation(queue, capacity, candidate(`c${i}`, `c${i}`), arrivedAt).queue;
      for (let t = arrivedAt; t < arrivedAt + arrivalIntervalMs; t += 200) {
        const result = tick(queue, t);
        queue = result.queue;
        if (result.publish) lags.push(t - arrivedAt);
      }
    }

    // The queue never backs up, because arrivals are far slower than the dwell.
    expect(queue.entries.length).toBeLessThanOrEqual(1);
    // Every one of the 20 captions published at (arrival + dwell), not later and later.
    expect(lags).toHaveLength(20);
    for (const lag of lags) {
      expect(lag).toBeGreaterThanOrEqual(OUTPUT_BUFFER_DWELL_MS);
      expect(lag).toBeLessThan(OUTPUT_BUFFER_DWELL_MS + 200); // tick granularity slack
    }
  });
});

describe("tick", () => {
  it("publishes the front entry once its dwell time elapses", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    expect(tick(queue, OUTPUT_BUFFER_DWELL_MS - 1).publish).toBeNull();
    const due = tick(queue, OUTPUT_BUFFER_DWELL_MS);
    expect(due.publish?.id).toBe("a");
    expect(due.queue.entries).toEqual([]);
  });

  it("never advances a paused front entry", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    const paused = setManualPause(queue, "a", true, 10);
    expect(tick(paused, 10_000).publish).toBeNull();
  });
});

describe("pause and resume", () => {
  it("freezes and restores the remaining dwell time", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    const paused = setManualPause(queue, "a", true, OUTPUT_BUFFER_DWELL_MS - 500);
    expect(isOutputBufferEntryPaused(paused.entries[0])).toBe(true);
    expect(paused.entries[0].dueAt).toBeNull();
    expect(paused.entries[0].remainingMs).toBe(500);
    const resumed = setManualPause(paused, "a", false, 10_000);
    expect(isOutputBufferEntryPaused(resumed.entries[0])).toBe(false);
    expect(resumed.entries[0].dueAt).toBe(10_500);
  });
});

describe("edit lifecycle", () => {
  it("auto-pauses only once the edited entry reaches the front, and auto-resumes on submit", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, candidate("b", "There"), 0).queue;

    queue = beginEdit(queue, "b", 100);
    expect(isOutputBufferEntryPaused(queue.entries[1])).toBe(false);

    const advanced = tick(queue, OUTPUT_BUFFER_DWELL_MS);
    expect(advanced.publish?.id).toBe("a");
    queue = advanced.queue;
    expect(queue.entries[0].id).toBe("b");
    expect(queue.entries[0].editing).toBe(true);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(true);

    expect(tick(queue, 100_000).publish).toBeNull();

    queue = updateEditDraft(queue, "b", "Corrected");
    queue = submitEdit(queue, "b", "Corrected", 5_000);
    expect(queue.entries[0].publicText).toBe("Corrected");
    expect(queue.entries[0].editing).toBe(false);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(false);
  });

  it("cancelling an edit discards the draft and releases any auto-pause", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    queue = beginEdit(queue, "a", 100);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(true);
    queue = cancelEdit(queue, "a", 500);
    expect(queue.entries[0].publicText).toBe("Hi");
    expect(queue.entries[0].editing).toBe(false);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(false);
  });

  it("never changes publicText from an unsubmitted draft, so a flush publishes only committed text", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    queue = beginEdit(queue, "a", 100);
    queue = updateEditDraft(queue, "a", "an unsaved correction");
    expect(queue.entries[0].editedDraft).toBe("an unsaved correction");
    expect(queue.entries[0].publicText).toBe("Hi");
  });
});

describe("clear and fast-forward", () => {
  it("removes a cleared entry without disturbing the others", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, candidate("b", "There"), 0).queue;
    queue = clearEntry(queue, "a", 100);
    expect(queue.entries.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("fast-forwards a non-front entry immediately, ahead of its position", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, candidate("b", "There"), 0).queue;
    const outcome = fastForwardEntry(queue, "b", 100);
    expect(outcome.publish?.id).toBe("b");
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("beta review", () => {
  it("pauses the whole queue during review and restores independent pause state afterward", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, candidate("b", "There"), 0).queue;
    queue = setManualPause(queue, "a", true, 50);

    queue = beginReview(queue, 100);
    expect(queue.entries.every(isOutputBufferEntryPaused)).toBe(true);

    const requestedFrom = new Map([["a", "Hi"], ["b", "There"]]);
    queue = applyReviewResults(queue, new Map([["a", "Hi (revised)"], ["b", "There (revised)"]]), requestedFrom);
    expect(queue.entries[0].publicText).toBe("Hi (revised)");
    expect(queue.entries[0].revisedByModel).toBe(true);

    queue = endReview(queue, 5_000);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(true);
    expect(queue.entries[0].manuallyPaused).toBe(true);
    expect(isOutputBufferEntryPaused(queue.entries[1])).toBe(false);
  });

  it("never overwrites an entry the operator is actively hand-editing", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    queue = beginEdit(queue, "a", 10);
    queue = applyReviewResults(queue, new Map([["a", "Model revision"]]), new Map([["a", "Hi"]]));
    expect(queue.entries[0].publicText).toBe("Hi");
    expect(queue.entries[0].revisedByModel).toBe(false);
  });

  it("never applies a stale revision if the entry was edited and submitted while the review was in flight", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, candidate("a", "Hi"), 0).queue;
    const requestedFrom = new Map([["a", "Hi"]]); // snapshot taken when the review started
    queue = beginReview(queue, 100);

    // The operator edits and submits a correction while the model call is still pending.
    queue = beginEdit(queue, "a", 200);
    queue = updateEditDraft(queue, "a", "Grace");
    queue = submitEdit(queue, "a", "Grace", 300);
    expect(queue.entries[0].publicText).toBe("Grace");

    // The response finally arrives, carrying a revision computed from the old "Hi" text.
    queue = applyReviewResults(queue, new Map([["a", "Hi (revised)"]]), requestedFrom);
    expect(queue.entries[0].publicText).toBe("Grace");
    expect(queue.entries[0].revisedByModel).toBe(false);
  });
});
