"use client";

import { useEffect } from "react";

import { AudioLevelMeter } from "@/components/operator/AudioLevelMeter";
import { SettingGroup } from "@/components/operator/SettingsParts";
import { useT } from "@/i18n/provider";
import type { MicTestClipApi } from "@/live/mic-test-clip";

interface AudioInputSectionProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  disabled: boolean;
  microphoneError: string;
  level: number;
  micTest: MicTestClipApi;
}

/** Microphone/audio-interface selection, level meter, and the local (no-AI-calls) audio test. */
export function AudioInputSection({
  devices,
  selectedDeviceId,
  onDeviceChange,
  disabled,
  microphoneError,
  level,
  micTest,
}: AudioInputSectionProps) {
  const t = useT();
  const { state, playbackAvailable } = micTest.snapshot;
  const discard = micTest.discard;
  useEffect(() => () => discard(), [discard]);

  return (
    <SettingGroup
      title={t("audio.title")}
      hint={t("audio.hint")}
    >
      {microphoneError ? (
        <p className="operatorBanner" data-tone="bad" role="alert">
          {t("audio.permissionHint", { detail: microphoneError })}
        </p>
      ) : null}
      <label>
        <span className="visuallyHidden">{t("audio.deviceLabel")}</span>
        <select
          name="microphone"
          autoComplete="off"
          value={selectedDeviceId}
          disabled={disabled}
          onChange={(event) => onDeviceChange(event.target.value)}
        >
          {devices.length === 0 ? (
            <option value="">{t("audio.emptyDevices")}</option>
          ) : (
            devices.map((device, index) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || t("audio.inputNumber", { number: index + 1 })}
              </option>
            ))
          )}
        </select>
      </label>
      <AudioLevelMeter level={level} />
      <div className="buttonRow">
        {state === "ready" || state === "playing" ? (
          <>
            <button type="button" className="secondaryButton" onClick={micTest.togglePlayback}>
              {state === "playing" ? t("audio.stopPlayback") : t("audio.playRecording")}
            </button>
            <button
              type="button"
              className="secondaryButton"
              onClick={() => { void micTest.start(); }}
              disabled={disabled}
            >
              {t("audio.testAgain")}
            </button>
          </>
        ) : state === "recording" ? (
          <button type="button" className="secondaryButton" onClick={micTest.stopRecording}>
            {t("audio.stopRecording")}
          </button>
        ) : (
          <button
            type="button"
            className="secondaryButton"
            onClick={() => { void micTest.start(); }}
            disabled={state === "asking" || disabled}
          >
            {state === "asking" ? t("audio.asking") : t("audio.test")}
          </button>
        )}
      </div>
      {state === "recording" ? (
        <p className="operatorHint" role="status">{t("audio.recording")}</p>
      ) : null}
      {!playbackAvailable && state === "idle" ? (
        <p className="operatorHint" role="status">{t("audio.playbackUnavailable")}</p>
      ) : null}
    </SettingGroup>
  );
}
