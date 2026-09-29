"use client";

import { useId } from "react";

interface MasterControlsBarProps {
  hasService: boolean;
  isPaused: boolean;
  isRefreshing: boolean;
  isPausing: boolean;
  isResuming: boolean;
  isStarting: boolean;
  liveNeedsAttention: boolean;
  anotherOperatorActive: boolean;
  runningOperator: string | null;
  isBusy: boolean;
  /** True while any of Pause/Resume/Clear/Show-test/Manual is in flight. */
  controlBusy: boolean;
  clearing: boolean;
  endRetryRequired: boolean;
  endActionDisabled: boolean;
  startDisabled: boolean;
  startDescription: string;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
  onRetryEnd: () => void;
  onEndService: () => void;
  onStart: () => void;
  onTakeOver: () => void;
}

/** Rendered outside or inside Service Controls depending on panel state; state drives
 * which button is enabled, not whether it exists. */
export function MasterControlsBar({
  hasService,
  isPaused,
  isRefreshing,
  isPausing,
  isResuming,
  isStarting,
  liveNeedsAttention,
  anotherOperatorActive,
  runningOperator,
  isBusy,
  controlBusy,
  clearing,
  endRetryRequired,
  endActionDisabled,
  startDisabled,
  startDescription,
  onPause,
  onResume,
  onClear,
  onRetryEnd,
  onEndService,
  onStart,
  onTakeOver,
}: MasterControlsBarProps) {
  const startDescriptionId = useId();
  const statusText = liveNeedsAttention
    ? "Capture needs attention"
    : isRefreshing
      ? "Refreshing"
      : isPaused
        ? "Paused"
        : hasService
          ? "Capturing audio"
          : anotherOperatorActive
            ? runningOperator
              ? `${runningOperator} is running this service`
              : "Another operator is running this service"
            : "No service running";

  return (
    <section className="masterControls" aria-label="Master controls">
      <span className="masterControlsState">{statusText}</span>
      {/* Own accessible description rather than depending on page.tsx's start-service-description
       * paragraph: this component renders in one of two mutually exclusive spots (docked outside
       * Service Controls, or inside it), and that paragraph only exists inside the panel - a
       * display:none subtree when docked, which contributes nothing to aria-describedby there. */}
      <span id={startDescriptionId} className="visuallyHidden">{startDescription}</span>
      <button
        className={anotherOperatorActive ? "dangerButton" : "primaryButton"}
        disabled={hasService || startDisabled}
        aria-describedby={startDescriptionId}
        onClick={anotherOperatorActive ? onTakeOver : onStart}
      >
        {isStarting ? "Starting securely…" : anotherOperatorActive ? "Take over channel" : "Start captions"}
      </button>
      {endRetryRequired ? (
        <button className="dangerButton" disabled={endActionDisabled} onClick={onRetryEnd}>
          Retry End
        </button>
      ) : isPaused || isResuming ? (
        <button
          className="primaryButton"
          disabled={!hasService || isBusy || controlBusy}
          onClick={onResume}
        >
          {isResuming ? "Resuming…" : "Resume"}
        </button>
      ) : (
        <button
          className="primaryButton"
          disabled={!hasService || isBusy || controlBusy}
          onClick={onPause}
        >
          {isPausing ? "Pausing…" : "Pause"}
        </button>
      )}
      <button
        className="secondaryButton compactButton"
        disabled={!hasService || isBusy || controlBusy}
        title="Clear current captions from OBS and the mobile viewer without changing capture."
        onClick={onClear}
      >
        {clearing ? "Clearing…" : "Clear live caption"}
      </button>
      <button
        className="textButton endServiceButton"
        disabled={!hasService || endActionDisabled}
        onClick={onEndService}
      >
        End service
      </button>
    </section>
  );
}
