"use client";

import type { ReactNode } from "react";

import { SettingGroup } from "@/components/operator/SettingsParts";
import { useT } from "@/i18n/provider";
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
  const t = useT();
  const testDisabled = obs.controlAction !== null || anotherOperatorActive || isBusy;
  return (
    <>
      <SettingGroup
        title={t("liveOutputs.obsTitle")}
        hint={obs.configured
          ? t("liveOutputs.obsConfiguredHint")
          : t("liveOutputs.obsUnconfiguredHint")}
      >
        {!obs.configured ? (
          <div className="buttonRow">
            <button
              type="button"
              className="primaryButton"
              disabled={obs.channelAction !== null || isBusy}
              onClick={() => obs.onCreateChannel()}
            >
              {obs.channelAction === "create" ? t("common.creating") : t("liveOutputs.createObs")}
            </button>
          </div>
        ) : (
          <>
            <div className="buttonRow">
              <button type="button" className="primaryButton" onClick={() => obs.onCopyUrl()}>
                {obs.copied ? t("common.copied") : t("liveOutputs.copyObs")}
              </button>
              {!hasService ? (
                <>
                  <button type="button" className="secondaryButton" disabled={testDisabled} onClick={() => obs.onShowTest()}>
                    {obs.controlAction === "show-test" ? t("common.showing") : t("liveOutputs.showTest")}
                  </button>
                  <button type="button" className="secondaryButton" disabled={testDisabled} onClick={() => obs.onClearCaption()}>
                    {obs.controlAction === "clear" ? t("common.clearing") : t("liveOutputs.clearScreen")}
                  </button>
                </>
              ) : null}
            </div>
            <details className="advancedActions">
              <summary>{t("common.showLinkManually")}</summary>
              {obs.urlField}
            </details>
          </>
        )}
      </SettingGroup>

      <SettingGroup
        title={t("liveOutputs.phoneViewerTitle")}
        hint={hasService
          ? t("liveOutputs.phoneViewerLiveHint")
          : t("liveOutputs.phoneViewerIdleHint")}
      >
        {hasService && viewer.url ? (
          <>
            <div className="buttonRow">
              <button className="primaryButton" type="button" onClick={() => viewer.onCopy()}>
                {viewer.copied ? t("common.copied") : t("common.copyLink")}
              </button>
              <button className="secondaryButton" type="button" onClick={() => viewer.onOpenPreview()}>
                {t("liveOutputs.openPreview")}
              </button>
            </div>
            <details className="advancedActions">
              <summary>{t("common.showLinkManually")}</summary>
              <label>
                {t("liveOutputs.phoneViewerLink")}
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
              {viewer.viewerAction === "replace" ? t("common.creating") : t("liveOutputs.createViewerLink")}
            </button>
          </div>
        ) : null}
      </SettingGroup>

      {obs.configured ? (
        <SettingGroup title={t("liveOutputs.sharedByMistakeTitle")} hint={t("liveOutputs.sharedByMistakeHint")}>
          {hasService && viewer.url ? (
            <div className="replaceRow">
              <span>
                <strong>{t("liveOutputs.phoneViewerLink")}</strong>
                <br />
                <span className="settingHint">{t("liveOutputs.replaceViewerHint")}</span>
              </span>
              {viewer.confirmReplace ? (
                <span className="buttonRow">
                  <button className="secondaryButton" type="button" onClick={() => viewer.onConfirmReplaceChange(false)}>{t("common.cancel")}</button>
                  <button
                    className="dangerButton"
                    type="button"
                    disabled={viewer.viewerAction !== null || isBusy}
                    onClick={() => {
                      viewer.onConfirmReplaceChange(false);
                      viewer.onReplace();
                    }}
                  >
                    {viewer.viewerAction === "replace" ? t("common.replacing") : t("liveOutputs.replaceLink")}
                  </button>
                </span>
              ) : (
                <button className="dangerOutlineButton" type="button" disabled={viewer.viewerAction !== null || isBusy} onClick={() => viewer.onConfirmReplaceChange(true)}>
                  {t("common.replaceEllipsis")}
                </button>
              )}
            </div>
          ) : null}
          <div className="replaceRow">
            <span>
              <strong>{t("liveOutputs.obsLink")}</strong>
              <br />
              <span className="settingHint">
                {hasService || anotherOperatorActive
                  ? t("liveOutputs.obsReplaceUnavailable")
                  : t("liveOutputs.obsReplaceHint")}
              </span>
            </span>
            {obs.confirmRotate ? (
              <span className="buttonRow">
                <button className="secondaryButton" type="button" onClick={() => obs.onConfirmRotateChange(false)}>{t("common.cancel")}</button>
                <button
                  className="dangerButton"
                  type="button"
                  disabled={obs.channelAction !== null || anotherOperatorActive || hasService}
                  onClick={() => {
                    obs.onConfirmRotateChange(false);
                    obs.onRotateChannel();
                  }}
                >
                  {obs.channelAction === "rotate" ? t("common.replacing") : t("liveOutputs.replaceObs")}
                </button>
              </span>
            ) : (
              <button className="dangerOutlineButton" type="button" disabled={anotherOperatorActive || hasService} onClick={() => obs.onConfirmRotateChange(true)}>
                {t("common.replaceEllipsis")}
              </button>
            )}
          </div>
        </SettingGroup>
      ) : null}
    </>
  );
}
