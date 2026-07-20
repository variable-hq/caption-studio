"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import type { LanguageLocale, SourceLanguage } from "@/domain/languages";
import { chooseAudioInputDevice } from "@/live/audio-devices";
import { parseGlossaryInput, parseModerationInput, preferredTermMap } from "@/live/config";
import {
  AUDIO_CHUNK_MS,
  MAX_LIVE_SESSION_MS,
  normalizeCaptionStyle,
  type CaptionStyle,
  type LiveSessionDetails,
  type LiveSessionState,
  type PublicCaptionEvent,
} from "@/live/contracts";
import { LiveSessionClient } from "@/live/session-client";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { keywordHints } from "@/pipeline/glossary";

interface LiveCaptionSettings {
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  keywordText: string;
  filterText: string;
  style: CaptionStyle;
}

const INITIAL_LIVE_STATE: LiveSessionState = {
  status: "idle",
  message: "Configure the service, then start a caption session.",
  sequence: 0,
  droppedChunks: 0,
  transcriptionRequests: 0,
  sessionStartedAt: null,
  latestSourceText: "",
  latestPublicText: "",
  lastLatencyMs: null,
  session: null,
};

const RECORDER_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function recorderOptions() {
  const mimeType = RECORDER_TYPES.find((value) => MediaRecorder.isTypeSupported(value));
  return mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined;
}

