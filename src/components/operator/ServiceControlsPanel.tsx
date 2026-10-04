"use client";

import type { ReactNode } from "react";

import { AudioLevelMeter } from "@/components/operator/AudioLevelMeter";
import { formatCount, formatDuration, UsageMetric } from "@/components/operator/UsageMetric";
import { WORKSPACE_NAME } from "@/domain/workspace";
import { consumptionPercent, consumptionStatus } from "@/ai/usage";
import type { LlmSessionUsage } from "@/ai/contracts";
import { MAX_LIVE_SESSION_MS, MAX_TRANSCRIPTION_REQUESTS, type CloudState, type LiveSessionControlAction, type LiveSessionState, type RecordingWindowMs } from "@/live/contracts";

interface StartBarProps {
  anotherOperatorActive: boolean;
  saveHistoryActive: boolean | undefined;
  saveHistory: boolean;
  onSaveHistoryChange: (checked: boolean) => void;
  heading: string;
  description: string;
  confirmTakeover: boolean;
  takeoverRequired: boolean;
  onConfirmTakeoverChange: (value: boolean) => void;
  onCancelTakeover: () => void;
  cloudState: CloudState;
  isBusy: boolean;
  onStartSession: (takeover?: boolean) => void;
}

interface LiveConsoleProps {
  isPaused: boolean;
  isRefreshing: boolean;
  liveNeedsAttention: boolean;
  status: LiveSessionState["status"];
  activeRecordingWindowMs: number;
  droppedChunks: number;
  lastLatencyMs: number | null;
  saveHistory: boolean | undefined;
  level: number;
  /** Null while viewing Live outputs, which already shows this — avoids a duplicate. */
  outputMonitor: ReactNode;
  output: {
    onCopyOverlayUrl: () => void;
    copied: boolean;
    viewerUrl: string | null;
    onCopyViewerUrl: () => void;
    viewerCopied: boolean;
    controlAction: LiveSessionControlAction | null;
    onShowTestCaption: () => void;
    overlayUrlField: ReactNode;
  };
}

interface ServiceSnapshotProps {
  displayedSourceLabel: string | undefined;
  displayedTargetLabel: string | undefined;
  activeRecordingWindowMs: number;
  recordingWindowMs: RecordingWindowMs;
  hasPendingTranslationChanges: boolean;
}

interface ServiceUsageProps {
  elapsedServiceMs: number;
  transcriptionRequests: number;
  llmUsage: Pick<LlmSessionUsage, "translationRequests" | "totalTokens" | "promptTokens" | "completionTokens">;
}

interface ServiceControlsPanelProps {
  hasService: boolean;
  startBar: StartBarProps;
  liveConsole: LiveConsoleProps;
  snapshot: ServiceSnapshotProps;
  usage: ServiceUsageProps;
}

/**
 * The expanded Service Controls panel's body: the pre-service Start/Take-over bar, the
 * live console (status, the output monitor, and the Output sub-section) once a service
 * exists, the always-present configuration snapshot, and — last — this live service's
 * usage. Master Controls and the panel's own error/history banners render alongside this
 * from `page.tsx`, since `masterControlsBar` is a shared node also rendered outside the
 * panel when collapsed. Manual overrides (Quick block, Manual caption, the output-buffer
 * queue) live in the "Manual override" workspace section instead of this panel.
 *
 * `liveConsole.outputMonitor` is `null` while the operator is on Live outputs, which
 * already renders the same node — the panel docks open (not modal) from 1280px, so
 * without this the identical caption preview would show twice on screen at once.
 */
