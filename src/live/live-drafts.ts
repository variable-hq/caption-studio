import type { RecordingWindowMs } from "@/live/contracts";

export const MAX_DRAFTS_PER_CAPTION = 2;
export const DRAFT_MIN_NEW_AUDIO_MS = 3_000;
export const DRAFT_END_MARGIN_MS = 2_000;

export function draftOffsets(windowMs: RecordingWindowMs): number[] {
  if (windowMs === 6_000) return [];
  if (windowMs === 10_000) return [4_000];
  return [4_000, 8_000];
}

export interface CanDraftOptions {
  attemptsUsed: number;
  maxAttempts: number;
  remainingMs: number;
  windowMs: number;
  draftsUsed: number;
  finalBusy: boolean;
  draftInFlight: boolean;
}

export function canDraft({
  attemptsUsed,
  maxAttempts,
  remainingMs,
  windowMs,
  draftsUsed,
  finalBusy,
  draftInFlight,
}: CanDraftOptions): boolean {
  if (
    finalBusy || draftInFlight || draftsUsed >= MAX_DRAFTS_PER_CAPTION ||
    attemptsUsed < 0 || attemptsUsed >= maxAttempts || remainingMs <= 0 || windowMs <= 0
  ) return false;
  const attemptsRemaining = maxAttempts - attemptsUsed;
  const finalsStillNeeded = Math.ceil(remainingMs / windowMs) + 1;
  return attemptsRemaining > finalsStillNeeded;
}
