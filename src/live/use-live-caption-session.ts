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
  type LiveServiceDetails,
  type LiveSessionControlAction,
  type LiveSessionState,
  type PublicCaptionRequest,
} from "@/live/contracts";
import { LiveApiError, LiveSessionClient } from "@/live/session-client";
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

const CONTROLLER_STORAGE_KEY = "church-live-caption:main-controller:v1";

const INITIAL_LIVE_STATE: LiveSessionState = {
  status: "loading-channel",
  message: "Loading the Main OBS channel…",
  sequence: 0,
  droppedChunks: 0,
  transcriptionRequests: 0,
  latestSourceText: "",
  latestPublicText: "",
  lastLatencyMs: null,
  channel: null,
  service: null,
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

function isControllerReplaced(error: unknown) {
  return error instanceof LiveApiError && error.code === "controller_replaced";
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
  const [channelAction, setChannelAction] = useState<
    "create" | "rotate" | "save-style" | null
  >(null);
  const [endRetryRequired, setEndRetryRequired] = useState(false);
  const [takeoverRequired, setTakeoverRequired] = useState(false);
  const [rotationRecoveryRequired, setRotationRecoveryRequired] = useState(false);

  const settingsRef = useRef(settings);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderTimerRef = useRef<number | null>(null);
  const queueRef = useRef<QueuedChunk[]>([]);
  const processingRef = useRef(false);
  const captureAbortRef = useRef<AbortController | null>(null);
  const capturingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const endingRef = useRef(false);
  const serviceRef = useRef<LiveServiceDetails | null>(null);
  const recentContextRef = useRef<string[]>([]);
  const sessionTimerRef = useRef<number | null>(null);
  const cloudClientRef = useRef(new CloudProviderClient());
  const liveClientRef = useRef(new LiveSessionClient());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

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

  const clearServiceTimer = useCallback(() => {
    if (sessionTimerRef.current !== null) {
      window.clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  const handleTakenOver = useCallback(
    (message = "Control of the Main channel moved to another operator.") => {
      stopCapture();
      clearServiceTimer();
      window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
      serviceRef.current = null;
      setEndRetryRequired(false);
      setTakeoverRequired(false);
      setControlAction(null);
      setLiveState((current) => ({
        ...current,
        status: "taken-over",
        message,
        latestSourceText: "",
        latestPublicText: "",
        service: null,
        channel: current.channel
          ? { ...current.channel, status: "live" }
          : current.channel,
      }));
    },
    [clearServiceTimer, stopCapture],
  );

  const endService = useCallback(
    async (message = "Live service ended. The reusable OBS URL is ready for next time.", failed = false) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setControlAction(null);
      stopCapture();
      clearServiceTimer();
      const service = serviceRef.current;
      if (!service) {
        setLiveState((current) => ({
          ...current,
          status: failed ? "error" : "idle",
          message,
          service: null,
        }));
        endingRef.current = false;
        return;
      }

      setLiveState((current) => ({
        ...current,
        status: "ending",
        message: "Ending the live service and clearing OBS…",
      }));
      try {
        await liveClientRef.current.endService(service.controllerToken);
        window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
        serviceRef.current = null;
        setEndRetryRequired(false);
        setLiveState((current) => ({
          ...current,
          status: failed ? "error" : "idle",
          message,
          latestSourceText: "",
          latestPublicText: "",
          service: null,
          channel: current.channel
            ? {
                ...current.channel,
                status: "idle",
                startedAt: null,
                expiresAt: null,
              }
            : current.channel,
        }));
      } catch (error) {
        if (isControllerReplaced(error)) {
          handleTakenOver();
        } else {
          const detail =
            error instanceof Error ? error.message : "Service deactivation failed.";
          setEndRetryRequired(true);
          setLiveState((current) => ({
            ...current,
            status: "error",
            message: `Audio stopped, but service deactivation was not confirmed. Retry End. ${detail}`,
            service,
          }));
        }
      } finally {
        endingRef.current = false;
      }
    },
    [clearServiceTimer, handleTakenOver, stopCapture],
  );

  const processChunk = useCallback(
    async (audio: Blob, generation: number) => {
      const isCurrentCapture = () =>
        Boolean(serviceRef.current) &&
        capturingRef.current &&
        generation === captureGenerationRef.current;
      if (!isCurrentCapture()) return;

      // Cloud latency starts after a four-second MediaRecorder chunk completes.
      const startedAt = performance.now();
      const current = settingsRef.current;
      const signal = captureAbortRef.current?.signal;
      if (!signal) return;
      const serviceAtStart = serviceRef.current;
      if (!serviceAtStart) return;
      // Check the controller immediately before paid-capable provider work. A takeover
      // therefore stops the displaced tab before its next transcription request.
      const lease = await liveClientRef.current.validateController(
        serviceAtStart.controllerToken,
      );
      if (!isCurrentCapture()) return;
      const glossary = parseGlossaryInput(current.keywordText, current.targetLanguage);
      setLiveState((state) => ({
        ...state,
        transcriptionRequests: lease.transcriptionRequests,
      }));
      const segments = await cloudClientRef.current.transcribe(
        {
          audio,
          sourceLanguage: current.sourceLanguage,
          keywordHints: keywordHints(glossary),
        },
        signal,
      );
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
          : await cloudClientRef.current.translate(
              {
                text: sourceText,
                sourceLanguage: detectedLanguage,
                targetLanguage: current.targetLanguage,
                recentContext: recentContextRef.current,
                preferredTerms: preferredTermMap(glossary, current.targetLanguage),
              },
              signal,
            );
      if (!isCurrentCapture()) return;

      const forms = prepareCaptionForms({
        sourceText,
        translatedText: translation.text,
        targetLanguage: current.targetLanguage,
        glossary,
        moderationRules: parseModerationInput(current.filterText),
      });
      const event: PublicCaptionRequest = {
        publicText: forms.publicText,
        targetLanguage: current.targetLanguage,
        style: normalizeCaptionStyle(settingsRef.current.style),
      };
      const service = serviceRef.current;
      if (!service || !isCurrentCapture()) return;
      const published = await liveClientRef.current.publish(
        service.controllerToken,
        event,
      );
      if (!isCurrentCapture()) return;

      recentContextRef.current = [...recentContextRef.current, sourceText].slice(-4);
      setLiveState((state) => ({
        ...state,
        message: forms.hiddenFromPublicDisplay
          ? "A filtered caption was hidden from the public overlay."
          : "Caption published to the OBS overlay.",
        sequence: published.sequence,
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
      while (serviceRef.current && capturingRef.current && queueRef.current.length) {
        const chunk = queueRef.current.shift();
        if (!chunk) continue;
        try {
          await processChunk(chunk.audio, chunk.generation);
        } catch (error) {
          if (!capturingRef.current || chunk.generation !== captureGenerationRef.current) {
            continue;
          }
          if (isControllerReplaced(error)) {
            handleTakenOver();
            break;
          }
          const message =
            error instanceof Error ? error.message : "Caption processing failed.";
          if (
            (error instanceof LiveApiError &&
              error.code === "transcription_limit_reached") ||
            /quota|expired|event limit|language could not be detected|authentication/i.test(
              message,
            )
          ) {
            await endService(message, true);
            break;
          }
          setLiveState((state) => ({ ...state, status: "live", message }));
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [endService, handleTakenOver, processChunk]);

  const enqueueChunk = useCallback(
    (audio: Blob, generation: number) => {
      if (
        !serviceRef.current ||
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
          !serviceRef.current ||
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
            void endService("The browser audio recorder stopped unexpectedly.", true);
          }
        };
        recorder.onstop = () => {
          if (recorderRef.current === recorder) recorderRef.current = null;
          if (
            !serviceRef.current ||
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
    [endService, enqueueChunk],
  );

  const armServiceTimer = useCallback(
    (service: LiveServiceDetails) => {
      clearServiceTimer();
      sessionTimerRef.current = window.setTimeout(() => {
        void endService(
          "The 90-minute free-tier service limit was reached. The reusable OBS URL remains ready.",
          true,
        );
      }, Math.min(MAX_LIVE_SESSION_MS, new Date(service.expiresAt).getTime() - Date.now()));
    },
    [clearServiceTimer, endService],
  );

  const loadChannel = useCallback(async () => {
    setLiveState((current) => ({
      ...current,
      status: "loading-channel",
      message: "Loading the Main OBS channel…",
    }));
    try {
      const channel = await liveClientRef.current.getChannel();
      setRotationRecoveryRequired(false);
      const storedController = window.sessionStorage.getItem(CONTROLLER_STORAGE_KEY);
      if (
        channel.configured &&
        (channel.status === "live" || channel.status === "paused") &&
        storedController &&
        channel.startedAt &&
        channel.expiresAt
      ) {
        try {
          await liveClientRef.current.control(
            channel.status === "live" ? "pause" : "clear",
            storedController,
          );
          const recovered: LiveServiceDetails = {
            channelId: channel.channelId,
            controllerToken: storedController,
            startedAt: channel.startedAt,
            expiresAt: channel.expiresAt,
          };
          serviceRef.current = recovered;
          armServiceTimer(recovered);
          setLiveState({
            ...INITIAL_LIVE_STATE,
            status: "paused",
            message: "Recovered this operator tab in a safe paused state.",
            channel: { ...channel, status: "paused" },
            service: recovered,
            transcriptionRequests: channel.transcriptionRequests,
          });
          return;
        } catch {
          window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
        }
      } else if (channel.status === "idle") {
        window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
      }

      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "idle",
        message: channel.configured
          ? channel.status === "idle"
            ? "Main OBS channel ready. Complete setup, then start captions."
            : "The Main channel is currently controlled by another operator."
          : "Create the Main OBS channel, then add its reusable URL to OBS.",
        channel,
        transcriptionRequests: channel.transcriptionRequests,
      });
    } catch (error) {
      setRotationRecoveryRequired(
        error instanceof LiveApiError && error.code === "invalid_overlay_key",
      );
      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "error",
        message: error instanceof Error ? error.message : "The Main channel could not load.",
      });
    }
  }, [armServiceTimer]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const service = serviceRef.current;
    if (!service) return;
    const style = normalizeCaptionStyle(settings.style);
    const timeout = window.setTimeout(() => {
      if (serviceRef.current?.controllerToken !== service.controllerToken) return;
      void liveClientRef.current
        .updateStyle(style, service.controllerToken)
        .catch((error) => {
          if (isControllerReplaced(error)) {
            handleTakenOver();
            return;
          }
          setLiveState((state) => ({
            ...state,
            message: error instanceof Error ? error.message : "OBS style update failed.",
          }));
        });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [handleTakenOver, settings.style]);

  const createChannel = useCallback(async () => {
    if (channelAction) return;
    setChannelAction("create");
    try {
      const channel = await liveClientRef.current.createChannel(
        normalizeCaptionStyle(settingsRef.current.style),
      );
      setRotationRecoveryRequired(false);
      setLiveState((current) => ({
        ...current,
        status: "idle",
        message: "Main OBS channel created. Copy the URL into OBS and show a test caption.",
        channel,
      }));
    } catch (error) {
      setLiveState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "OBS channel creation failed.",
      }));
    } finally {
      setChannelAction(null);
    }
  }, [channelAction]);

  const rotateChannel = useCallback(async () => {
    if (channelAction || serviceRef.current) return;
    setChannelAction("rotate");
    try {
      const channel = await liveClientRef.current.rotateChannel();
      setRotationRecoveryRequired(false);
      setLiveState((current) => ({
        ...current,
        status: "idle",
        message: "OBS URL rotated. Replace the old Browser Source URL in OBS.",
        latestPublicText: "",
        channel,
      }));
    } catch (error) {
      setLiveState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : "OBS URL rotation failed.",
      }));
    } finally {
      setChannelAction(null);
    }
  }, [channelAction]);

  const saveChannelStyle = useCallback(async () => {
    if (!liveState.channel?.configured || channelAction) return;
    setChannelAction("save-style");
    try {
      const service = serviceRef.current;
      const style = normalizeCaptionStyle(settingsRef.current.style);
      await liveClientRef.current.updateStyle(style, service?.controllerToken);
      setLiveState((current) => ({
        ...current,
        message: "Caption appearance saved to the shared Main channel.",
        channel: current.channel ? { ...current.channel, style } : current.channel,
      }));
    } catch (error) {
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message: error instanceof Error ? error.message : "Caption style save failed.",
        }));
      }
    } finally {
      setChannelAction(null);
    }
  }, [channelAction, handleTakenOver, liveState.channel?.configured]);

  const startSession = useCallback(
    async (takeover = false) => {
      if (serviceRef.current || endingRef.current) return;
      setEndRetryRequired(false);
      setTakeoverRequired(false);
      setLiveState((current) => ({
        ...current,
        status: "starting",
        message: takeover ? "Taking control of the Main channel…" : "Verifying cloud AI…",
        sequence: 0,
        droppedChunks: 0,
        transcriptionRequests: 0,
        latestSourceText: "",
        latestPublicText: "",
        lastLatencyMs: null,
      }));
      try {
        if (!liveState.channel?.configured) {
          throw new Error("Create the Main OBS channel before starting captions.");
        }
        if (typeof MediaRecorder === "undefined") {
          throw new Error("This browser does not support live audio recording.");
        }
        await cloudClientRef.current.readiness();
        const stream = await ensureMicrophone(selectedDeviceId || undefined);
        const service = await liveClientRef.current.startService(
          normalizeCaptionStyle(settingsRef.current.style),
          takeover,
        );
        serviceRef.current = service;
        window.sessionStorage.setItem(
          CONTROLLER_STORAGE_KEY,
          service.controllerToken,
        );
        recentContextRef.current = [];
        queueRef.current = [];
        captureGenerationRef.current += 1;
        const generation = captureGenerationRef.current;
        captureAbortRef.current = new AbortController();
        capturingRef.current = true;
        startRecorder(stream, generation);
        armServiceTimer(service);
        setLiveState((current) => ({
          ...current,
          status: "live",
          message: takeover
            ? "Takeover complete. Listening for the next caption."
            : "Listening. The first caption appears after the first audio chunk.",
          service,
          channel: current.channel
            ? {
                ...current.channel,
                status: "live",
                startedAt: service.startedAt,
                expiresAt: service.expiresAt,
              }
            : current.channel,
        }));
      } catch (error) {
        if (error instanceof LiveApiError && error.code === "channel_in_use") {
          stopMicrophone();
          setTakeoverRequired(true);
          setLiveState((current) => ({
            ...current,
            status: "idle",
            message: "Another operator is live. Confirm takeover only if you intend to replace them.",
            channel: current.channel
              ? {
                  ...current.channel,
                  status: "live",
                  expiresAt: error.expiresAt ?? current.channel.expiresAt,
                }
              : current.channel,
          }));
          return;
        }
        stopMicrophone();
        setLiveState((current) => ({
          ...current,
          status: "error",
          message: error instanceof Error ? error.message : "Live service could not start.",
        }));
      }
    },
    [
      armServiceTimer,
      ensureMicrophone,
      liveState.channel?.configured,
      selectedDeviceId,
      startRecorder,
      stopMicrophone,
    ],
  );

  const pauseSession = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || endingRef.current || !capturingRef.current) return;
    setControlAction("pause");
    setLiveState((current) => ({
      ...current,
      status: "pausing",
      message: "Stopping capture and clearing OBS…",
    }));
    stopCapture();
    try {
      await liveClientRef.current.control("pause", service.controllerToken);
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message: "Paused. The URL and 90-minute expiry are unchanged.",
        latestSourceText: "",
        latestPublicText: "",
        channel: current.channel ? { ...current.channel, status: "paused" } : null,
      }));
    } catch (error) {
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          status: "error",
          message: `Audio stopped, but server pause was not confirmed. ${
            error instanceof Error ? error.message : "Retry Pause or End."
          }`,
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [handleTakenOver, stopCapture]);

  const resumeSession = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || endingRef.current) return;
    setControlAction("resume");
    setLiveState((current) => ({
      ...current,
      status: "resuming",
      message: "Reopening the selected audio input…",
    }));
    try {
      const stream = await ensureMicrophone(selectedDeviceId || undefined);
      await liveClientRef.current.control("resume", service.controllerToken);
      captureGenerationRef.current += 1;
      const generation = captureGenerationRef.current;
      captureAbortRef.current = new AbortController();
      capturingRef.current = true;
      queueRef.current = [];
      startRecorder(stream, generation);
      setLiveState((current) => ({
        ...current,
        status: "live",
        message: "Listening again. The reusable OBS URL and expiry are unchanged.",
        latestPublicText: "",
        channel: current.channel ? { ...current.channel, status: "live" } : null,
      }));
    } catch (error) {
      stopCapture();
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          status: "paused",
          message: `Still paused. ${
            error instanceof Error ? error.message : "Capture could not resume."
          }`,
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [ensureMicrophone, handleTakenOver, selectedDeviceId, startRecorder, stopCapture]);

  const clearCaption = useCallback(async () => {
    if (!liveState.channel?.configured || endingRef.current) return;
    setControlAction("clear");
    try {
      await liveClientRef.current.control(
        "clear",
        serviceRef.current?.controllerToken,
      );
      setLiveState((current) => ({
        ...current,
        message:
          current.status === "paused"
            ? "Paused. The OBS caption is clear."
            : "OBS is clear. The next valid caption may replace it.",
        latestSourceText: "",
        latestPublicText: "",
      }));
    } catch (error) {
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message: error instanceof Error ? error.message : "OBS could not be cleared.",
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [handleTakenOver, liveState.channel?.configured]);

  const showTestCaption = useCallback(async () => {
    if (!liveState.channel?.configured || liveState.status === "live") return;
    setControlAction("show-test");
    try {
      const current = settingsRef.current;
      const response = await liveClientRef.current.control(
        "show-test",
        serviceRef.current?.controllerToken,
        {
          targetLanguage: current.targetLanguage,
          style: normalizeCaptionStyle(current.style),
        },
      );
      setLiveState((state) => ({
        ...state,
        message:
          state.status === "paused"
            ? "Synthetic test shown. Resume clears it before live audio restarts."
            : "Synthetic test shown in the reusable OBS source.",
        sequence: response.sequence ?? state.sequence,
        latestSourceText: "",
        latestPublicText: SAMPLE_CAPTIONS[current.targetLanguage],
        channel: state.channel
          ? { ...state.channel, style: normalizeCaptionStyle(current.style) }
          : state.channel,
      }));
    } catch (error) {
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message: error instanceof Error ? error.message : "Test caption failed.",
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [handleTakenOver, liveState.channel?.configured, liveState.status]);

  useEffect(() => {
    const onPageHide = () => {
      const service = serviceRef.current;
      if (!service) return;
      stopCapture();
      void fetch("/api/live/channel/control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-caption-controller": service.controllerToken,
        },
        body: JSON.stringify({ action: "pause" }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [stopCapture]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      capturingRef.current = false;
      captureGenerationRef.current += 1;
      queueRef.current = [];
      stopRecorder();
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
    channelAction,
    endRetryRequired,
    takeoverRequired,
    rotationRecoveryRequired,
    cancelTakeover: () => setTakeoverRequired(false),
    startAudioTest: () => ensureMicrophone(selectedDeviceId || undefined),
    createChannel,
    rotateChannel,
    saveChannelStyle,
    startSession,
    pauseSession,
    resumeSession,
    clearCaption,
    showTestCaption,
    stopSession: () => endService(),
    reloadChannel: loadChannel,
  };
}
