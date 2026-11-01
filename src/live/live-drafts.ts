/** One transcription-only draft per caption; only Dynamic uses it. */
export const MAX_DRAFTS_PER_CAPTION = 1;

export interface LiveDraftToggleEffects {
  invalidatePendingWork(): void;
  setSessionDisabled(disabled: boolean): void;
}

export function createLiveDraftToggle(initialEnabled: boolean, effects: LiveDraftToggleEffects) {
  let enabled = initialEnabled;
  let sessionDisabled = false;
  const invalidate = () => effects.invalidatePendingWork();

  return {
    canRun: () => enabled && !sessionDisabled,
    setEnabled(nextEnabled: boolean) {
      if (enabled === nextEnabled) return;
      enabled = nextEnabled;
      if (!enabled) invalidate();
    },
    startSession() {
      sessionDisabled = false;
      effects.setSessionDisabled(false);
      invalidate();
    },
    disableForSession() {
      if (sessionDisabled) return;
      sessionDisabled = true;
      effects.setSessionDisabled(true);
      invalidate();
    },
    reset: invalidate,
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
