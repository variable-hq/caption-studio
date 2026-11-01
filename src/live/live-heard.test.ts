import { describe, expect, it } from "vitest";

import { normalizeTranslationSessionSettings } from "@/live/translation-settings";
import {
  clearHeardDraft,
  draftReusedAsFinal,
  heardSourceText,
  type DraftReuseSnapshot,
} from "@/live/live-heard";

const settings = normalizeTranslationSessionSettings({
  sourceLanguage: "id",
  targetLanguage: "en",
  recordingWindowMs: "dynamic",
});
const liveWords = [{ id: "one", row: { word: "Yesus", action: "recognise" as const, with: "" } }];
const note = "Slow speaker.";

function snapshot(overrides: Partial<DraftReuseSnapshot> = {}): DraftReuseSnapshot {
  return {
    captureGeneration: 3,
    controllerToken: "c".repeat(43),
    translationRevision: 7,
    settings,
    liveWords,
    liveNote: note,
    ...overrides,
  };
}

describe("Live Heard", () => {
  it("shows the in-progress draft source until a published caption replaces it", () => {
    expect(heardSourceText("Last caption.", null)).toEqual({ text: "Last caption.", inProgress: false });
    expect(heardSourceText("Last caption.", { windowId: 2, sourceText: "Draft words." })).toEqual({
      text: "Draft words.",
      inProgress: true,
    });
    expect(heardSourceText("Last caption.", { windowId: 2, sourceText: "" })).toEqual({
      text: "Last caption.",
      inProgress: false,
    });
  });

  it("clears a mid-clause draft when its final completes so Heard shows the published source", () => {
    const draft = { windowId: 7, sourceText: "An unfinished clause" };
    const published = "An unfinished clause, completed by the final.";
    // A mid-clause chunk carries its window id even though it has no reuse payload.
    const remaining = clearHeardDraft(draft, 7);

    expect(remaining).toBeNull();
    expect(heardSourceText(published, remaining)).toEqual({ text: published, inProgress: false });
  });

  it("leaves a newer window's draft alone when an older final completes", () => {
    const draft = { windowId: 8, sourceText: "Newer draft" };
    expect(clearHeardDraft(draft, 7)).toBe(draft);
    expect(clearHeardDraft(draft)).toBeNull();
  });

  it("reuses a confirming draft while the service state is unchanged", () => {
    const draft = { captureGeneration: 3, snapshot: snapshot() };

    expect(draftReusedAsFinal(draft, snapshot())).toBe(true);
  });

  it("falls back to a normal final when any reused state changed", () => {
    const draft = { captureGeneration: 3, snapshot: snapshot() };

    expect(draftReusedAsFinal(draft, snapshot({ captureGeneration: 4 }))).toBe(false);
    expect(draftReusedAsFinal(draft, snapshot({ controllerToken: "d".repeat(43) }))).toBe(false);
    expect(draftReusedAsFinal(draft, snapshot({ translationRevision: 8 }))).toBe(false);
    expect(draftReusedAsFinal(draft, snapshot({ settings: { ...settings } }))).toBe(false);
    expect(draftReusedAsFinal(draft, snapshot({ liveWords: [...liveWords] }))).toBe(false);
    expect(draftReusedAsFinal(draft, snapshot({ liveNote: "A different note." }))).toBe(false);
  });
});
