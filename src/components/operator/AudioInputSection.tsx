"use client";

import { AudioLevelMeter } from "@/components/operator/AudioLevelMeter";
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
    <>
      <label>
        Microphone or audio interface
        <select
          value={selectedDeviceId}
          disabled={disabled}
          onChange={(event) => onDeviceChange(event.target.value)}
        >
          {devices.length === 0 ? (
            <option value="">Allow the microphone to see the list</option>
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
      <button
        className="secondaryButton"
        onClick={onStartAudioTest}
        disabled={microphoneState === "active" || microphoneState === "requesting" || disabled}
      >
        {microphoneState === "active" ? "Microphone connected" : "Test the microphone"}
      </button>
      <p className="helpText">
        Speak into the selected input and check that the meter moves. This test stays in the
        browser and makes no AI calls.
      </p>
      {microphoneError ? (
        <p className="errorText" role="alert">
          {microphoneError}
        </p>
      ) : null}
    </>
  );
}
