"use client";

interface LiveControlBarProps {
  isPaused: boolean;
  isPausing: boolean;
  isResuming: boolean;
  clearing: boolean;
  minutesLeft: number;
  transcriptSaved: boolean;
  /** Pause/Resume/Clear are unavailable (a request is in flight or the service is busy). */
  controlsDisabled: boolean;
  endRetryRequired: boolean;
  endDisabled: boolean;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onEnd: () => void;
  onRetryEnd: () => void;
}

/** Pinned to the bottom of the Live screen while a service runs, so Pause, Clear screen
 * and End service stay reachable however far the operator scrolls. Also shows the time
 * left on the 90-minute service and whether the transcript is being saved. */
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
  const resumeShown = isPaused || isResuming;
  return (
    <section className="liveControlBar" aria-label="Live controls">
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
          {isResuming ? "Resuming…" : isPausing ? "Pausing…" : resumeShown ? "Resume" : "Pause"}
        </button>
        <button type="button" className="secondaryButton" disabled={controlsDisabled} onClick={onClear}>
          {clearing ? "Clearing…" : "Clear screen"}
        </button>
        <p className="operatorHint">
          {resumeShown ? "Paused: nothing is shown and the microphone is off. " : ""}
          {minutesLeft} min left · Transcript {transcriptSaved ? "saving" : "not saved"}
        </p>
        {endRetryRequired ? (
          <button type="button" className="dangerButton" disabled={endDisabled} onClick={onRetryEnd}>
            Try End again
          </button>
        ) : (
          <button type="button" className="dangerOutlineButton" disabled={endDisabled} onClick={onEnd}>
            End service
          </button>
        )}
      </div>
    </section>
  );
}
