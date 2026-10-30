import { describe, expect, it, vi } from "vitest";

import {
  canDraft,
  createLiveDraftToggle,
  draftOffsets,
  DRAFT_END_MARGIN_MS,
  DRAFT_MIN_NEW_AUDIO_MS,
  MAX_DRAFTS_PER_CAPTION,
} from "@/live/live-drafts";

describe("live draft scheduling", () => {
  it("uses bounded offsets for fixed windows and leaves Dynamic drafts to pause candidates", () => {
    expect(draftOffsets(6_000)).toEqual([]);
    expect(draftOffsets(10_000)).toEqual([4_000]);
    expect(draftOffsets(14_000)).toEqual([4_000, 8_000]);
    expect(draftOffsets("dynamic")).toEqual([]);
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

  it("turning drafts off clears timers, aborts active work and blocks later admission", () => {
    const clearTimers = vi.fn();
    const abortActiveDraft = vi.fn();
    const setSessionDisabled = vi.fn();
    const canDraftSpy = vi.fn(() => true);
    const toggle = createLiveDraftToggle(true, {
      invalidatePendingWork: () => {
        clearTimers();
        abortActiveDraft();
      },
      setSessionDisabled,
    });
    const attemptDraft = () => toggle.canRun() && canDraftSpy();

    expect(attemptDraft()).toBe(true);
    toggle.setEnabled(false);
    expect(clearTimers).toHaveBeenCalledOnce();
    expect(abortActiveDraft).toHaveBeenCalledOnce();
    expect(attemptDraft()).toBe(false);
    expect(canDraftSpy).toHaveBeenCalledOnce();
  });

  it("keeps provider-rejected drafts blocked when switched back on until the next session", () => {
    const toggle = createLiveDraftToggle(true, {
      invalidatePendingWork: vi.fn(),
      setSessionDisabled: vi.fn(),
    });

    toggle.disableForSession();
    toggle.setEnabled(false);
    toggle.setEnabled(true);

    expect(toggle.canRun()).toBe(false);
    toggle.startSession();
    expect(toggle.canRun()).toBe(true);
  });
});
