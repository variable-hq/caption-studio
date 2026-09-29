"use client";

import { DashboardIcon } from "@/components/operator/DashboardNavigation";
import { formatMinutesSeconds } from "@/components/operator/format-duration";
import { WORKSPACE_NAME } from "@/domain/workspace";
import type { RecordingWindowMs } from "@/live/contracts";

type WorkspaceSectionId =
  | "history"
  | "audio"
  | "translation"
  | "usage"
  | "prompt"
  | "summary"
  | "appearance"
  | "outputs"
  | "overview";

interface OverviewSectionProps {
  hasService: boolean;
  liveNeedsAttention: boolean;
  isRefreshing: boolean;
  isPaused: boolean;
  anotherOperatorActive: boolean;
  displayedSourceLabel: string | undefined;
  displayedTargetLabel: string | undefined;
  elapsedMinutes: number;
  elapsedSeconds: number;
  latestPublicAt: number | null | undefined;
  usageClock: number;
  droppedChunks: number;
  microphoneState: "idle" | "requesting" | "active" | "error";
  activeRecordingWindowMs: number;
  recordingWindowMs: RecordingWindowMs;
  channelConfigured: boolean;
  onOpenSection: (section: WorkspaceSectionId) => void;
  onOpenServicePanel: () => void;
}

/** The "overview" workspace section: at-a-glance status, metrics, and a setup checklist. */
export function OverviewSection({
  hasService,
  liveNeedsAttention,
  isRefreshing,
  isPaused,
  anotherOperatorActive,
  displayedSourceLabel,
  displayedTargetLabel,
  elapsedMinutes,
  elapsedSeconds,
  latestPublicAt,
  usageClock,
  droppedChunks,
  microphoneState,
  activeRecordingWindowMs,
  recordingWindowMs,
  channelConfigured,
  onOpenSection,
  onOpenServicePanel,
}: OverviewSectionProps) {
  return (
    <div className="dashboardOverview">
      <div className="overviewWelcome">
        <span className="overviewSymbol">
          <DashboardIcon name={hasService ? "audio" : "overview"} />
        </span>
        <div>
          <h3>
            {hasService
              ? liveNeedsAttention
                ? "Service needs attention"
                : isRefreshing
                  ? "Updating translation"
                  : isPaused
                    ? "Service paused"
                    : "Your service is in progress"
              : anotherOperatorActive
                ? "Another operator is live"
                : "Prepare your next service"}
          </h3>
          <p>
            {hasService
              ? "Pause and Clear stay within reach. Open Service controls for the output monitor, service details, and End."
              : anotherOperatorActive
                ? "Main channel is already in use. Taking over stops the current capture computer."
                : "Check your audio, confirm the languages, and connect your audience."}
          </p>
        </div>
      </div>
      <dl className="overviewMetrics">
        <div>
          <dt>Spoken language</dt>
          <dd>{displayedSourceLabel ?? "Refresh required"}</dd>
        </div>
        <div>
          <dt>Audience language</dt>
          <dd>{displayedTargetLabel ?? "Refresh required"}</dd>
        </div>
        <div>
          <dt>{hasService ? "Elapsed / 90 min" : "Service window"}</dt>
          <dd>{hasService ? formatMinutesSeconds(elapsedMinutes, elapsedSeconds) : "90 minutes"}</dd>
        </div>
        {hasService ? (
          <>
            <div>
              <dt>Last caption</dt>
              <dd>{latestPublicAt ? `${Math.max(0, Math.floor((usageClock - latestPublicAt) / 1_000))}s ago` : "None yet"}</dd>
            </div>
            <div>
              <dt>Skipped chunks</dt>
              <dd>{droppedChunks}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <section className="overviewChecklist" aria-labelledby="overview-checklist-heading">
        <div className="overviewSectionHeading">
          <h3 id="overview-checklist-heading">{hasService ? "Manage your service" : "Before you go live"}</h3>
          <span>{hasService ? "Live workspace" : "3 checks"}</span>
        </div>
        <button type="button" className="overviewTask" onClick={() => onOpenSection("audio")}>
          <span className="overviewTaskIcon">
            <DashboardIcon name="audio" />
          </span>
          <span>
            <strong>Check your audio input</strong>
            <small>
              {microphoneState === "active"
                ? "Microphone connected · Check the input meter"
                : microphoneState === "error"
                  ? "Microphone needs attention"
                  : "Choose a microphone and test the level"}
            </small>
          </span>
          <DashboardIcon name="chevronRight" />
        </button>
        <button type="button" className="overviewTask" onClick={() => onOpenSection("translation")}>
          <span className="overviewTaskIcon">
            <DashboardIcon name="translation" />
          </span>
          <span>
            <strong>Confirm translation settings</strong>
            <small>
              {displayedSourceLabel ?? "Unknown"} → {displayedTargetLabel ?? "Unknown"} ·{" "}
              {(hasService ? activeRecordingWindowMs : recordingWindowMs) / 1_000}s window
            </small>
          </span>
          <DashboardIcon name="chevronRight" />
        </button>
        <button type="button" className="overviewTask" onClick={() => onOpenSection("outputs")}>
          <span className="overviewTaskIcon">
            <DashboardIcon name="outputs" />
          </span>
          <span>
            <strong>{hasService ? "Connect your audience" : "Test the OBS source"}</strong>
            <small>
              {hasService
                ? "OBS, mobile captions, reader, and remote control"
                : channelConfigured
                  ? "Channel created · Verify the test in OBS"
                  : "Create your reusable OBS channel"}
            </small>
          </span>
          <DashboardIcon name="chevronRight" />
        </button>
        {!hasService && (
          <p className="helpText">
            Cloud status confirms configuration. Start checks model access; verify sound and
            the OBS source yourself.
          </p>
        )}
      </section>
      {!hasService ? (
        <div className="overviewNote">
          <DashboardIcon name="history" />
          <div>
            <strong>Keep the message after the service</strong>
            <p>
              Enable transcript saving before Start to review the sermon and generate a
              summary later. Saved history is shared with every operator in {WORKSPACE_NAME}{" "}
              and expires 7 days after End.
            </p>
            <button type="button" className="textButton" onClick={onOpenServicePanel}>
              Review service setup <DashboardIcon name="chevronRight" />
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="secondaryButton" onClick={onOpenServicePanel}>
          Open service controls
        </button>
      )}
    </div>
  );
}
