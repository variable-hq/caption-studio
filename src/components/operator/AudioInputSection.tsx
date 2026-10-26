"use client";

import { AudioLevelMeter } from "@/components/operator/AudioLevelMeter";
import { SettingGroup } from "@/components/operator/SettingsParts";
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
  return (
    <SettingGroup
      title="Microphone"
      hint="Choose the input that hears the preacher, press Test, and speak: the bar should reach the middle. The test stays on this computer."
    >
      {microphoneError ? (
        <p className="operatorBanner" data-tone="bad" role="alert">
          {microphoneError} Click the microphone icon in the browser’s address bar, choose Allow, then test again.
        </p>
      ) : null}
      <label>
        <span className="visuallyHidden">Microphone or audio interface</span>
        <select
          name="microphone"
          autoComplete="off"
          value={selectedDeviceId}
          disabled={disabled}
          onChange={(event) => onDeviceChange(event.target.value)}
        >
          {devices.length === 0 ? (
            <option value="">Test the microphone to see the list</option>
          ) : (
            devices.map((device, index) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || `Audio input ${index + 1}`}
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
          {microphoneState === "active" ? "Microphone connected" : microphoneState === "requesting" ? "Asking…" : "Test the microphone"}
        </button>
      </div>
    </SettingGroup>
  );
}
