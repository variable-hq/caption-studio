import { describe, expect, it } from "vitest";

import type { PublicCaptionRequest } from "@/live/contracts";
import {
  EMPTY_OUTPUT_BUFFER_QUEUE,
  OUTPUT_BUFFER_STEADY_STATE_DELAY_MS,
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
  normalizeOutputBufferDelay,
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

describe("normalizeOutputBufferCount / normalizeOutputBufferDelay", () => {
  it("falls back to the documented defaults for anything outside the bounded set", () => {
    expect(normalizeOutputBufferCount(1)).toBe(1);
    expect(normalizeOutputBufferCount(2)).toBe(2);
    expect(normalizeOutputBufferCount(3)).toBe(1);
    expect(normalizeOutputBufferCount("nope")).toBe(1);
    expect(normalizeOutputBufferDelay("auto")).toBe("auto");
    expect(normalizeOutputBufferDelay(4_000)).toBe(4_000);
    expect(normalizeOutputBufferDelay(5_000)).toBe("auto");
  });
});

describe("enqueueTranslation", () => {
  it("gives the first item into a fresh queue the configured delay", () => {
    const { queue, publishNow, dropped } = enqueueTranslation(
      EMPTY_OUTPUT_BUFFER_QUEUE,
      1,
      4_000,
      true,
      candidate("a", "Hello"),
      1_000,
    );
    expect(dropped).toBe(false);
    expect(publishNow).toEqual([]);
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0].dueAt).toBe(1_000 + 4_000);
  });

  it("uses the auto-mode baseline for a fresh item when delay is auto", () => {
    const { queue } = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, "auto", true, candidate("a", "Hi"), 0);
    expect(queue.entries[0].dueAt).toBe(OUTPUT_BUFFER_STEADY_STATE_DELAY_MS);
  });

  it("uses the flat steady-state delay for an item entering behind existing content", () => {
    const first = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 6_000, true, candidate("a", "Hi"), 0).queue;
    const { queue } = enqueueTranslation(first, 2, 6_000, false, candidate("b", "There"), 500);
    expect(queue.entries).toHaveLength(2);
    expect(queue.entries[1].dueAt).toBe(500 + OUTPUT_BUFFER_STEADY_STATE_DELAY_MS);
  });

  it("force-advances the front entry to make room when the queue is full", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 6_000, true, candidate("a", "Hi"), 0).queue;
    const outcome = enqueueTranslation(queue, 1, 6_000, false, candidate("b", "There"), 100);
    expect(outcome.dropped).toBe(false);
    expect(outcome.publishNow.map((entry) => entry.id)).toEqual(["a"]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["b"]);
    queue = outcome.queue;
  });

  it("drops the incoming translation (leakage) when the queue is full and the front is paused", () => {
    const queued = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 6_000, true, candidate("a", "Hi"), 0).queue;
    const paused = setManualPause(queued, "a", true, 50);
    const outcome = enqueueTranslation(paused, 1, 6_000, false, candidate("b", "There"), 100);
    expect(outcome.dropped).toBe(true);
    expect(outcome.publishNow).toEqual([]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("drains down to a newly-shrunk capacity in one call instead of getting stuck above it", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, 2_000, false, candidate("b", "There"), 0).queue;
    expect(queue.entries).toHaveLength(2);

    // The operator lowers the output buffer to 1 slot; the next translation must not
    // merely swap 1-for-1 and stay stuck at length 2 forever.
    const outcome = enqueueTranslation(queue, 1, 2_000, false, candidate("c", "Amen"), 1_000);
    expect(outcome.dropped).toBe(false);
    expect(outcome.publishNow.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["c"]);
  });

  it("stops draining for a shrunk capacity at a paused entry, and still drops the candidate if that leaves no room", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, 2_000, false, candidate("b", "There"), 0).queue;
    queue = setManualPause(queue, "a", true, 50);

    const outcome = enqueueTranslation(queue, 1, 2_000, false, candidate("c", "Amen"), 1_000);
    expect(outcome.dropped).toBe(true);
    expect(outcome.publishNow).toEqual([]);
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("tick", () => {
  it("publishes the front entry once its dwell time elapses", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 2_000, true, candidate("a", "Hi"), 0).queue;
    expect(tick(queue, 1_999).publish).toBeNull();
    const due = tick(queue, 2_000);
    expect(due.publish?.id).toBe("a");
    expect(due.queue.entries).toEqual([]);
  });

  it("never advances a paused front entry", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 2_000, true, candidate("a", "Hi"), 0).queue;
    const paused = setManualPause(queue, "a", true, 10);
    expect(tick(paused, 10_000).publish).toBeNull();
  });
});

