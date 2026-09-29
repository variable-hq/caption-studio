"use client";

import type { ReactNode } from "react";

import { ManualOverridesGroup } from "@/components/operator/ManualOverridesGroup";
import { MAX_TRANSCRIPTION_REQUESTS, type CloudState, type LiveSessionControlAction, type LiveSessionState, type RecordingWindowMs } from "@/live/contracts";
import type { OutputBufferCount, OutputBufferQueueState } from "@/live/output-buffer";
import type { QuickBlockEntry } from "@/live/quick-block";

interface StartBarProps {
  anotherOperatorActive: boolean;
  historyConsent: ReactNode;
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
  audioMeter: ReactNode;
  elapsedMinutes: number;
  elapsedSeconds: number;
  transcriptionRequests: number;
  translationRequests: number;
  totalTokens: number;
  usagePercent: number;
  onViewUsage: () => void;
  manualOverrides: {
    quickBlockEntries: readonly QuickBlockEntry[];
    onAddQuickBlock: (term: string) => void;
    onRemoveQuickBlock: (id: string) => void;
    isBusy: boolean;
    controlBusy: boolean;
    manualCaptionBusy: boolean;
    onShowManualCaption: (text: string) => void;
    outputBufferCount: OutputBufferCount;
    outputBufferQueue: OutputBufferQueueState;
    onOutputBufferPause: (id: string, paused: boolean) => void;
    onOutputBufferClear: (id: string) => void;
    onOutputBufferFastForward: (id: string) => void;
    onOutputBufferBeginEdit: (id: string) => void;
    onOutputBufferEditDraftChange: (id: string, text: string) => void;
    onOutputBufferCancelEdit: (id: string) => void;
    onOutputBufferSubmitEdit: (id: string) => void;
  };
  onCopyOverlayUrl: () => void;
  copied: boolean;
  viewerUrl: string | null;
  onCopyViewerUrl: () => void;
  viewerCopied: boolean;
  controlAction: LiveSessionControlAction | null;
  onShowTestCaption: () => void;
  overlayUrlField: ReactNode;
}

interface ServiceSnapshotProps {
  hasService: boolean;
  displayedSourceLabel: string | undefined;
  displayedTargetLabel: string | undefined;
  activeRecordingWindowMs: number;
  recordingWindowMs: RecordingWindowMs;
  hasPendingTranslationChanges: boolean;
}

interface ServiceControlsPanelProps {
  hasService: boolean;
  startBar: StartBarProps;
  liveConsole: LiveConsoleProps;
  snapshot: ServiceSnapshotProps;
}

/**
 * The expanded Service Controls panel's body: the pre-service Start/Take-over bar, the
 * live console (status, usage, Manual overrides, the "More" convenience menu) once a
 * service exists, and the always-present configuration snapshot. Master Controls and the
 * panel's own error/history banners render alongside this from `page.tsx`, since
 * `masterControlsBar` is a shared node also rendered outside the panel when collapsed.
 */
