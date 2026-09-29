"use client";

import type { RefObject } from "react";

import type { CloudState } from "@/live/contracts";

interface DashboardStatusFooterProps {
  cloudState: CloudState;
  channelStatus: string;
  channelStatusLabel: string;
  statusBarRef: RefObject<HTMLElement | null>;
}

const CLOUD_STATE_LABELS: Record<CloudState, string> = {
  checking: "Checking cloud AI",
  ready: "Cloud AI configured",
  "not-configured": "Cloud setup needed",
  unavailable: "Cloud AI unavailable",
};

/** The persistent cloud/channel status pills at the foot of the dashboard. */
export function DashboardStatusFooter({
  cloudState,
  channelStatus,
  channelStatusLabel,
  statusBarRef,
}: DashboardStatusFooterProps) {
  return (
    <footer className="dashboardStatusBar" aria-label="Service status" ref={statusBarRef}>
      <span className={`statusPill ${cloudState}`}>
        <span className="statusDot" aria-hidden="true" />
        {CLOUD_STATE_LABELS[cloudState]}
      </span>
      <span className={`statusPill channel-${channelStatus}`}>{channelStatusLabel}</span>
    </footer>
  );
}