describe("pause and resume", () => {
  it("freezes and restores the remaining dwell time", () => {
    const queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 6_000, true, candidate("a", "Hi"), 0).queue;
    const paused = setManualPause(queue, "a", true, 4_000);
    expect(isOutputBufferEntryPaused(paused.entries[0])).toBe(true);
    expect(paused.entries[0].dueAt).toBeNull();
    expect(paused.entries[0].remainingMs).toBe(2_000);
    const resumed = setManualPause(paused, "a", false, 10_000);
    expect(isOutputBufferEntryPaused(resumed.entries[0])).toBe(false);
    expect(resumed.entries[0].dueAt).toBe(12_000);
  });
});

describe("edit lifecycle", () => {
  it("auto-pauses only once the edited entry reaches the front, and auto-resumes on submit", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, 2_000, false, candidate("b", "There"), 0).queue;

    queue = beginEdit(queue, "b", 100);
    expect(isOutputBufferEntryPaused(queue.entries[1])).toBe(false);

    const advanced = tick(queue, 2_000);
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
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = beginEdit(queue, "a", 100);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(true);
    queue = cancelEdit(queue, "a", 500);
    expect(queue.entries[0].publicText).toBe("Hi");
    expect(queue.entries[0].editing).toBe(false);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(false);
  });
});

describe("clear and fast-forward", () => {
  it("removes a cleared entry without disturbing the others", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, 2_000, false, candidate("b", "There"), 0).queue;
    queue = clearEntry(queue, "a", 100);
    expect(queue.entries.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("fast-forwards a non-front entry immediately, ahead of its position", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 6_000, true, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, 6_000, false, candidate("b", "There"), 0).queue;
    const outcome = fastForwardEntry(queue, "b", 100);
    expect(outcome.publish?.id).toBe("b");
    expect(outcome.queue.entries.map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("beta review", () => {
  it("pauses the whole queue during review and restores independent pause state afterward", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 2, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = enqueueTranslation(queue, 2, 2_000, false, candidate("b", "There"), 0).queue;
    queue = setManualPause(queue, "a", true, 50);

    queue = beginReview(queue, 100);
    expect(queue.entries.every(isOutputBufferEntryPaused)).toBe(true);

    queue = applyReviewResults(queue, new Map([["a", "Hi (revised)"], ["b", "There (revised)"]]));
    expect(queue.entries[0].publicText).toBe("Hi (revised)");
    expect(queue.entries[0].revisedByModel).toBe(true);

    queue = endReview(queue, 5_000);
    expect(isOutputBufferEntryPaused(queue.entries[0])).toBe(true);
    expect(queue.entries[0].manuallyPaused).toBe(true);
    expect(isOutputBufferEntryPaused(queue.entries[1])).toBe(false);
  });

  it("never overwrites an entry the operator is actively hand-editing", () => {
    let queue = enqueueTranslation(EMPTY_OUTPUT_BUFFER_QUEUE, 1, 2_000, true, candidate("a", "Hi"), 0).queue;
    queue = beginEdit(queue, "a", 10);
    queue = applyReviewResults(queue, new Map([["a", "Model revision"]]));
    expect(queue.entries[0].publicText).toBe("Hi");
    expect(queue.entries[0].revisedByModel).toBe(false);
  });
});
