/** One transcription-only draft per caption; only Dynamic uses it. */
export const MAX_DRAFTS_PER_CAPTION = 1;

export interface LiveDraftToggleEffects {
  invalidatePendingWork(): void;
  setSessionDisabled(disabled: boolean): void;
}

/** Drafts start on with every service; a provider rejection stops them for the session. */
export function createLiveDraftToggle(effects: LiveDraftToggleEffects) {
  let sessionDisabled = false;

  return {
    canRun: () => !sessionDisabled,
    startSession() {
      sessionDisabled = false;
      effects.setSessionDisabled(false);
      effects.invalidatePendingWork();
    },
    disableForSession() {
      if (sessionDisabled) return;
      sessionDisabled = true;
      effects.setSessionDisabled(true);
      effects.invalidatePendingWork();
    },
    reset: effects.invalidatePendingWork,
  };
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
