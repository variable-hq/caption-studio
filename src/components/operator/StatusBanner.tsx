"use client";

import type { LiveSessionState } from "@/live/contracts";
import { useI18n } from "@/i18n/provider";

interface StatusBannerProps {
  status: LiveSessionState["status"];
  message: string;
  hasSession: boolean;
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
  hasSession,
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
  const { t } = useI18n();
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
          {hasSession
            ? liveNeedsAttention
              ? t("shell.banner.needsAttention")
              : isRefreshing
                ? t("shell.banner.applyingChanges")
              : isPaused
                ? t("shell.banner.paused")
                : t("shell.banner.live")
            : t("shell.banner.cannotStart")}
        </strong>
        <br />
        {message}
      </span>
      {status === "error" && !hasSession && rotationRecoveryRequired ? (
        confirmRotate ? (
          <span className="buttonRow">
            <button className="secondaryButton" onClick={() => onConfirmRotateChange(false)}>
              {t("shell.banner.cancel")}
            </button>
            <button
              className="dangerButton"
              disabled={channelActionBusy}
              onClick={() => {
                onConfirmRotateChange(false);
                onRotateChannel();
              }}
            >
              {t("shell.banner.replaceObsLink")}
            </button>
          </span>
        ) : (
          <button className="dangerOutlineButton" onClick={() => onConfirmRotateChange(true)}>
            {t("shell.banner.replaceObsLinkEllipsis")}
          </button>
        )
      ) : status === "error" && !hasSession ? (
        <button className="secondaryButton" onClick={onReloadChannel}>
          {t("shell.banner.tryAgain")}
        </button>
      ) : null}
    </section>
  );
}
