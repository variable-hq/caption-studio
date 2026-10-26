"use client";

import type { ReactNode } from "react";

import { SettingGroup } from "@/components/operator/SettingsParts";
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
  obs: ObsOverlayProps;
  viewer: MobileViewerProps;
}

/** Settings › OBS & links: the reusable OBS link, the phone viewer link, and replacing either. */
export function LiveOutputsSection({ hasService, isBusy, anotherOperatorActive, obs, viewer }: LiveOutputsSectionProps) {
  const testDisabled = obs.controlAction !== null || anotherOperatorActive || isBusy;
  return (
    <>
      <SettingGroup
        title="OBS"
        hint={obs.configured
          ? "Add this link once in OBS as a 1920 × 1080 Browser Source; it stays the same every week. Keep it private: anyone with it can show your captions."
          : "Create the OBS link once, then paste it into OBS as a 1920 × 1080 Browser Source."}
      >
        {!obs.configured ? (
          <div className="buttonRow">
            <button
              type="button"
              className="primaryButton"
              disabled={obs.channelAction !== null || isBusy}
              onClick={() => obs.onCreateChannel()}
            >
              {obs.channelAction === "create" ? "Creating…" : "Create OBS link"}
            </button>
          </div>
        ) : (
          <>
            <div className="buttonRow">
              <button type="button" className="primaryButton" onClick={() => obs.onCopyUrl()}>
                {obs.copied ? "Copied" : "Copy OBS link"}
              </button>
              {!hasService ? (
                <>
                  <button type="button" className="secondaryButton" disabled={testDisabled} onClick={() => obs.onShowTest()}>
                    {obs.controlAction === "show-test" ? "Showing…" : "Show a test caption"}
                  </button>
                  <button type="button" className="secondaryButton" disabled={testDisabled} onClick={() => obs.onClearCaption()}>
                    {obs.controlAction === "clear" ? "Clearing…" : "Clear screen"}
                  </button>
                </>
              ) : null}
            </div>
            <details className="advancedActions">
              <summary>Show the link to copy by hand</summary>
              {obs.urlField}
            </details>
          </>
        )}
      </SettingGroup>

      <SettingGroup
        title="Phone viewer"
        hint={hasService
          ? "Share this with the congregation. It shows only the current caption and stops working when the service ends."
          : "A new link is made each time you start. It appears here and on the Live screen."}
      >
        {hasService && viewer.url ? (
          <>
            <div className="buttonRow">
              <button className="primaryButton" type="button" onClick={() => viewer.onCopy()}>
                {viewer.copied ? "Copied" : "Copy link"}
              </button>
              <button className="secondaryButton" type="button" onClick={() => viewer.onOpenPreview()}>
                Open preview
              </button>
            </div>
            <details className="advancedActions">
              <summary>Show the link to copy by hand</summary>
              <label>
                Phone viewer link
                <input name="viewerLink" value={viewer.url} readOnly autoComplete="off" spellCheck={false} />
              </label>
            </details>
          </>
        ) : hasService ? (
          <div className="buttonRow">
            <button
              className="primaryButton"
              type="button"
              disabled={viewer.viewerAction !== null || isBusy}
              onClick={() => viewer.onReplace()}
            >
              {viewer.viewerAction === "replace" ? "Creating…" : "Create phone viewer link"}
            </button>
          </div>
        ) : null}
      </SettingGroup>

      {obs.configured ? (
        <SettingGroup title="A link was shared by mistake?" hint="Replacing a link stops the old one straight away.">
          {hasService && viewer.url ? (
            <div className="replaceRow">
              <span>
                <strong>Phone viewer link</strong>
                <br />
                <span className="settingHint">People watching on phones disconnect; share the new link. OBS is not affected.</span>
              </span>
              {viewer.confirmReplace ? (
                <span className="buttonRow">
                  <button className="secondaryButton" type="button" onClick={() => viewer.onConfirmReplaceChange(false)}>Cancel</button>
                  <button
                    className="dangerButton"
                    type="button"
                    disabled={viewer.viewerAction !== null || isBusy}
                    onClick={() => {
                      viewer.onConfirmReplaceChange(false);
                      viewer.onReplace();
                    }}
                  >
                    {viewer.viewerAction === "replace" ? "Replacing…" : "Replace link"}
                  </button>
                </span>
              ) : (
                <button className="dangerOutlineButton" type="button" disabled={viewer.viewerAction !== null || isBusy} onClick={() => viewer.onConfirmReplaceChange(true)}>
                  Replace…
                </button>
              )}
            </div>
          ) : null}
          <div className="replaceRow">
            <span>
              <strong>OBS link</strong>
              <br />
              <span className="settingHint">
                {hasService || anotherOperatorActive
                  ? "Available when no service is running."
                  : "The old OBS source stops working; paste the new link into OBS."}
              </span>
            </span>
            {obs.confirmRotate ? (
              <span className="buttonRow">
                <button className="secondaryButton" type="button" onClick={() => obs.onConfirmRotateChange(false)}>Cancel</button>
                <button
                  className="dangerButton"
                  type="button"
                  disabled={obs.channelAction !== null || anotherOperatorActive || hasService}
                  onClick={() => {
                    obs.onConfirmRotateChange(false);
                    obs.onRotateChannel();
                  }}
                >
                  {obs.channelAction === "rotate" ? "Replacing…" : "Replace OBS link"}
                </button>
              </span>
            ) : (
              <button className="dangerOutlineButton" type="button" disabled={anotherOperatorActive || hasService} onClick={() => obs.onConfirmRotateChange(true)}>
                Replace…
              </button>
            )}
          </div>
        </SettingGroup>
      ) : null}
    </>
  );
}
