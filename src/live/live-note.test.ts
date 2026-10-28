import { describe, expect, it } from "vitest";
import { MAX_LIVE_NOTE_CHARS, normalizeLiveNote } from "./live-note";

describe("live note", () => {
  it("trims and bounds text and rejects controls and non-text", () => {
    expect(normalizeLiveNote("  Synthetic note  ")).toBe("Synthetic note");
    expect(normalizeLiveNote("x".repeat(600))).toHaveLength(MAX_LIVE_NOTE_CHARS);
    expect(normalizeLiveNote("bad\u0000text")).toBe("");
    expect(normalizeLiveNote(null)).toBe("");
  });
});