export function ServiceControlsPanel({ hasService, startBar, liveConsole, snapshot, usage }: ServiceControlsPanelProps) {
  const timePercent = consumptionPercent(usage.elapsedServiceMs, MAX_LIVE_SESSION_MS);
  const transcriptionPercent = consumptionPercent(usage.transcriptionRequests, MAX_TRANSCRIPTION_REQUESTS);

  return (
    <>
      {!hasService ? (
        <section
          className={`startBar ${startBar.anotherOperatorActive ? "takeover" : ""}`}
          aria-labelledby="start-service-heading"
        >
          <section className="historyConsent" aria-label="Transcript saving">
            <label className="checkLabel">
              <input
                type="checkbox"
                name="saveTranscript"
                checked={hasService ? startBar.saveHistoryActive === true : startBar.saveHistory}
                disabled={hasService || startBar.isBusy}
                onChange={(event) => startBar.onSaveHistoryChange(event.target.checked)}
              />
              Save transcript history for this service
            </label>
            <p className="helpText">
              {hasService
                ? startBar.saveHistoryActive
                  ? `Saving to ${WORKSPACE_NAME} during this service, where every signed-in operator can review it. Tell participants that transcript history is enabled.`
                  : "History saving is off for this service."
                : "Choose before Start and tell participants when saving is enabled. History deletes 7 days after End; numeric AI usage is retained separately for 30 days."}
            </p>
          </section>
          <div className="startBarActions">
            <div>
              <strong id="start-service-heading">{startBar.heading}</strong>
              <p id="start-service-description">{startBar.description}</p>
            </div>
            {startBar.confirmTakeover || startBar.takeoverRequired ? (
              <div className="takeoverConfirmation">
                <button
                  className="secondaryButton"
                  onClick={() => {
                    startBar.onConfirmTakeoverChange(false);
                    startBar.onCancelTakeover();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="dangerButton"
                  aria-describedby="start-service-description"
                  disabled={startBar.cloudState !== "ready" || startBar.isBusy}
                  onClick={() => {
                    startBar.onConfirmTakeoverChange(false);
                    startBar.onStartSession(true);
                  }}
                >
                  Confirm takeover
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {hasService ? (
        <section
          className={`liveConsole ${liveConsole.isPaused ? "paused" : ""} ${liveConsole.liveNeedsAttention ? "attention" : ""}`}
          aria-label="Live controls"
        >
          <div className="liveIdentity">
            <span
              className={`liveIndicator ${
                liveConsole.isPaused || liveConsole.isRefreshing || liveConsole.liveNeedsAttention ? "paused" : ""
              }`}
              aria-hidden="true"
            />
            <div>
              <strong>
                {liveConsole.liveNeedsAttention
                  ? "Capture stopped"
                  : liveConsole.isRefreshing
                    ? "Refreshing translation"
                  : liveConsole.isPaused
                    ? "Paused"
                    : liveConsole.status === "pausing"
                      ? "Stopping capture"
                      : liveConsole.status === "resuming"
                        ? "Reopening microphone"
                        : liveConsole.status === "ending"
                          ? "Ending service"
                          : "Capturing audio"}
              </strong>
              <p>
                {liveConsole.activeRecordingWindowMs / 1_000}s window · {liveConsole.droppedChunks}{" "}
                skipped · {liveConsole.lastLatencyMs === null
                  ? "waiting for processing time"
                  : `${liveConsole.lastLatencyMs} ms processing`}
              </p>
              <p>History saving {liveConsole.saveHistory ? "on" : "off"}</p>
              <div className="liveInputMeter"><AudioLevelMeter level={liveConsole.level} /></div>
            </div>
          </div>
          {liveConsole.outputMonitor}
          <div className="obsSetupCard">
            <div className="sectionHeading">
              <h3>Output</h3>
            </div>
            <div className="buttonGrid">
              <button className="secondaryButton" type="button" onClick={liveConsole.output.onCopyOverlayUrl}>
                {liveConsole.output.copied ? "Copied" : "Copy OBS URL"}
              </button>
              {liveConsole.output.viewerUrl ? (
                <button className="secondaryButton" type="button" onClick={liveConsole.output.onCopyViewerUrl}>
                  {liveConsole.output.viewerCopied ? "Mobile link copied" : "Copy mobile viewer link"}
                </button>
              ) : null}
              <button
                className="secondaryButton"
                type="button"
                disabled={!liveConsole.isPaused || liveConsole.output.controlAction !== null}
                onClick={liveConsole.output.onShowTestCaption}
              >
                {liveConsole.output.controlAction === "show-test" ? "Showing test…" : "Show test caption"}
              </button>
            </div>
            <details className="credentialDisclosure">
              <summary>Reveal OBS URL for manual copy</summary>
              <p className="helpText">Keep this reusable credential private.</p>
              {liveConsole.output.overlayUrlField}
            </details>
          </div>
          <p className="liveControlHelp">
            Pause stops capture and clears the current caption. Clear live caption drops
            pending reader text; committed reader paragraphs remain. The 90-minute timer
            continues while paused.
          </p>
        </section>
      ) : null}
      <details className="serviceSnapshot" open={hasService}>
        <summary>{hasService ? "Active translation" : "Starting configuration"}</summary>
        <dl>
          <div>
            <dt>Spoken language</dt>
            <dd>{snapshot.displayedSourceLabel ?? "Refresh required"}</dd>
          </div>
          <div>
            <dt>Audience language</dt>
            <dd>{snapshot.displayedTargetLabel ?? "Refresh required"}</dd>
          </div>
          <div>
            <dt>{hasService ? "Active window" : "Draft window"}</dt>
            <dd>{(hasService ? snapshot.activeRecordingWindowMs : snapshot.recordingWindowMs) / 1_000}s</dd>
          </div>
        </dl>
        {snapshot.hasPendingTranslationChanges ? (
          <p className="helpText">Draft changes are not active until you confirm a refresh.</p>
        ) : null}
      </details>
      {hasService ? (
        <section className="usageSection" aria-labelledby="service-usage-heading">
          <div className="usageSectionHeading">
            <div>
              <h3 id="service-usage-heading">Usage</h3>
            </div>
          </div>
          <div className="usageSummaryGrid">
            <UsageMetric
              label="Service window"
              value={`${formatDuration(usage.elapsedServiceMs)} / 90m`}
              detail="The timer continues while the live service is paused."
              status={consumptionStatus(usage.elapsedServiceMs, MAX_LIVE_SESSION_MS)}
              percent={timePercent}
              ariaValueText={`${formatDuration(usage.elapsedServiceMs)} used of 90 minutes`}
            />
            <UsageMetric
              label="Transcription attempts"
              value={`${formatCount(usage.transcriptionRequests)} / ${formatCount(
                MAX_TRANSCRIPTION_REQUESTS,
              )}`}
              detail="Reserved before each audio request; silence and failed calls can still count."
              status={consumptionStatus(usage.transcriptionRequests, MAX_TRANSCRIPTION_REQUESTS)}
              percent={transcriptionPercent}
              ariaValueText={`${formatCount(
                usage.transcriptionRequests,
              )} attempts used of ${formatCount(MAX_TRANSCRIPTION_REQUESTS)}`}
            />
            <UsageMetric
              label="Translation calls"
              value={formatCount(usage.llmUsage.translationRequests)}
              detail="Responses with recorded usage, including skipped incomplete output. Same-language captions bypass translation."
            />
            <UsageMetric
              label="Translation tokens"
              value={formatCount(usage.llmUsage.totalTokens)}
              detail={`${formatCount(usage.llmUsage.promptTokens)} prompt · ${formatCount(
                usage.llmUsage.completionTokens,
              )} completion`}
            />
          </div>
          <p className="usageScopeNote">
            These totals belong to this service and survive an operator-page refresh.
            They are not billing totals for the whole Groq account.
          </p>
        </section>
      ) : null}
    </>
  );
}
