import { describe, expect, it, vi } from "vitest";

import {
  canDraft,
  createLiveDraftToggle,
  MAX_DRAFTS_PER_CAPTION,
} from "@/live/live-drafts";

describe("live draft scheduling", () => {
  it("allows one draft per caption and no more", () => {
    expect(MAX_DRAFTS_PER_CAPTION).toBe(1);
    const base = { attemptsUsed: 0, maxAttempts: 900, remainingMs: 60_000, windowMs: 14_000, finalBusy: false, draftInFlight: false };
    expect(canDraft({ ...base, draftsUsed: 0 })).toBe(true);
    expect(canDraft({ ...base, draftsUsed: 1 })).toBe(false);
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

  it("stops at the service attempt ceiling", () => {
    const base = { maxAttempts: 900, remainingMs: 10_000, windowMs: 14_000, finalBusy: false, draftInFlight: false };
    expect(canDraft({ ...base, attemptsUsed: 900, draftsUsed: 0 })).toBe(false);
  });

  it("starts every service with drafts on and clears pending work", () => {
    const invalidatePendingWork = vi.fn();
    const toggle = createLiveDraftToggle({
      invalidatePendingWork,
      setSessionDisabled: vi.fn(),
    });

    expect(toggle.canRun()).toBe(true);
    toggle.startSession();
    expect(invalidatePendingWork).toHaveBeenCalledOnce();
  });

  it("keeps provider-rejected drafts blocked for the rest of the service", () => {
    const setSessionDisabled = vi.fn();
    const toggle = createLiveDraftToggle({
      invalidatePendingWork: vi.fn(),
      setSessionDisabled,
    });

    toggle.disableForSession();
    expect(toggle.canRun()).toBe(false);
    expect(setSessionDisabled).toHaveBeenCalledWith(true);
    toggle.startSession();
    expect(toggle.canRun()).toBe(true);
    expect(setSessionDisabled).toHaveBeenLastCalledWith(false);
  });
});
