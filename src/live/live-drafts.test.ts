import { describe, expect, it } from "vitest";

import { canDraft, draftOffsets, DRAFT_END_MARGIN_MS, DRAFT_MIN_NEW_AUDIO_MS, MAX_DRAFTS_PER_CAPTION } from "@/live/live-drafts";

describe("live draft scheduling", () => {
  it("uses bounded offsets for each fixed window and the Dynamic maximum", () => {
    expect(draftOffsets(6_000)).toEqual([]);
    expect(draftOffsets(10_000)).toEqual([4_000]);
    expect(draftOffsets(14_000)).toEqual([4_000, 8_000]);
    expect(draftOffsets("dynamic")).toEqual([4_000, 8_000]);
    expect(MAX_DRAFTS_PER_CAPTION).toBe(2);
    expect(DRAFT_MIN_NEW_AUDIO_MS).toBe(3_000);
    expect(DRAFT_END_MARGIN_MS).toBe(2_000);
  });

  it("refuses drafts while a final is busy or another draft is in flight", () => {
    const base = { attemptsUsed: 0, maxAttempts: 900, remainingMs: 60_000, windowMs: 14_000, draftsUsed: 0 };
    expect(canDraft({ ...base, finalBusy: true, draftInFlight: false })).toBe(false);
    expect(canDraft({ ...base, finalBusy: false, draftInFlight: true })).toBe(false);
  });

  it("preserves enough attempts for the remaining final captions", () => {
    const base = { maxAttempts: 900, remainingMs: 60_000, windowMs: 14_000, draftsUsed: 0, finalBusy: false, draftInFlight: false };
    expect(canDraft({ ...base, attemptsUsed: 894 })).toBe(false);
    expect(canDraft({ ...base, attemptsUsed: 893 })).toBe(true);
  });

  it("stops at the per-caption draft cap and at the service attempt ceiling", () => {
    const base = { maxAttempts: 900, remainingMs: 10_000, windowMs: 14_000, finalBusy: false, draftInFlight: false };
    expect(canDraft({ ...base, attemptsUsed: 0, draftsUsed: MAX_DRAFTS_PER_CAPTION })).toBe(false);
    expect(canDraft({ ...base, attemptsUsed: 900, draftsUsed: 0 })).toBe(false);
  });
});
