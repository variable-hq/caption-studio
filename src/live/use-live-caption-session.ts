"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CloudProviderClient } from "@/ai/cloud-provider-client";
import { chooseAudioInputDevice } from "@/live/audio-devices";
import { parseGlossaryInput, parseModerationInput, preferredTermMap } from "@/live/config";
import {
  DEFAULT_SPEECH_BUFFER_MS,
  MAX_LIVE_SESSION_MS,
  normalizeCaptionStyle,
  type CaptionStyle,
  type LiveServiceDetails,
  type LiveSessionControlAction,
  type LiveSessionState,
  type PublicCaptionRequest,
  type SpeechBufferMs,
} from "@/live/contracts";
import { LiveApiError, LiveSessionClient } from "@/live/session-client";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";
import {
  normalizeTranslationSessionSettings,
  parseStoredTranslationSessionSettings,
  serializeTranslationSessionSettings,
  translationSessionSnapshotMatches,
  type TranslationSessionSettings,
} from "@/live/translation-settings";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { keywordHints } from "@/pipeline/glossary";

interface LiveCaptionSettings extends TranslationSessionSettings {
  style: CaptionStyle;
}

interface QueuedChunk {
  audio: Blob;
  generation: number;
}

const CONTROLLER_STORAGE_KEY = "church-live-caption:main-controller:v1";
const VIEWER_STORAGE_KEY = "church-live-caption:main-viewer:v1";
const TRANSLATION_SETTINGS_STORAGE_KEY =
  "church-live-caption:active-translation-settings:v1";
const LEGACY_SPEECH_BUFFER_STORAGE_KEY =
  "church-live-caption:speech-buffer:v1";

function validStoredViewerUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === window.location.origin &&
      url.pathname === "/view" &&
      /^#main\.[A-Za-z0-9_-]{43}$/u.test(url.hash)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

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
  const [viewerAction, setViewerAction] = useState<"replace" | null>(null);
  const [endRetryRequired, setEndRetryRequired] = useState(false);
  const [takeoverRequired, setTakeoverRequired] = useState(false);
  const [rotationRecoveryRequired, setRotationRecoveryRequired] = useState(false);
  const [activeTranslationSettings, setActiveTranslationSettings] =
    useState<TranslationSessionSettings | null>(null);
  const [translationRefreshRequired, setTranslationRefreshRequired] =
    useState(false);

  const settingsRef = useRef(settings);
  const endRetryRequiredRef = useRef(false);
  const activeTranslationSettingsRef =
    useRef<TranslationSessionSettings | null>(null);
  const translationRefreshRequiredRef = useRef(false);
  const refreshShouldResumeRef = useRef(false);
  const translationRefreshRequestIdRef = useRef<string | null>(null);
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
  const loadGenerationRef = useRef(0);
  const recentContextRef = useRef<string[]>([]);
  const sessionTimerRef = useRef<number | null>(null);
  const lifecyclePauseRef = useRef(false);
  const speechBufferRef = useRef<SpeechBufferMs>(DEFAULT_SPEECH_BUFFER_MS);
  const cloudClientRef = useRef(new CloudProviderClient());
  const liveClientRef = useRef(new LiveSessionClient());

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const requireTranslationRefresh = useCallback((required: boolean) => {
    translationRefreshRequiredRef.current = required;
    setTranslationRefreshRequired(required);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("church-caption-state", {
        detail: {
          status: liveState.status,
          message: liveState.message,
          microphoneActive: microphoneState === "active",
        },
      }),
    );
  }, [liveState.message, liveState.status, microphoneState]);

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

  const stopTranslationCapture = useCallback(() => {
    capturingRef.current = false;
    captureGenerationRef.current += 1;
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    queueRef.current = [];
    stopRecorder();
  }, [stopRecorder]);

  const stopCapture = useCallback(() => {
    stopTranslationCapture();
    stopMicrophone();
  }, [stopMicrophone, stopTranslationCapture]);

  const clearServiceTimer = useCallback(() => {
    if (sessionTimerRef.current !== null) {
      window.clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  const handleTakenOver = useCallback(
    (message = "Control of the Main channel moved to another operator.") => {
      loadGenerationRef.current += 1;
      stopCapture();
      clearServiceTimer();
      window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
      window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
      window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
      window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
      serviceRef.current = null;
      activeTranslationSettingsRef.current = null;
      setActiveTranslationSettings(null);
      requireTranslationRefresh(false);
      refreshShouldResumeRef.current = false;
      translationRefreshRequestIdRef.current = null;
      endRetryRequiredRef.current = false;
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
    [clearServiceTimer, requireTranslationRefresh, stopCapture],
  );

  const endService = useCallback(
    async (message = "Live service ended. The reusable OBS URL is ready for next time.", failed = false) => {
      if (endingRef.current) return;
      endingRef.current = true;
      loadGenerationRef.current += 1;
      setControlAction(null);
      stopCapture();
      clearServiceTimer();
      const service = serviceRef.current;
      if (!service) {
        window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
        window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
        window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
        activeTranslationSettingsRef.current = null;
        setActiveTranslationSettings(null);
        requireTranslationRefresh(false);
        refreshShouldResumeRef.current = false;
        translationRefreshRequestIdRef.current = null;
        endRetryRequiredRef.current = false;
        setEndRetryRequired(false);
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
        stopCapture();
        window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
        window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
        window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
        serviceRef.current = null;
        activeTranslationSettingsRef.current = null;
        setActiveTranslationSettings(null);
        requireTranslationRefresh(false);
        refreshShouldResumeRef.current = false;
        translationRefreshRequestIdRef.current = null;
        endRetryRequiredRef.current = false;
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
          endRetryRequiredRef.current = true;
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
    [clearServiceTimer, handleTakenOver, requireTranslationRefresh, stopCapture],
  );

  const reconcileExternalTranslationRevision = useCallback(
    (translationRevision: unknown, transcriptionRequests?: number) => {
      const service = serviceRef.current;
      if (!service) return;
      const currentRevision = service.translationRevision;
      const nextRevision =
        Number.isSafeInteger(translationRevision) &&
        Number(translationRevision) >= 0
          ? Number(translationRevision)
          : currentRevision;
      const updatedService = {
        ...service,
        translationRevision: nextRevision,
      };

      refreshShouldResumeRef.current =
        capturingRef.current || refreshShouldResumeRef.current;
      stopCapture();
      serviceRef.current = updatedService;
      activeTranslationSettingsRef.current = null;
      setActiveTranslationSettings(null);
      window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
      translationRefreshRequestIdRef.current = null;
      requireTranslationRefresh(true);
      setLiveState((current) => ({
        ...current,
        status: "error",
        message:
          "Translation was refreshed from another controller tab. Local audio stopped before more provider work. Review the draft and refresh this translation session to continue.",
        latestSourceText: "",
        latestPublicText: "",
        lastLatencyMs: null,
        transcriptionRequests:
          transcriptionRequests ?? current.transcriptionRequests,
        service: updatedService,
        channel: current.channel
          ? {
              ...current.channel,
              translationRevision: nextRevision,
            }
          : current.channel,
      }));
    },
    [requireTranslationRefresh, stopCapture],
  );

  const processChunk = useCallback(
    async (audio: Blob, generation: number) => {
      const isCurrentCapture = () =>
        Boolean(serviceRef.current) &&
        capturingRef.current &&
        generation === captureGenerationRef.current;
      if (!isCurrentCapture()) return;

      // Cloud latency starts after the current MediaRecorder chunk completes.
      const startedAt = performance.now();
      const current = activeTranslationSettingsRef.current;
      if (!current) return;
      const signal = captureAbortRef.current?.signal;
      if (!signal) return;
      const serviceAtStart = serviceRef.current;
      if (!serviceAtStart) return;
      // Reserve quota immediately before quota-consuming provider work. A takeover
      // therefore stops the displaced tab before its next transcription request.
      const lease = await liveClientRef.current.reserveTranscriptionAttempt(
        serviceAtStart.controllerToken,
      );
      if (!isCurrentCapture()) return;
      if (lease.translationRevision !== serviceAtStart.translationRevision) {
        reconcileExternalTranslationRevision(
          lease.translationRevision,
          lease.transcriptionRequests,
        );
        return;
      }
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
                translationSystemPrompt: current.translationSystemPrompt,
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
        translationRevision: lease.translationRevision,
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
    [reconcileExternalTranslationRevision],
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
          if (
            error instanceof LiveApiError &&
            error.code === "translation_session_refreshed"
          ) {
            reconcileExternalTranslationRevision(error.translationRevision);
            break;
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
  }, [
    endService,
    handleTakenOver,
    processChunk,
    reconcileExternalTranslationRevision,
  ]);

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
    (stream: MediaStream, generation: number, speechBufferMs: SpeechBufferMs) => {
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
        }, speechBufferMs);
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
    const loadGeneration = ++loadGenerationRef.current;
    const loadIsCurrent = () =>
      loadGenerationRef.current === loadGeneration &&
      !endingRef.current &&
      !endRetryRequiredRef.current;
    if (!loadIsCurrent()) return;
    setLiveState((current) => ({
      ...current,
      status: "loading-channel",
      message: "Loading the Main OBS channel…",
    }));
    try {
      const channel = await liveClientRef.current.getChannel();
      if (!loadIsCurrent()) return;
      setRotationRecoveryRequired(false);
      const storedController = window.sessionStorage.getItem(CONTROLLER_STORAGE_KEY);
      const storedViewerUrl = validStoredViewerUrl(
        window.sessionStorage.getItem(VIEWER_STORAGE_KEY),
      );
      const storedTranslationSnapshot = parseStoredTranslationSessionSettings(
        window.sessionStorage.getItem(TRANSLATION_SETTINGS_STORAGE_KEY),
      );
      if (
        channel.configured &&
        (channel.status === "live" || channel.status === "paused") &&
        storedController &&
        channel.startedAt &&
        channel.expiresAt
      ) {
        try {
          const recovery = await liveClientRef.current.control(
            channel.status === "live" ? "pause" : "clear",
            storedController,
          );
          if (!loadIsCurrent()) return;
          const recovered: LiveServiceDetails = {
            channelId: channel.channelId,
            controllerToken: storedController,
            viewerUrl: storedViewerUrl,
            startedAt: channel.startedAt,
            expiresAt: channel.expiresAt,
            translationRevision: recovery.translationRevision,
          };
          const storedTranslationSettings =
            storedTranslationSnapshot &&
            translationSessionSnapshotMatches(
              storedTranslationSnapshot,
              recovered,
            )
              ? storedTranslationSnapshot.settings
              : null;
          speechBufferRef.current =
            storedTranslationSettings?.speechBufferMs ?? DEFAULT_SPEECH_BUFFER_MS;
          serviceRef.current = recovered;
          activeTranslationSettingsRef.current = storedTranslationSettings;
          setActiveTranslationSettings(storedTranslationSettings);
          requireTranslationRefresh(!storedTranslationSettings);
          refreshShouldResumeRef.current = false;
          translationRefreshRequestIdRef.current = null;
          armServiceTimer(recovered);
          setLiveState({
            ...INITIAL_LIVE_STATE,
            status: "paused",
            message: storedTranslationSettings
              ? "Recovered this operator tab in a safe paused state."
              : "Recovered the service, but its browser settings were unavailable. Review them and refresh the translation session before resuming.",
            channel: {
              ...channel,
              status: "paused",
              translationRevision: recovery.translationRevision,
            },
            service: recovered,
            transcriptionRequests: channel.transcriptionRequests,
          });
          return;
        } catch {
          if (!loadIsCurrent()) return;
          window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
          window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
          window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
          window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
          activeTranslationSettingsRef.current = null;
          setActiveTranslationSettings(null);
          requireTranslationRefresh(false);
          refreshShouldResumeRef.current = false;
          translationRefreshRequestIdRef.current = null;
        }
      } else if (channel.status === "idle") {
        window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
        window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
        window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
        activeTranslationSettingsRef.current = null;
        setActiveTranslationSettings(null);
        requireTranslationRefresh(false);
        refreshShouldResumeRef.current = false;
        translationRefreshRequestIdRef.current = null;
      }

      if (!loadIsCurrent()) return;
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
      if (!loadIsCurrent()) return;
      setRotationRecoveryRequired(
        error instanceof LiveApiError && error.code === "invalid_overlay_key",
      );
      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "error",
        message: error instanceof Error ? error.message : "The Main channel could not load.",
      });
    }
  }, [armServiceTimer, requireTranslationRefresh]);

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

  const replaceViewerLink = useCallback(async () => {
    const service = serviceRef.current;
    if (
      !service ||
      viewerAction ||
      endingRef.current ||
      endRetryRequiredRef.current
    ) {
      return;
    }
    const serviceIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      serviceRef.current?.controllerToken === service.controllerToken;
    setViewerAction("replace");
    try {
      const { viewerUrl } = await liveClientRef.current.replaceViewerLink(
        service.controllerToken,
      );
      if (!serviceIsCurrent()) return;
      const currentService = serviceRef.current;
      if (!currentService) return;
      const updated = { ...currentService, viewerUrl };
      serviceRef.current = updated;
      window.sessionStorage.setItem(VIEWER_STORAGE_KEY, viewerUrl);
      setLiveState((current) => ({
        ...current,
        service: updated,
        message: "Mobile viewer link replaced. Share the new link with intended viewers.",
      }));
    } catch (error) {
      if (!serviceIsCurrent()) return;
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message:
            error instanceof Error
              ? error.message
              : "The mobile viewer link could not be replaced.",
        }));
      }
    } finally {
      setViewerAction(null);
    }
  }, [handleTakenOver, viewerAction]);

  const startSession = useCallback(
    async (takeover = false) => {
      if (serviceRef.current || endingRef.current) return;
      endRetryRequiredRef.current = false;
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
        const translationSettings = normalizeTranslationSessionSettings(
          settingsRef.current,
        );
        const service = await liveClientRef.current.startService(
          normalizeCaptionStyle(settingsRef.current.style),
          takeover,
        );
        const speechBufferMs = translationSettings.speechBufferMs;
        serviceRef.current = service;
        activeTranslationSettingsRef.current = translationSettings;
        setActiveTranslationSettings(translationSettings);
        requireTranslationRefresh(false);
        refreshShouldResumeRef.current = false;
        translationRefreshRequestIdRef.current = null;
        speechBufferRef.current = speechBufferMs;
        window.sessionStorage.setItem(
          CONTROLLER_STORAGE_KEY,
          service.controllerToken,
        );
        if (service.viewerUrl) {
          window.sessionStorage.setItem(VIEWER_STORAGE_KEY, service.viewerUrl);
        }
        window.sessionStorage.setItem(
          TRANSLATION_SETTINGS_STORAGE_KEY,
          serializeTranslationSessionSettings(translationSettings, service),
        );
        window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
        recentContextRef.current = [];
        queueRef.current = [];
        captureGenerationRef.current += 1;
        const generation = captureGenerationRef.current;
        captureAbortRef.current = new AbortController();
        capturingRef.current = true;
        startRecorder(stream, generation, speechBufferMs);
        armServiceTimer(service);
        setLiveState((current) => ({
          ...current,
          status: "live",
          message: takeover
            ? "Takeover complete. Listening for the next caption."
            : `Listening. The first caption appears after the ${speechBufferMs / 1_000}-second speech buffer and cloud processing.`,
          service,
          channel: current.channel
            ? {
                ...current.channel,
                status: "live",
                startedAt: service.startedAt,
                expiresAt: service.expiresAt,
                translationRevision: service.translationRevision,
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
        const detail =
          error instanceof Error ? error.message : "Live service could not start.";
        if (serviceRef.current) {
          await endService(`Live service could not finish starting. ${detail}`, true);
          return;
        }
        stopMicrophone();
        setLiveState((current) => ({
          ...current,
          status: "error",
          message: detail,
        }));
      }
    },
    [
      armServiceTimer,
      endService,
      ensureMicrophone,
      liveState.channel?.configured,
      requireTranslationRefresh,
      selectedDeviceId,
      startRecorder,
      stopMicrophone,
    ],
  );

  const pauseOrConfirmService = useCallback(
    async (service: LiveServiceDetails) => {
      try {
        return await liveClientRef.current.control(
          "pause",
          service.controllerToken,
        );
      } catch (error) {
        if (isControllerReplaced(error)) throw error;
        try {
          const channel = await liveClientRef.current.getChannel();
          if (
            channel.configured &&
            channel.status === "paused" &&
            channel.startedAt === service.startedAt &&
            channel.expiresAt === service.expiresAt
          ) {
            return {
              action: "pause" as const,
              status: "paused" as const,
              translationRevision: channel.translationRevision,
            };
          }
        } catch {
          // Preserve the original pause failure when reconciliation is unavailable.
        }
        throw error;
      }
    },
    [],
  );

  const pauseSession = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || endingRef.current) return;
    const serviceIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      serviceRef.current?.controllerToken === service.controllerToken;
    setControlAction("pause");
    setLiveState((current) => ({
      ...current,
      status: "pausing",
      message: "Stopping capture and clearing OBS…",
    }));
    stopCapture();
    try {
      const response = await pauseOrConfirmService(service);
      if (!serviceIsCurrent()) return;
      if (response.translationRevision !== service.translationRevision) {
        reconcileExternalTranslationRevision(response.translationRevision);
        return;
      }
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message: "Paused. The URL and 90-minute expiry are unchanged.",
        latestSourceText: "",
        latestPublicText: "",
        channel: current.channel ? { ...current.channel, status: "paused" } : null,
      }));
    } catch (error) {
      if (!serviceIsCurrent()) return;
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
  }, [
    handleTakenOver,
    pauseOrConfirmService,
    reconcileExternalTranslationRevision,
    stopCapture,
  ]);

  const resumeSession = useCallback(async () => {
    const service = serviceRef.current;
    if (!service || endingRef.current) return;
    const serviceIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      serviceRef.current?.controllerToken === service.controllerToken;
    if (
      translationRefreshRequiredRef.current ||
      !activeTranslationSettingsRef.current
    ) {
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message:
          "Review the translation settings and refresh the translation session before resuming.",
      }));
      return;
    }
    setControlAction("resume");
    setLiveState((current) => ({
      ...current,
      status: "resuming",
      message: "Reopening the selected audio input…",
    }));
    try {
      const stream = await ensureMicrophone(selectedDeviceId || undefined);
      const response = await liveClientRef.current.control(
        "resume",
        service.controllerToken,
      );
      if (!serviceIsCurrent()) {
        stopCapture();
        return;
      }
      if (response.translationRevision !== service.translationRevision) {
        refreshShouldResumeRef.current = true;
        reconcileExternalTranslationRevision(response.translationRevision);
        return;
      }
      captureGenerationRef.current += 1;
      const generation = captureGenerationRef.current;
      captureAbortRef.current = new AbortController();
      capturingRef.current = true;
      queueRef.current = [];
      startRecorder(stream, generation, speechBufferRef.current);
      setLiveState((current) => ({
        ...current,
        status: "live",
        message: "Listening again. The reusable OBS URL and expiry are unchanged.",
        latestPublicText: "",
        channel: current.channel ? { ...current.channel, status: "live" } : null,
      }));
    } catch (error) {
      stopCapture();
      if (!serviceIsCurrent()) return;
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
  }, [
    ensureMicrophone,
    handleTakenOver,
    reconcileExternalTranslationRevision,
    selectedDeviceId,
    startRecorder,
    stopCapture,
  ]);

  const refreshTranslationSession = useCallback(async () => {
    const service = serviceRef.current;
    if (
      !service ||
      endingRef.current ||
      endRetryRequiredRef.current ||
      controlAction
    ) {
      return;
    }
    const serviceIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      serviceRef.current?.controllerToken === service.controllerToken;

    let translationSettings: TranslationSessionSettings;
    try {
      translationSettings = normalizeTranslationSessionSettings(
        settingsRef.current,
      );
    } catch (error) {
      setLiveState((current) => ({
        ...current,
        message:
          error instanceof Error
            ? error.message
            : "The translation settings are not valid.",
      }));
      return;
    }

    const shouldResume = capturingRef.current || refreshShouldResumeRef.current;
    refreshShouldResumeRef.current = shouldResume;
    const refreshRequestId =
      translationRefreshRequestIdRef.current ?? crypto.randomUUID();
    translationRefreshRequestIdRef.current = refreshRequestId;
    requireTranslationRefresh(true);
    setControlAction("refresh-translation");
    setLiveState((current) => ({
      ...current,
      status: "refreshing",
      message:
        "Refreshing translation context. The service, timer, links, and viewers remain connected…",
    }));
    stopTranslationCapture();

    try {
      const response = await liveClientRef.current.refreshTranslation(
        service.controllerToken,
        service.translationRevision,
        refreshRequestId,
      );
      if (!serviceIsCurrent()) {
        stopCapture();
        return;
      }
      const updatedService = {
        ...(serviceRef.current ?? service),
        translationRevision: response.translationRevision,
      };
      serviceRef.current = updatedService;
      activeTranslationSettingsRef.current = translationSettings;
      setActiveTranslationSettings(translationSettings);
      speechBufferRef.current = translationSettings.speechBufferMs;
      recentContextRef.current = [];
      queueRef.current = [];
      window.sessionStorage.setItem(
        TRANSLATION_SETTINGS_STORAGE_KEY,
        serializeTranslationSessionSettings(
          translationSettings,
          updatedService,
        ),
      );
      window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
      requireTranslationRefresh(false);
      translationRefreshRequestIdRef.current = null;

      if (shouldResume) {
        try {
          const stream = await ensureMicrophone(selectedDeviceId || undefined);
          if (!serviceIsCurrent()) {
            stopCapture();
            return;
          }
          captureGenerationRef.current += 1;
          const generation = captureGenerationRef.current;
          captureAbortRef.current = new AbortController();
          capturingRef.current = true;
          startRecorder(
            stream,
            generation,
            translationSettings.speechBufferMs,
          );
          refreshShouldResumeRef.current = false;
          setLiveState((current) => ({
            ...current,
            status: "live",
            message:
              "Translation settings refreshed. Listening continues in the same service.",
            latestSourceText: "",
            latestPublicText: "",
            lastLatencyMs: null,
            service: updatedService,
            channel: current.channel
              ? {
                  ...current.channel,
                  status: "live",
                  translationRevision: response.translationRevision,
                }
              : current.channel,
          }));
        } catch (error) {
          stopCapture();
          if (!serviceIsCurrent()) return;
          refreshShouldResumeRef.current = false;
          let pauseError: unknown;
          try {
            const pauseResponse = await pauseOrConfirmService(updatedService);
            if (!serviceIsCurrent()) {
              stopCapture();
              return;
            }
            if (
              pauseResponse.translationRevision !==
              updatedService.translationRevision
            ) {
              reconcileExternalTranslationRevision(
                pauseResponse.translationRevision,
              );
              return;
            }
          } catch (caught) {
            pauseError = caught;
          }
          if (!serviceIsCurrent()) {
            stopCapture();
            return;
          }
          if (isControllerReplaced(pauseError)) {
            handleTakenOver();
            return;
          }
          const pauseConfirmed = pauseError === undefined;
          setLiveState((current) => ({
            ...current,
            status: pauseConfirmed ? "paused" : "error",
            message: pauseConfirmed
              ? `Translation settings were refreshed, but audio could not restart. The service is paused; use Resume when ready. ${
                  error instanceof Error
                    ? error.message
                    : "Microphone access failed."
                }`
              : `Translation settings were refreshed and local audio stopped, but the server pause was not confirmed. Retry Pause or End. ${
                  pauseError instanceof Error
                    ? pauseError.message
                    : "Pause confirmation failed."
                }`,
            latestSourceText: "",
            latestPublicText: "",
            lastLatencyMs: null,
            service: updatedService,
            channel: current.channel
              ? {
                  ...current.channel,
                  status: pauseConfirmed
                    ? "paused"
                    : current.channel.status,
                  translationRevision: response.translationRevision,
                }
              : current.channel,
          }));
        }
      } else {
        refreshShouldResumeRef.current = false;
        if (response.status === "live") {
          let pauseError: unknown;
          try {
            const pauseResponse = await pauseOrConfirmService(updatedService);
            if (!serviceIsCurrent()) {
              stopCapture();
              return;
            }
            if (
              pauseResponse.translationRevision !==
              updatedService.translationRevision
            ) {
              reconcileExternalTranslationRevision(
                pauseResponse.translationRevision,
              );
              return;
            }
          } catch (caught) {
            pauseError = caught;
          }
          if (!serviceIsCurrent()) {
            stopCapture();
            return;
          }
          if (isControllerReplaced(pauseError)) {
            handleTakenOver();
            return;
          }
          if (pauseError !== undefined) {
            setLiveState((current) => ({
              ...current,
              status: "error",
              message: `Translation settings were refreshed and local audio is stopped, but the server pause was not confirmed. Retry Pause or End. ${
                pauseError instanceof Error
                  ? pauseError.message
                  : "Pause confirmation failed."
              }`,
              latestSourceText: "",
              latestPublicText: "",
              lastLatencyMs: null,
              service: updatedService,
              channel: current.channel
                ? {
                    ...current.channel,
                    translationRevision: response.translationRevision,
                  }
                : current.channel,
            }));
            return;
          }
        }
        setLiveState((current) => ({
          ...current,
          status: "paused",
          message:
            "Translation settings refreshed. The service remains paused with the same timer and links.",
          latestSourceText: "",
          latestPublicText: "",
          lastLatencyMs: null,
          service: updatedService,
          channel: current.channel
            ? {
                ...current.channel,
                status: "paused",
                translationRevision: response.translationRevision,
              }
            : current.channel,
        }));
      }
    } catch (error) {
      stopMicrophone();
      if (!serviceIsCurrent()) return;
      if (isControllerReplaced(error)) {
        handleTakenOver();
      } else {
        if (
          error instanceof LiveApiError &&
          typeof error.translationRevision === "number"
        ) {
          const currentService = serviceRef.current;
          if (currentService) {
            const reconciled = {
              ...currentService,
              translationRevision: error.translationRevision,
            };
            serviceRef.current = reconciled;
            setLiveState((current) => ({ ...current, service: reconciled }));
          }
        }
        setLiveState((current) => ({
          ...current,
          status: "paused",
          message: `Audio capture stopped, but the translation refresh was not confirmed. Retry Refresh; the live service and links remain available. ${
            error instanceof Error ? error.message : "Refresh failed."
          }`,
          latestSourceText: "",
          latestPublicText: "",
          channel: current.channel
            ? { ...current.channel, status: "paused" }
            : current.channel,
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [
    controlAction,
    ensureMicrophone,
    handleTakenOver,
    pauseOrConfirmService,
    reconcileExternalTranslationRevision,
    requireTranslationRefresh,
    selectedDeviceId,
    startRecorder,
    stopCapture,
    stopMicrophone,
    stopTranslationCapture,
  ]);

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
    const pauseForLifecycle = () => {
      if (lifecyclePauseRef.current) return;
      lifecyclePauseRef.current = true;
      stopCapture();
      const service = serviceRef.current;
      if (!service) return;
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message: "App inactive. Audio stopped; confirming the channel is paused.",
        latestSourceText: "",
        latestPublicText: "",
        channel: current.channel ? { ...current.channel, status: "paused" } : null,
      }));
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

    const reconcileAfterForeground = () => {
      lifecyclePauseRef.current = false;
      void loadChannel();
    };

    window.addEventListener("pagehide", pauseForLifecycle);
    window.addEventListener("church-caption-native-background", pauseForLifecycle);
    window.addEventListener("church-caption-native-foreground", reconcileAfterForeground);
    return () => {
      window.removeEventListener("pagehide", pauseForLifecycle);
      window.removeEventListener("church-caption-native-background", pauseForLifecycle);
      window.removeEventListener(
        "church-caption-native-foreground",
        reconcileAfterForeground,
      );
    };
  }, [loadChannel, stopCapture]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      stopCapture();
    };
  }, [refreshDevices, stopCapture]);

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
    viewerAction,
    activeTranslationSettings,
    translationRefreshRequired,
    activeSpeechBufferMs:
      activeTranslationSettings?.speechBufferMs ?? settings.speechBufferMs,
    endRetryRequired,
    takeoverRequired,
    rotationRecoveryRequired,
    cancelTakeover: () => setTakeoverRequired(false),
    startAudioTest: () => ensureMicrophone(selectedDeviceId || undefined),
    createChannel,
    rotateChannel,
    saveChannelStyle,
    replaceViewerLink,
    startSession,
    pauseSession,
    resumeSession,
    refreshTranslationSession,
    clearCaption,
    showTestCaption,
    stopSession: () => endService(),
    reloadChannel: loadChannel,
  };
}
