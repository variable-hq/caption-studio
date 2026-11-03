"use client";

import { useI18n } from "@/i18n/provider";

interface LiveControlBarProps {
  isPaused: boolean;
  isPausing: boolean;
  isResuming: boolean;
  clearing: boolean;
  minutesLeft: number;
  transcriptSaved: boolean;
  /** Pause/Resume/Clear are unavailable (a request is in flight or the session is busy). */
  controlsDisabled: boolean;
  endRetryRequired: boolean;
  endDisabled: boolean;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onEnd: () => void;
  onRetryEnd: () => void;
}

/** Pinned to the bottom of the Live screen while a session runs, so Pause, Clear screen
 * and End session stay reachable however far the operator scrolls. Also shows the time
 * left on the 90-minute session and whether the transcript is being saved. */
export function LiveControlBar({
  isPaused,
  isPausing,
  isResuming,
  clearing,
  minutesLeft,
  transcriptSaved,
  controlsDisabled,
  endRetryRequired,
  endDisabled,
  onPause,
  onResume,
  onClear,
  onEnd,
  onRetryEnd,
}: LiveControlBarProps) {
  const { locale, t } = useI18n();
  const resumeShown = isPaused || isResuming;
  const formattedMinutesLeft = new Intl.NumberFormat(locale).format(minutesLeft);
  return (
    <section className="liveControlBar" aria-label={t("shell.controls.label")}>
      <div className="liveControlBarInner">
        <button
          type="button"
          className="primaryButton"
          disabled={controlsDisabled}
          onClick={resumeShown ? onResume : onPause}
        >
          {resumeShown ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
          )}
          {isResuming ? t("shell.controls.resuming") : isPausing ? t("shell.controls.pausing") : resumeShown ? t("shell.controls.resume") : t("shell.controls.pause")}
        </button>
        <button type="button" className="secondaryButton" disabled={controlsDisabled} onClick={onClear}>
          {clearing ? t("shell.controls.clearing") : t("shell.controls.clearScreen")}
        </button>
        <p className="operatorHint">
          {resumeShown ? <span>{t("shell.controls.pausedHint")} </span> : null}
          <span>{t("shell.controls.sessionStatus", {
            minutes: formattedMinutesLeft,
            transcriptState: t(transcriptSaved ? "shell.controls.saving" : "shell.controls.notSaved"),
          })}</span>
        </p>
        {endRetryRequired ? (
          <button type="button" className="dangerButton" disabled={endDisabled} onClick={onRetryEnd}>
            {t("shell.controls.tryEndAgain")}
          </button>
        ) : (
          <button type="button" className="dangerOutlineButton" disabled={endDisabled} onClick={onEnd}>
            {t("shell.controls.endSession")}
          </button>
        )}
      </div>
    </section>
  );
}
