"use client";

import type { ReactNode } from "react";

import type { LiveSessionControlAction } from "@/live/contracts";

interface ObsOverlayProps {
  configured: boolean;
  channelAction: "create" | "rotate" | "save-style" | null;
  onCreateChannel: () => void;
  onCopyUrl: () => void;
  copied: boolean;
  urlField: ReactNode;
  controlAction: LiveSessionControlAction | null;
  onShowTest: () => void;
  onClearCaption: () => void;
  confirmRotate: boolean;
  onConfirmRotateChange: (value: boolean) => void;
  onRotateChannel: () => void;
}

interface MobileViewerProps {
  url: string | null;
  onCopy: () => void;
  copied: boolean;
  onOpenPreview: () => void;
  confirmReplace: boolean;
  onConfirmReplaceChange: (value: boolean) => void;
  viewerAction: "replace" | null;
  onReplace: () => void;
}

interface LiveOutputsSectionProps {
  hasService: boolean;
  isBusy: boolean;
  anotherOperatorActive: boolean;
  runningOperator: string | null;
  observedMessage: string;
  observedSaveHistory: boolean | undefined;
  outputMonitor: ReactNode;
  readerAndPhoneOutputs: ReactNode;
  obs: ObsOverlayProps;
  viewer: MobileViewerProps;
}

