"use client";

import type { LiveSessionState } from "@/live/contracts";

interface StatusBannerProps {
  status: LiveSessionState["status"];
  message: string;
  hasService: boolean;
  liveNeedsAttention: boolean;
  isRefreshing: boolean;
  isPaused: boolean;
  rotationRecoveryRequired: boolean;
  confirmRotate: boolean;
  onConfirmRotateChange: (value: boolean) => void;
  channelActionBusy: boolean;
  onRotateChannel: () => void;
  onReloadChannel: () => void;
}

/** The live-status/error banner at the top of the dashboard content, with error recovery actions. */
export function StatusBanner({
  status,
  message,
  hasService,
  liveNeedsAttention,
  isRefreshing,
  isPaused,
  rotationRecoveryRequired,
  confirmRotate,
  onConfirmRotateChange,
  channelActionBusy,
  onRotateChannel,
  onReloadChannel,
}: StatusBannerProps) {
  return (
    <section
      className={status === "error" ? "operatorBanner" : "visuallyHidden"}
      data-tone="bad"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>
        <strong>
          {hasService
            ? liveNeedsAttention
              ? "The service needs attention"
              : isRefreshing
                ? "Applying your changes"
              : isPaused
                ? "Paused"
                : "Live"
            : "Can’t start yet"}
        </strong>
        <br />
        {message}
      </span>
      {status === "error" && !hasService && rotationRecoveryRequired ? (
        confirmRotate ? (
          <span className="buttonRow">
            <button className="secondaryButton" onClick={() => onConfirmRotateChange(false)}>
              Cancel
            </button>
            <button
              className="dangerButton"
              disabled={channelActionBusy}
              onClick={() => {
                onConfirmRotateChange(false);
                onRotateChannel();
              }}
            >
              Replace OBS link
            </button>
          </span>
        ) : (
          <button className="dangerOutlineButton" onClick={() => onConfirmRotateChange(true)}>
            Replace OBS link…
          </button>
        )
      ) : status === "error" && !hasService ? (
        <button className="secondaryButton" onClick={onReloadChannel}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
