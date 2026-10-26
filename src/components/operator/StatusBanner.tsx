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
      className={`statusBanner ${status} ${status !== "error" ? "visuallyHidden" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div>
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
        <p>{message}</p>
      </div>
      {status === "error" && !hasService && rotationRecoveryRequired ? (
        confirmRotate ? (
          <span className="confirmationRow recoveryActions">
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
              Replace OBS URL
            </button>
          </span>
        ) : (
          <button className="dangerOutlineButton" onClick={() => onConfirmRotateChange(true)}>
            Rotate and recover
          </button>
        )
      ) : status === "error" && !hasService ? (
        <button className="textButton" onClick={onReloadChannel}>
          Retry channel
        </button>
      ) : null}
    </section>
  );
}
