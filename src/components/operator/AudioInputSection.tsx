"use client";

import { AudioLevelMeter } from "@/components/operator/AudioLevelMeter";
import { SettingGroup } from "@/components/operator/SettingsParts";
import { useT } from "@/i18n/provider";
import type { MicrophoneState } from "@/live/use-microphone-input";

interface AudioInputSectionProps {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  disabled: boolean;
  microphoneState: MicrophoneState;
  microphoneError: string;
  level: number;
  onStartAudioTest: () => void;
}

/** Microphone/audio-interface selection, level meter, and the local (no-AI-calls) audio test. */
export function AudioInputSection({
  devices,
  selectedDeviceId,
  onDeviceChange,
  disabled,
  microphoneState,
  microphoneError,
  level,
  onStartAudioTest,
}: AudioInputSectionProps) {
  const t = useT();
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
        <button
          type="button"
          className="secondaryButton"
          onClick={onStartAudioTest}
          disabled={microphoneState === "active" || microphoneState === "requesting" || disabled}
        >
          {microphoneState === "active" ? t("audio.connected") : microphoneState === "requesting" ? t("audio.asking") : t("audio.test")}
        </button>
      </div>
    </SettingGroup>
  );
}
