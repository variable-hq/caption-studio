import { describe, expect, it } from "vitest";

import { clearHeardDraft, heardSourceText } from "@/live/live-heard";

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
});
