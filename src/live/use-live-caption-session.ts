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
  type LiveSessionControlAction,
  type LiveSessionDetails,
  type LiveSessionState,
  type PublicCaptionEvent,
} from "@/live/contracts";
import { LiveSessionClient } from "@/live/session-client";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { keywordHints } from "@/pipeline/glossary";

interface LiveCaptionSettings {
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  keywordText: string;
  filterText: string;
  style: CaptionStyle;
}

interface QueuedChunk {
  audio: Blob;
  generation: number;
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
  const [controlAction, setControlAction] =
    useState<LiveSessionControlAction | null>(null);
  const [endRetryRequired, setEndRetryRequired] = useState(false);

  const settingsRef = useRef(settings);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderTimerRef = useRef<number | null>(null);
  const queueRef = useRef<QueuedChunk[]>([]);
  const processingRef = useRef(false);
  const captureAbortRef = useRef<AbortController | null>(null);
  const sessionActiveRef = useRef(false);
  const capturingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const serverPausedRef = useRef(false);
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
    if (!sessionActiveRef.current || !session) return;
    const style = normalizeCaptionStyle(settings.style);
    const timeout = window.setTimeout(() => {
      if (
        !sessionActiveRef.current ||
        sessionRef.current?.sessionId !== session.sessionId
      ) {
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

  const stopRecorder = useCallback(() => {
    if (recorderTimerRef.current !== null) {
      window.clearTimeout(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
  }, []);

  const stopCapture = useCallback(() => {
    capturingRef.current = false;
    captureGenerationRef.current += 1;
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    queueRef.current = [];
    stopRecorder();
    stopMicrophone();
  }, [stopMicrophone, stopRecorder]);

  const endSession = useCallback(
    async (message = "Caption session ended.", failed = false) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setControlAction(null);
      stopCapture();
      if (sessionTimerRef.current !== null) {
        window.clearTimeout(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }

      const session = sessionRef.current;
      if (!session) {
        sessionActiveRef.current = false;
        setEndRetryRequired(false);
        setLiveState((current) => ({
          ...current,
          status: failed ? "error" : "idle",
          message,
          session: null,
        }));
        endingRef.current = false;
        return;
      }

      setLiveState((current) => ({
        ...current,
        status: "ending",
        message: "Ending the caption session and revoking its OBS URL…",
      }));
      try {
        await liveClientRef.current.revoke(session.sessionId);
        sessionRef.current = null;
        sessionActiveRef.current = false;
        serverPausedRef.current = false;
        setEndRetryRequired(false);
        setLiveState((current) => ({
          ...current,
          status: failed ? "error" : "idle",
          message,
          latestSourceText: "",
          latestPublicText: "",
          session: null,
        }));
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "The OBS URL could not be revoked.";
        setEndRetryRequired(true);
        setLiveState((current) => ({
          ...current,
          status: "error",
          message: `Audio stopped, but OBS revocation was not confirmed. Retry end. ${detail}`,
          session,
        }));
      } finally {
        endingRef.current = false;
      }
    },
    [stopCapture],
  );

  const processChunk = useCallback(
    async (audio: Blob, generation: number) => {
      const isCurrentCapture = () =>
        sessionActiveRef.current &&
        capturingRef.current &&
        generation === captureGenerationRef.current;
      if (!isCurrentCapture()) return;

      // This measures cloud processing after MediaRecorder completes a four-second chunk.
      // It intentionally excludes recording time and is not spoken-to-screen latency.
      const startedAt = performance.now();
      const current = settingsRef.current;
      const signal = captureAbortRef.current?.signal;
      if (!signal) return;
      const glossary = parseGlossaryInput(current.keywordText, current.targetLanguage);
      setLiveState((state) => ({
        ...state,
        transcriptionRequests: state.transcriptionRequests + 1,
      }));
      const segments = await cloudClientRef.current.transcribe({
        audio,
        sourceLanguage: current.sourceLanguage,
        keywordHints: keywordHints(glossary),
      }, signal);
      if (!isCurrentCapture()) return;

      const finalSegments = segments.filter(({ isFinal, text }) => isFinal && text.trim());
      if (!finalSegments.length) return;

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
          ? { text: sourceText }
          : await cloudClientRef.current.translate({
              text: sourceText,
              sourceLanguage: detectedLanguage,
              targetLanguage: current.targetLanguage,
              recentContext: recentContextRef.current,
              preferredTerms: preferredTermMap(glossary, current.targetLanguage),
            }, signal);
      if (!isCurrentCapture()) return;

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
      if (!session || !isCurrentCapture()) return;
      await liveClientRef.current.publish(session.sessionId, event);
      if (!isCurrentCapture()) return;

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
      while (sessionActiveRef.current && capturingRef.current && queueRef.current.length) {
        const chunk = queueRef.current.shift();
        if (!chunk) continue;
        try {
          await processChunk(chunk.audio, chunk.generation);
        } catch (error) {
          if (
            !capturingRef.current ||
            chunk.generation !== captureGenerationRef.current
          ) {
            continue;
          }
          const message =
            error instanceof Error ? error.message : "Caption processing failed.";
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
    (audio: Blob, generation: number) => {
      if (
        !sessionActiveRef.current ||
        !capturingRef.current ||
        generation !== captureGenerationRef.current ||
        audio.size === 0
      ) {
        return;
      }
      if (queueRef.current.length >= 2) {
        setLiveState((state) => ({
          ...state,
          droppedChunks: state.droppedChunks + 1,
          message: "Cloud processing is behind; one audio chunk was skipped.",
        }));
        return;
      }
      queueRef.current.push({ audio, generation });
      void drainQueue();
    },
    [drainQueue],
  );

  const startRecorder = useCallback(
    (stream: MediaStream, generation: number) => {
      const startRecorderChunk = () => {
        if (
          !sessionActiveRef.current ||
          !capturingRef.current ||
          generation !== captureGenerationRef.current
        ) {
          return;
        }
        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(stream, recorderOptions());
        recorderRef.current = recorder;
        recorder.ondataavailable = ({ data }) => {
          if (data.size) chunks.push(data);
        };
        recorder.onerror = () => {
          if (generation === captureGenerationRef.current) {
            void endSession("The browser audio recorder stopped unexpectedly.", true);
          }
        };
        recorder.onstop = () => {
          if (recorderRef.current === recorder) recorderRef.current = null;
          if (
            !sessionActiveRef.current ||
            !capturingRef.current ||
            generation !== captureGenerationRef.current
          ) {
            return;
          }
          const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
          enqueueChunk(new Blob(chunks, { type: mimeType }), generation);
          startRecorderChunk();
        };
        recorder.start();
        recorderTimerRef.current = window.setTimeout(() => {
          recorderTimerRef.current = null;
          if (recorder.state === "recording") recorder.stop();
        }, AUDIO_CHUNK_MS);
      };
      startRecorderChunk();
    },
    [endSession, enqueueChunk],
  );

  const startSession = useCallback(async () => {
    if (sessionActiveRef.current || endingRef.current) return;
    setEndRetryRequired(false);
    setLiveState({
      ...INITIAL_LIVE_STATE,
      status: "starting",
      message: "Verifying cloud AI…",
    });
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support live audio recording.");
      }
      await cloudClientRef.current.readiness();
      const stream = await ensureMicrophone(selectedDeviceId || undefined);
      const style = normalizeCaptionStyle(settingsRef.current.style);
      const session = await liveClientRef.current.create(style);
      sessionRef.current = session;
      sessionActiveRef.current = true;
      serverPausedRef.current = false;
      recentContextRef.current = [];
      sequenceRef.current = 0;
      queueRef.current = [];
      captureGenerationRef.current += 1;
      const generation = captureGenerationRef.current;
      captureAbortRef.current = new AbortController();
      capturingRef.current = true;
      startRecorder(stream, generation);
      sessionTimerRef.current = window.setTimeout(() => {
        void endSession(
          "The 90-minute free-tier session limit was reached. Start a new session if needed.",
          true,
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
      stopCapture();
      const session = sessionRef.current;
      sessionRef.current = null;
      sessionActiveRef.current = false;
      if (session) {
        await liveClientRef.current.revoke(session.sessionId).catch(() => undefined);
      }
      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "error",
        message: error instanceof Error ? error.message : "Caption session could not start.",
      });
    }
  }, [endSession, ensureMicrophone, selectedDeviceId, startRecorder, stopCapture]);

  const pauseSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || endingRef.current || serverPausedRef.current) return;
    setControlAction("pause");
    setLiveState((state) => ({
      ...state,
      status: "pausing",
      message: "Stopping audio and clearing the OBS caption…",
    }));
    stopCapture();
    try {
      await liveClientRef.current.control(session.sessionId, "pause");
      serverPausedRef.current = true;
      setLiveState((state) => ({
        ...state,
        status: "paused",
        message: "Paused. Audio and cloud AI are stopped; the OBS URL remains active.",
        latestSourceText: "",
        latestPublicText: "",
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The OBS caption could not be cleared.";
      setLiveState((state) => ({
        ...state,
        status: "error",
        message: `Audio stopped, but server pause was not confirmed. Retry pause or end the session. ${message}`,
      }));
    } finally {
      setControlAction(null);
    }
  }, [stopCapture]);

  const resumeSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || endingRef.current || !serverPausedRef.current) return;
    setControlAction("resume");
    setLiveState((state) => ({
      ...state,
      status: "resuming",
      message: "Reopening the selected audio input…",
    }));
    let serverResumed = false;
    try {
      if (typeof MediaRecorder === "undefined") {
        throw new Error("This browser does not support live audio recording.");
      }
      const stream = await ensureMicrophone(selectedDeviceId || undefined);
      await liveClientRef.current.control(session.sessionId, "resume");
      serverResumed = true;
      serverPausedRef.current = false;
      captureGenerationRef.current += 1;
      const generation = captureGenerationRef.current;
      captureAbortRef.current = new AbortController();
      capturingRef.current = true;
      queueRef.current = [];
      startRecorder(stream, generation);
      setLiveState((state) => ({
        ...state,
        status: "live",
        message: "Listening again. The OBS URL and session expiry are unchanged.",
        latestSourceText: "",
        latestPublicText: "",
      }));
    } catch (error) {
      stopCapture();
      if (serverResumed) {
        try {
          await liveClientRef.current.control(session.sessionId, "pause");
          serverPausedRef.current = true;
        } catch {
          serverPausedRef.current = false;
        }
      }
      const message = error instanceof Error ? error.message : "Capture could not resume.";
      setLiveState((state) => ({
        ...state,
        status: serverPausedRef.current ? "paused" : "error",
        message: serverPausedRef.current
          ? `Still paused. ${message}`
          : `Audio is stopped, but server pause was not confirmed. Retry pause or end the session. ${message}`,
      }));
    } finally {
      setControlAction(null);
    }
  }, [ensureMicrophone, selectedDeviceId, startRecorder, stopCapture]);

  const clearCaption = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || endingRef.current) return;
    setControlAction("clear");
    try {
      await liveClientRef.current.control(session.sessionId, "clear");
      setLiveState((state) => ({
        ...state,
        message: state.status === "paused"
          ? "Paused. The OBS caption is clear."
          : "The OBS caption was cleared. The next live caption can replace it.",
        latestSourceText: "",
        latestPublicText: "",
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The OBS caption could not be cleared.";
      setLiveState((state) => ({ ...state, message }));
    } finally {
      setControlAction(null);
    }
  }, []);

  const showTestCaption = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !serverPausedRef.current || endingRef.current) return;
    setControlAction("show-test");
    try {
      const current = settingsRef.current;
      const response = await liveClientRef.current.control(
        session.sessionId,
        "show-test",
        {
          targetLanguage: current.targetLanguage,
          style: normalizeCaptionStyle(current.style),
        },
      );
      if (typeof response.sequence === "number") {
        sequenceRef.current = Math.max(sequenceRef.current, response.sequence);
      }
      setLiveState((state) => ({
        ...state,
        message: "Synthetic test caption shown. Resume clears it before live audio restarts.",
        sequence: response.sequence ?? state.sequence,
        latestSourceText: "",
        latestPublicText: SAMPLE_CAPTIONS[current.targetLanguage],
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The test caption could not be shown.";
      setLiveState((state) => ({ ...state, message }));
    } finally {
      setControlAction(null);
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const liveClient = liveClientRef.current;
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      sessionActiveRef.current = false;
      capturingRef.current = false;
      captureGenerationRef.current += 1;
      queueRef.current = [];
      stopRecorder();
      const session = sessionRef.current;
      if (session) void liveClient.revoke(session.sessionId);
      stopMicrophone();
    };
  }, [refreshDevices, stopMicrophone, stopRecorder]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId: chooseDevice,
    microphoneState,
    microphoneError,
    level,
    liveState,
    controlAction,
    endRetryRequired,
    startAudioTest: () => ensureMicrophone(selectedDeviceId || undefined),
    startSession,
    pauseSession,
    resumeSession,
    clearCaption,
    showTestCaption,
    stopSession: () => endSession(),
  };
}
