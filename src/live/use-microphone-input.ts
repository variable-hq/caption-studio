"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { chooseAudioInputDevice } from "@/live/audio-devices";
import { microphoneErrorMessage } from "@/live/microphone-error";
import { useI18n } from "@/i18n/provider";

export type MicrophoneState = "idle" | "requesting" | "active" | "error";

/**
 * Owns browser microphone access end to end: device enumeration/selection, the live input
 * level meter, and the underlying `MediaStream`/`AudioContext`. Self-contained - unlike the
 * output buffer, nothing here calls back into the session lifecycle, so callers only ever
 * depend on this hook's outputs, never the reverse.
 *
 * `streamRef` is exposed because a couple of session-lifecycle paths (recovering the recorder
 * after a Clear) need direct access to the current stream, not just a snapshot from
 * `ensureMicrophone`'s return value.
 */
export function useMicrophoneInput() {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [microphoneError, setMicrophoneError] = useState("");
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rmsSamplesRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const animationRef = useRef<number | null>(null);

  const stopMicrophone = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;
    rmsSamplesRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setLevel(0);
    setMicrophoneState("idle");
  }, []);

  const refreshDevices = useCallback(async (activeDeviceId?: string) => {
    const availableDevices = await navigator.mediaDevices.enumerateDevices();
    const microphones = availableDevices.filter(({ kind }) => kind === "audioinput");
    setDevices(microphones);
    setSelectedDeviceId((current) =>
      chooseAudioInputDevice(microphones, current, activeDeviceId),
    );
  }, []);

  const chooseDevice = useCallback(
    (deviceId: string) => {
      if (streamRef.current) stopMicrophone();
      setSelectedDeviceId(deviceId);
    },
    [stopMicrophone],
  );

  const ensureMicrophone = useCallback(
    async (deviceId?: string) => {
      if (streamRef.current?.active) return streamRef.current;
      setMicrophoneState("requesting");
      setMicrophoneError("");
      stopMicrophone();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId
            ? {
                deviceId: { exact: deviceId },
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
              }
            : {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
              },
        });
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const samples = new Uint8Array(analyser.fftSize);
        analyserRef.current = analyser;
        rmsSamplesRef.current = new Float32Array(analyser.fftSize);
        const updateLevel = () => {
          analyser.getByteTimeDomainData(samples);
          const sumSquares = samples.reduce((sum, sample) => {
            const centered = (sample - 128) / 128;
            return sum + centered * centered;
          }, 0);
          setLevel(Math.min(1, Math.sqrt(sumSquares / samples.length) * 3));
          animationRef.current = requestAnimationFrame(updateLevel);
        };

        streamRef.current = stream;
        audioContextRef.current = audioContext;
        updateLevel();
        setMicrophoneState("active");
        await refreshDevices(stream.getAudioTracks()[0]?.getSettings().deviceId);
        return stream;
      } catch (error) {
        const message = microphoneErrorMessage(error, tRef.current);
        setMicrophoneState("error");
        setMicrophoneError(message);
        throw new Error(message);
      }
    },
    [refreshDevices, stopMicrophone],
  );

  const readLevel = useCallback(() => {
    const analyser = analyserRef.current;
    const samples = rmsSamplesRef.current;
    if (!analyser || !samples) return 0;
    analyser.getFloatTimeDomainData(samples);
    const sumSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / samples.length);
  }, []);

  return {
    devices,
    selectedDeviceId,
    chooseDevice,
    microphoneState,
    microphoneError,
    level,
    readLevel,
    streamRef,
    ensureMicrophone,
    stopMicrophone,
    refreshDevices,
  };
}
