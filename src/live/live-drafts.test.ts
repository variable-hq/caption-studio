import { describe, expect, it, vi } from "vitest";

import { MAX_TRANSCRIPTION_REQUESTS, RECORDING_WINDOW_POLICIES } from "@/live/contracts";
import {
  canDraft,
  createLiveDraftToggle,
  DRAFT_ADMISSION_WINDOW_MS,
  MAX_DRAFTS_PER_CAPTION,
} from "@/live/live-drafts";

const SESSION_MS = 90 * 60_000;

/** Every window holds its draft whenever admitted (one extra attempt); returns finals refused for lack of attempts. */
function simulateHeldDrafts(finalWindowMs: number, admissionWindowMs: number) {
  let attemptsUsed = 0;
  let finalsWithoutAttempt = 0;
  for (let elapsedMs = 0; elapsedMs < SESSION_MS; elapsedMs += finalWindowMs) {
    const admitted = canDraft({
      attemptsUsed,
      maxAttempts: MAX_TRANSCRIPTION_REQUESTS,
      remainingMs: SESSION_MS - elapsedMs,
      windowMs: admissionWindowMs,
      draftsUsed: 0,
      finalBusy: false,
      draftInFlight: false,
    });
    if (admitted) attemptsUsed += 1;
    if (attemptsUsed < MAX_TRANSCRIPTION_REQUESTS) attemptsUsed += 1;
    else finalsWithoutAttempt += 1;
  }
  return { attemptsUsed, finalsWithoutAttempt };
}

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

  it("reserves one final per Dynamic floor-length window", () => {
    expect(DRAFT_ADMISSION_WINDOW_MS).toBe(RECORDING_WINDOW_POLICIES.dynamic.minMs);
    const base = {
      attemptsUsed: 1_130,
      maxAttempts: MAX_TRANSCRIPTION_REQUESTS,
      remainingMs: 2_700_000,
      draftsUsed: 0,
      finalBusy: false,
      draftInFlight: false,
    };
    expect(canDraft({ ...base, windowMs: DRAFT_ADMISSION_WINDOW_MS })).toBe(false);
    expect(canDraft({ ...base, windowMs: 14_000 })).toBe(true);
  });

  it("gives every final an attempt across a 90-minute session of floor-length windows", () => {
    const result = simulateHeldDrafts(DRAFT_ADMISSION_WINDOW_MS, DRAFT_ADMISSION_WINDOW_MS);
    expect(result.finalsWithoutAttempt).toBe(0);
    expect(result.attemptsUsed).toBeLessThanOrEqual(MAX_TRANSCRIPTION_REQUESTS);
  });

  it("gives every final an attempt after a provider limit raises the floor to 6 s", () => {
    const result = simulateHeldDrafts(6_000, DRAFT_ADMISSION_WINDOW_MS);
    expect(result.finalsWithoutAttempt).toBe(0);
    expect(result.attemptsUsed).toBeLessThanOrEqual(MAX_TRANSCRIPTION_REQUESTS);
  });

  it("leaves finals without attempts when the reserve uses Dynamic's cap", () => {
    expect(simulateHeldDrafts(DRAFT_ADMISSION_WINDOW_MS, 14_000).finalsWithoutAttempt).toBeGreaterThan(0);
  });
});