export function ServiceControlsPanel({ hasService, startBar, liveConsole, snapshot }: ServiceControlsPanelProps) {
  return (
    <>
      {!hasService ? (
        <section
          className={`startBar ${startBar.anotherOperatorActive ? "takeover" : ""}`}
          aria-labelledby="start-service-heading"
        >
          {startBar.historyConsent}
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
              <div className="liveInputMeter">{liveConsole.audioMeter}</div>
            </div>
          </div>
          <div className="compactUsage">
            <div>
              <span>
                {liveConsole.elapsedMinutes}m {liveConsole.elapsedSeconds.toString().padStart(2, "0")}s / 90m
              </span>
              <span>
                {liveConsole.transcriptionRequests} / {MAX_TRANSCRIPTION_REQUESTS}{" "}
                attempts · {liveConsole.translationRequests} translations
              </span>
              <button className="usageDetailsButton" type="button" onClick={liveConsole.onViewUsage}>
                View usage
              </button>
            </div>
            <div
              className="usageProgress"
              role="progressbar"
              aria-label="Live service usage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={liveConsole.usagePercent}
              aria-valuetext={`${liveConsole.elapsedMinutes} minutes ${liveConsole.elapsedSeconds} seconds elapsed; ${liveConsole.transcriptionRequests} of ${MAX_TRANSCRIPTION_REQUESTS} transcription attempts used; ${liveConsole.translationRequests} translation calls and ${liveConsole.totalTokens} translation tokens`}
            >
              <span style={{ width: `${liveConsole.usagePercent}%` }} />
            </div>
          </div>
          <div className="primaryControls">
            <ManualOverridesGroup
              quickBlockEntries={liveConsole.manualOverrides.quickBlockEntries}
              onAddQuickBlock={liveConsole.manualOverrides.onAddQuickBlock}
              onRemoveQuickBlock={liveConsole.manualOverrides.onRemoveQuickBlock}
              isPaused={liveConsole.isPaused}
              isBusy={liveConsole.manualOverrides.isBusy}
              controlBusy={liveConsole.manualOverrides.controlBusy}
              manualCaptionBusy={liveConsole.manualOverrides.manualCaptionBusy}
              onShowManualCaption={liveConsole.manualOverrides.onShowManualCaption}
              outputBuffer={{
                show: liveConsole.manualOverrides.outputBufferCount > 0,
                queue: liveConsole.manualOverrides.outputBufferQueue,
                onPause: liveConsole.manualOverrides.onOutputBufferPause,
                onClear: liveConsole.manualOverrides.onOutputBufferClear,
                onFastForward: liveConsole.manualOverrides.onOutputBufferFastForward,
                onBeginEdit: liveConsole.manualOverrides.onOutputBufferBeginEdit,
                onEditDraftChange: liveConsole.manualOverrides.onOutputBufferEditDraftChange,
                onCancelEdit: liveConsole.manualOverrides.onOutputBufferCancelEdit,
                onSubmitEdit: liveConsole.manualOverrides.onOutputBufferSubmitEdit,
              }}
            />
            <details
              className="moreMenu"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }}
            >
              <summary>More</summary>
              <div>
                <button onClick={liveConsole.onCopyOverlayUrl}>
                  {liveConsole.copied ? "Copied" : "Copy OBS URL"}
                </button>
                {liveConsole.viewerUrl ? (
                  <button onClick={liveConsole.onCopyViewerUrl}>
                    {liveConsole.viewerCopied ? "Mobile link copied" : "Copy mobile viewer link"}
                  </button>
                ) : null}
                <button
                  disabled={!liveConsole.isPaused || liveConsole.controlAction !== null}
                  onClick={liveConsole.onShowTestCaption}
                >
                  {liveConsole.controlAction === "show-test" ? "Showing test…" : "Show test caption"}
                </button>
                <details className="credentialDisclosure">
                  <summary>Reveal OBS URL for manual copy</summary>
                  <p className="helpText">Keep this reusable credential private.</p>
                  {liveConsole.overlayUrlField}
                </details>
              </div>
            </details>
          </div>
          <p className="liveControlHelp">
            Pause stops capture and clears the current caption. Clear live caption drops
            pending reader text; committed reader paragraphs remain. The 90-minute timer
            continues while paused.
          </p>
        </section>
      ) : null}
      <details className="serviceSnapshot" open={snapshot.hasService}>
        <summary>{snapshot.hasService ? "Active translation" : "Starting configuration"}</summary>
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
            <dt>{snapshot.hasService ? "Active window" : "Draft window"}</dt>
            <dd>{(snapshot.hasService ? snapshot.activeRecordingWindowMs : snapshot.recordingWindowMs) / 1_000}s</dd>
          </div>
        </dl>
        {snapshot.hasPendingTranslationChanges ? (
          <p className="helpText">Draft changes are not active until you confirm a refresh.</p>
        ) : null}
      </details>
    </>
  );
}