/** Everything about where/how captions reach the audience: monitor, buffer, OBS, mobile, reader/phone. */
export function LiveOutputsSection({
  hasService,
  isBusy,
  anotherOperatorActive,
  runningOperator,
  observedMessage,
  observedSaveHistory,
  outputMonitor,
  readerAndPhoneOutputs,
  obs,
  viewer,
}: LiveOutputsSectionProps) {
  return (
    <>
      <section className="outputMonitorSection" aria-label="Output monitor">
        {outputMonitor}
        <p className="helpText">OBS and the latest viewer mirror this caption without extra AI calls. The reader appends shared paragraphs about 30 seconds later.</p>
        {anotherOperatorActive ? (
          <p className="privacyNote" role="status">
            {runningOperator ? `${runningOperator} is running this service. ` : ""}
            {observedMessage || "Connecting to the running service…"}
            {observedSaveHistory === false
              ? " This service does not save history, so the recognized source stays on the capture computer."
              : ""}
          </p>
        ) : null}
      </section>
      {hasService ? readerAndPhoneOutputs : null}
      <details className="outputDestination" open>
        <summary>OBS overlay <span>Reusable browser source</span></summary>
        <div className="obsSetupCard workspaceOutputCard">
          <div className="sectionHeading">
            <div>
              <h3>OBS Main channel</h3>
            </div>
            <span className={`statusChip ${obs.configured ? "ready" : ""}`}>
              {obs.configured ? "Reusable" : "Not created"}
            </span>
          </div>
          {!obs.configured ? (
            <>
              <p>
                Create one encrypted Main channel URL. Paste it into OBS once
                and reuse it for future services.
              </p>
              <button
                className="primaryButton fullButton"
                disabled={obs.channelAction !== null || isBusy}
                onClick={() => obs.onCreateChannel()}
              >
                {obs.channelAction === "create" ? "Creating securely…" : "Create OBS channel"}
              </button>
            </>
          ) : (
            <>
              <p>
                Use a 1920 × 1080 Browser Source. The canvas stays transparent
                between services.
              </p>
              <button className="primaryButton fullButton" onClick={() => obs.onCopyUrl()}>
                {obs.copied ? "URL copied" : "Copy OBS URL"}
              </button>
              <p className="privacyNote">Keep this reusable URL private. Anyone holding it can read public captions.</p>
              <details className="credentialDisclosure">
                <summary>Reveal URL for manual copy</summary>
                {obs.urlField}
              </details>
              {!hasService && (
                <div className="buttonGrid">
                  <button
                    className="secondaryButton"
                    disabled={obs.controlAction !== null || anotherOperatorActive || isBusy}
                    onClick={() => obs.onShowTest()}
                  >
                    {obs.controlAction === "show-test" ? "Showing…" : "Show test"}
                  </button>
                  <button
                    className="secondaryButton"
                    disabled={obs.controlAction !== null || anotherOperatorActive || isBusy}
                    onClick={() => obs.onClearCaption()}
                  >
                    {obs.controlAction === "clear" ? "Clearing…" : "Clear live caption"}
                  </button>
                </div>
              )}
              <p className="helpText">{hasService ? "Use the live controls to clear captions. Pause first to show a test caption from More." : anotherOperatorActive ? "Another operator controls this channel. Test and clear are available when the channel is idle." : "Show test sends synthetic text without microphone capture or AI calls. Confirm it appears in OBS, then clear it."}</p>
              <details className="advancedActions">
                <summary>Advanced link security</summary>
                <p>
                  Rotate only if the URL was exposed. The old OBS source stops
                  working immediately. End the service before rotating.
                </p>
                {obs.confirmRotate ? (
                  <div className="confirmationRow">
                    <button className="secondaryButton" onClick={() => obs.onConfirmRotateChange(false)}>
                      Cancel
                    </button>
                    <button
                      className="dangerButton"
                      disabled={obs.channelAction !== null || anotherOperatorActive || hasService}
                      onClick={() => {
                        obs.onConfirmRotateChange(false);
                        obs.onRotateChannel();
                      }}
                    >
                      {obs.channelAction === "rotate" ? "Rotating…" : "Confirm rotation"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="dangerOutlineButton"
                    disabled={anotherOperatorActive || hasService}
                    onClick={() => obs.onConfirmRotateChange(true)}
                  >
                    Rotate OBS link
                  </button>
                )}
              </details>
            </>
          )}
        </div>
      </details>
      <details className="outputDestination">
        <summary>Mobile translation viewer <span>Latest caption · No extra AI</span></summary>
        <div className="viewerLinkPanel">
          <p>
            Share this read-only link with intended viewers. It shows only the
            current moderated translation and expires when this service ends or
            another operator takes over.
          </p>
          {!hasService ? (
            <p className="privacyNote">Start captions to create a mobile viewer link. This mirror uses no additional AI calls.</p>
          ) : viewer.url ? (
            <>
              <div className="buttonGrid">
                <button className="primaryButton" type="button" onClick={() => viewer.onCopy()}>
                  {viewer.copied ? "Link copied" : "Copy mobile link"}
                </button>
                <button className="secondaryButton" type="button" onClick={() => viewer.onOpenPreview()}>
                  Open preview
                </button>
              </div>
              <details className="credentialDisclosure">
                <summary>Reveal mobile link for manual copy</summary>
                <label>
                  Current mobile viewer link
                  <input
                    value={viewer.url}
                    readOnly
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Mobile viewer URL"
                  />
                </label>
              </details>
              <details className="advancedActions">
                <summary>Viewer link security</summary>
                <p>
                  Replace the link if it was shared with the wrong person.
                  Existing viewers disconnect immediately; OBS is unaffected.
                </p>
                {viewer.confirmReplace ? (
                  <div className="confirmationRow">
                    <button
                      className="secondaryButton"
                      type="button"
                      onClick={() => viewer.onConfirmReplaceChange(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="dangerButton"
                      type="button"
                      disabled={viewer.viewerAction !== null || isBusy}
                      onClick={() => {
                        viewer.onConfirmReplaceChange(false);
                        viewer.onReplace();
                      }}
                    >
                      {viewer.viewerAction === "replace" ? "Replacing…" : "Confirm replacement"}
                    </button>
                  </div>
                ) : (
                  <button
                    className="dangerOutlineButton"
                    type="button"
                    disabled={viewer.viewerAction !== null || isBusy}
                    onClick={() => viewer.onConfirmReplaceChange(true)}
                  >
                    Replace mobile link
                  </button>
                )}
              </details>
            </>
          ) : (
            <button
              className="primaryButton"
              type="button"
              disabled={viewer.viewerAction !== null || isBusy}
              onClick={() => viewer.onReplace()}
            >
              {viewer.viewerAction === "replace" ? "Creating link…" : "Create mobile viewer link"}
            </button>
          )}
        </div>
      </details>
      {!hasService ? readerAndPhoneOutputs : null}
    </>
  );
}