export function useLiveCaptionSession(settings: LiveCaptionSettings) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [microphoneState, setMicrophoneState] = useState<
    "idle" | "requesting" | "active" | "error"
  >("idle");
  const [microphoneError, setMicrophoneError] = useState("");
  const [level, setLevel] = useState(0);
  const [liveState, setLiveState] = useState<LiveSessionState>(INITIAL_LIVE_STATE);

  const settingsRef = useRef(settings);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderTimerRef = useRef<number | null>(null);
  const queueRef = useRef<Blob[]>([]);
  const processingRef = useRef(false);
  const activeRef = useRef(false);
  const endingRef = useRef(false);
  const sessionRef = useRef<LiveSessionDetails | null>(null);
  const recentContextRef = useRef<string[]>([]);
  const sequenceRef = useRef(0);
  const sessionTimerRef = useRef<number | null>(null);
  const cloudClientRef = useRef(new CloudProviderClient());
  const liveClientRef = useRef(new LiveSessionClient());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!activeRef.current || !session) return;
    const style = normalizeCaptionStyle(settings.style);
    const timeout = window.setTimeout(() => {
      if (!activeRef.current || sessionRef.current?.sessionId !== session.sessionId) {
        return;
      }
      void liveClientRef.current.updateStyle(session.sessionId, style).catch((error) => {
        const message =
          error instanceof Error ? error.message : "Could not update the OBS style.";
        setLiveState((state) => ({ ...state, message }));
      });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [settings.style]);

  const stopMicrophone = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
        const message = error instanceof Error ? error.message : "Microphone access failed.";
        setMicrophoneState("error");
        setMicrophoneError(message);
        throw new Error(message);
      }
    },
    [refreshDevices, stopMicrophone],
  );

  const endSession = useCallback(
    async (message = "Caption session ended.", failed = false) => {
      if (endingRef.current) return;
      endingRef.current = true;
      activeRef.current = false;
      queueRef.current = [];
      if (sessionTimerRef.current !== null) {
        window.clearTimeout(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      if (recorderTimerRef.current !== null) {
        window.clearTimeout(recorderTimerRef.current);
        recorderTimerRef.current = null;
      }

      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        await liveClientRef.current.revoke(session.sessionId).catch(() => undefined);
      }
      stopMicrophone();
      setLiveState((current) => ({
        ...current,
        status: failed ? "error" : "idle",
        message,
        session: null,
      }));
      endingRef.current = false;
    },
    [stopMicrophone],
  );

  const processChunk = useCallback(
    async (audio: Blob) => {
      // This measures cloud processing after MediaRecorder completes a four-second chunk.
      // It intentionally excludes recording time and is not spoken-to-screen latency.
      const startedAt = performance.now();
      const current = settingsRef.current;
      const glossary = parseGlossaryInput(current.keywordText, current.targetLanguage);
      setLiveState((state) => ({
        ...state,
        transcriptionRequests: state.transcriptionRequests + 1,
      }));
      const segments = await cloudClientRef.current.transcribe({
        audio,
        sourceLanguage: current.sourceLanguage,
        keywordHints: keywordHints(glossary),
      });
      const finalSegments = segments.filter(({ isFinal, text }) => isFinal && text.trim());
      if (!finalSegments.length || !activeRef.current) return;

      const sourceText = finalSegments.map(({ text }) => text.trim()).join(" ");
      const detectedLanguage =
        current.sourceLanguage === "auto"
          ? finalSegments.find(({ detectedLanguage: locale }) => locale)?.detectedLanguage
          : current.sourceLanguage;
      if (!detectedLanguage) {
        throw new Error(
          "The spoken language could not be detected. Select it explicitly and restart.",
        );
      }

      const translation =
        detectedLanguage === current.targetLanguage
          ? { text: sourceText, providerLatencyMs: 0 }
          : await cloudClientRef.current.translate({
              text: sourceText,
              sourceLanguage: detectedLanguage,
              targetLanguage: current.targetLanguage,
              recentContext: recentContextRef.current,
              preferredTerms: preferredTermMap(glossary, current.targetLanguage),
            });
      if (!activeRef.current) return;

      const forms = prepareCaptionForms({
        sourceText,
        translatedText: translation.text,
        targetLanguage: current.targetLanguage,
        glossary,
        moderationRules: parseModerationInput(current.filterText),
      });
      sequenceRef.current += 1;
      const event: PublicCaptionEvent = {
        sequence: sequenceRef.current,
        publicText: forms.publicText,
        targetLanguage: current.targetLanguage,
        style: normalizeCaptionStyle(settingsRef.current.style),
        publishedAt: new Date().toISOString(),
      };
      const session = sessionRef.current;
      if (!session) return;
      await liveClientRef.current.publish(session.sessionId, event);

      recentContextRef.current = [...recentContextRef.current, sourceText].slice(-4);
      setLiveState((state) => ({
        ...state,
        message: forms.hiddenFromPublicDisplay
          ? "A filtered caption was hidden from the public overlay."
          : "Caption published to the OBS overlay.",
        sequence: event.sequence,
        latestSourceText: forms.protectedSourceText,
        latestPublicText: forms.publicText,
        lastLatencyMs: Math.round(performance.now() - startedAt),
      }));
    },
    [],
  );

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (activeRef.current && queueRef.current.length) {
        const chunk = queueRef.current.shift();
        if (!chunk) continue;
        try {
          await processChunk(chunk);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Caption processing failed.";
          if (/quota|expired|language could not be detected|authentication/i.test(message)) {
            await endSession(message, true);
            break;
          }
          setLiveState((state) => ({ ...state, status: "live", message }));
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [endSession, processChunk]);

  const enqueueChunk = useCallback(
    (chunk: Blob) => {
      if (!activeRef.current || chunk.size === 0) return;
      if (queueRef.current.length >= 2) {
        setLiveState((state) => ({
          ...state,
          droppedChunks: state.droppedChunks + 1,
          message: "Cloud processing is behind; one audio chunk was skipped.",
        }));
        return;
      }
      queueRef.current.push(chunk);
      void drainQueue();
    },
    [drainQueue],
  );

  const startSession = useCallback(async () => {
    if (activeRef.current || endingRef.current) return;
    setLiveState({ ...INITIAL_LIVE_STATE, status: "starting", message: "Verifying cloud AI…" });
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support live audio recording.");
      }
      await cloudClientRef.current.readiness();
      const stream = await ensureMicrophone(selectedDeviceId || undefined);
      const style = normalizeCaptionStyle(settingsRef.current.style);
      const session = await liveClientRef.current.create(style);
      sessionRef.current = session;
      recentContextRef.current = [];
      sequenceRef.current = 0;
      queueRef.current = [];
      activeRef.current = true;

      const startRecorderChunk = () => {
        if (!activeRef.current) return;
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, recorderOptions());
        recorderRef.current = recorder;
        recorder.ondataavailable = ({ data }) => {
          if (data.size) chunks.push(data);
        };
        recorder.onerror = () => {
          void endSession("The browser audio recorder stopped unexpectedly.", true);
        };
        recorder.onstop = () => {
          if (!activeRef.current) return;
          const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
          enqueueChunk(new Blob(chunks, { type: mimeType }));
          startRecorderChunk();
        };
        recorder.start();
        recorderTimerRef.current = window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, AUDIO_CHUNK_MS);
      };
      startRecorderChunk();
      sessionTimerRef.current = window.setTimeout(() => {
        void endSession(
          "The 90-minute free-tier session limit was reached. Start a new session if needed.",
        );
      }, Math.min(MAX_LIVE_SESSION_MS, new Date(session.expiresAt).getTime() - Date.now()));
      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "live",
        message: "Listening. The first caption appears after the first audio chunk.",
        sessionStartedAt: new Date(
          new Date(session.expiresAt).getTime() - MAX_LIVE_SESSION_MS,
        ).toISOString(),
        session,
      });
    } catch (error) {
      activeRef.current = false;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        await liveClientRef.current.revoke(session.sessionId).catch(() => undefined);
      }
      stopMicrophone();
      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "error",
        message: error instanceof Error ? error.message : "Caption session could not start.",
      });
    }
  }, [endSession, enqueueChunk, ensureMicrophone, selectedDeviceId, stopMicrophone]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const liveClient = liveClientRef.current;
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      activeRef.current = false;
      if (recorderTimerRef.current !== null) {
        window.clearTimeout(recorderTimerRef.current);
      }
      if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
      const session = sessionRef.current;
      if (session) void liveClient.revoke(session.sessionId);
      stopMicrophone();
    };
  }, [refreshDevices, stopMicrophone]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId: chooseDevice,
    microphoneState,
    microphoneError,
    level,
    liveState,
    startAudioTest: () => ensureMicrophone(selectedDeviceId || undefined),
    startSession,
    stopSession: () => endSession(),
  };
}
