"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TranslationResult } from "@/ai/contracts";
import {
  CloudProviderClient,
  CloudProviderClientError,
  isTerminalInferenceControlError,
} from "@/ai/cloud-provider-client";
import {
  accumulateLlmSessionUsage,
  emptyLlmSessionUsage,
  withLlmProviderRateLimit,
} from "@/ai/usage";
import { parseGlossaryInput, parseModerationInput } from "@/live/config";
import { addLiveWord, combineFilterText, combineKeywordText, liveWordsToSettings, mergeGlossaries, removeLiveWord, type LiveWordEntry } from "@/live/live-words";
import type { WordRow } from "@/live/words";
import {
  DEFAULT_RECORDING_WINDOW_MS,
  MAX_LIVE_SESSION_MS,
  normalizeCaptionStyle,
  recordingWindowBoundsMs,
  type CaptionStyle,
  type LiveSessionDetails,
  type LiveSessionControlAction,
  type LiveSessionState,
  type PublicCaptionRequest,
  type RecordingWindowMs,
} from "@/live/contracts";
import {
  outputBufferCapacity,
  type OutputBufferCount,
  type OutputBufferDwellMs,
  type OutputBufferEntry,
} from "@/live/output-buffer";
import { LiveApiError, LiveSessionClient } from "@/live/session-client";
import { SAMPLE_CAPTIONS } from "@/live/test-captions";
import {
  MAX_FILTER_INPUT_CHARS,
  MAX_TERMINOLOGY_INPUT_CHARS,
  normalizeTranslationSessionSettings,
  parseStoredTranslationSessionSettings,
  serializeTranslationSessionSettings,
  translationSessionSnapshotMatches,
  type TranslationSessionSettings,
} from "@/live/translation-settings";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { experienceRequest } from "@/experience/client";
import { startSerialPolling } from "@/live/serial-polling";
import { initialSpeechGateState, observeSpeechSample, shouldSendWindow } from "@/live/speech-gate";
import { isProviderLimitError } from "@/live/provider-limit";
import { useMicrophoneInput } from "@/live/use-microphone-input";
import { useMicTestClip } from "@/live/use-mic-test-clip";
import { recorderOptions } from "@/live/recorder-options";
import { useI18n } from "@/i18n/provider";
import { useOutputBufferQueue } from "@/live/use-output-buffer-queue";
import { useRecentOutputs } from "@/live/use-recent-outputs";
import {
  runCaptionInference,
  runCaptionTranscription,
  runCaptionTranslation,
  type CaptionInferenceResult,
  type CaptionTranscriptionResult,
} from "@/live/caption-inference";
import { draftReusedAsFinal, type DraftReuseSnapshot } from "@/live/live-heard";
import { useLiveDrafts, type LiveDraftRunner } from "@/live/use-live-drafts";
import {
  clearBackgroundTimeout,
  clearBackgroundInterval,
  setBackgroundInterval,
  setBackgroundTimeout,
} from "@/live/background-timer";
import {
  createCutMetrics,
  recordCutWindow,
  type CutReason,
} from "@/live/cut-metrics";
import {
  initialWindowPolicyState,
  nextWindowDecision,
  dynamicDraftResult,
  dynamicPauseAction,
  draftEndsWithTerminalPunctuation,
  DYNAMIC_SAMPLE_MS,
  withRaisedFloor,
  type DynamicDraftHold,
} from "@/live/window-policy";

interface LiveCaptionSettings extends TranslationSessionSettings {
  saveHistory?: boolean;
  liveNote?: string;
  style: CaptionStyle;
  outputBufferCount: OutputBufferCount;
  outputBufferDwellMs: OutputBufferDwellMs;
}

/** A confirming Dynamic draft, ready for the next final to reuse as its transcription. */
interface PendingDraft {
  generation: number;
  windowId: number;
  transcription: CaptionTranscriptionResult;
  snapshot: DraftReuseSnapshot;
}

interface QueuedChunk {
  audio: Blob;
  generation: number;
  /** The Dynamic window whose in-progress Heard text this final replaces. */
  draftWindowId?: number;
  draft?: PendingDraft;
}

const CONTROLLER_STORAGE_KEY = "caption-studio:main-controller:v1";
const VIEWER_STORAGE_KEY = "caption-studio:main-viewer:v1";
const TRANSLATION_SETTINGS_STORAGE_KEY =
  "caption-studio:active-translation-settings:v1";
export const LIVE_NOTE_STORAGE_KEY = "caption-studio:live-note:v1";
const LEGACY_SPEECH_BUFFER_STORAGE_KEY =
  "caption-studio:speech-buffer:v1";

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
  message: "",
  sequence: 0,
  droppedChunks: 0,
  filteredSegments: 0,
  transcriptionRequests: 0,
  cutMetrics: createCutMetrics(),
  llmUsage: emptyLlmSessionUsage(),
  latestSourceText: "",
  latestPublicText: "",
  latestPublicAt: null,
  latestPublicLanguage: null,
  lastLatencyMs: null,
  channel: null,
  liveSession: null,
};

function isControllerReplaced(error: unknown) {
  return (
    (error instanceof LiveApiError || error instanceof CloudProviderClientError) &&
    error.code === "controller_replaced"
  );
}

export function useLiveCaptionSession(settings: LiveCaptionSettings) {
  const { t } = useI18n();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const { outputs: recentOutputs, record: recordRecentOutput, reset: resetRecentOutputs } = useRecentOutputs();
  const {
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
  } = useMicrophoneInput();
  const micTest = useMicTestClip(() => ensureMicrophone(selectedDeviceId || undefined));
  const discardMicTest = micTest.discard;
  const [liveState, setLiveState] = useState<LiveSessionState>(() => ({
    ...INITIAL_LIVE_STATE,
    message: t("live.message.loadingChannel"),
  }));
  const remoteResultRef = useRef<{ controller: string; id: string; success: boolean } | null>(null);
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
  const [liveWordEntries, setLiveWordEntries] = useState<LiveWordEntry[]>([]);

  const settingsRef = useRef(settings);
  const endRetryRequiredRef = useRef(false);
  const activeTranslationSettingsRef =
    useRef<TranslationSessionSettings | null>(null);
  const translationRefreshRequiredRef = useRef(false);
  const refreshShouldResumeRef = useRef(false);
  const translationRefreshRequestIdRef = useRef<string | null>(null);
  const liveWordEntriesRef = useRef<LiveWordEntry[]>([]);
  const publishBufferedEntryRef = useRef<(entry: OutputBufferEntry) => Promise<void>>(async () => {});
  const {
    queue: outputBufferQueue,
    generationRef: outputBufferGenerationRef,
    reset: resetOutputBuffer,
    enqueue: enqueueOutputBufferEntry,
    setEntryPaused: setOutputBufferEntryPaused,
    clearEntry: clearOutputBufferEntry,
    fastForwardOutputBufferEntry,
    beginEdit: beginOutputBufferEdit,
    updateEditDraft: updateOutputBufferEditDraft,
    cancelEdit: cancelOutputBufferEdit,
    submitEdit: submitOutputBufferEdit,
  } = useOutputBufferQueue({
    count: settings.outputBufferCount,
    tickEnabled: liveState.status === "live",
    settingsRef,
    publishBufferedEntryRef,
    activeTranslationSettingsRef,
    liveWordEntriesRef,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderTimerRef = useRef<number | null>(null);
  const dynamicWindowTimerRef = useRef<number | null>(null);
  const queueRef = useRef<QueuedChunk[]>([]);
  const processingRef = useRef(false);
  const captureAbortRef = useRef<AbortController | null>(null);
  const capturingRef = useRef(false);
  const captureGenerationRef = useRef(0);
  const endingRef = useRef(false);
  const sessionRef = useRef<LiveSessionDetails | null>(null);
  const loadGenerationRef = useRef(0);
  const recentContextRef = useRef<string[]>([]);
  const sessionTimerRef = useRef<number | null>(null);
  const lifecyclePauseRef = useRef(false);
  const recordingWindowRef = useRef<RecordingWindowMs>(DEFAULT_RECORDING_WINDOW_MS);
  const speechGateRef = useRef(initialSpeechGateState());
  const providerBusyRef = useRef(false);
  const cloudClientRef = useRef(new CloudProviderClient());
  const liveClientRef = useRef(
    new LiveSessionClient((key) => tRef.current(key)),
  );
  const draftRunnerRef = useRef<LiveDraftRunner>(async () => null);
  const pendingDraftRef = useRef<PendingDraft | null>(null);
  const attemptsUsedRef = useRef(0);
  const liveDrafts = useLiveDrafts({
    runnerRef: draftRunnerRef,
    attemptsUsed: () => attemptsUsedRef.current,
    finalBusy: () => processingRef.current || queueRef.current.length > 0,
    remainingSessionMs: () => {
      const expiresAt = sessionRef.current?.expiresAt;
      return expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0;
    },
  });
  const {
    draft: liveDraftPreview,
    sessionDisabled: liveDraftSessionDisabled,
    beginWindow: beginLiveDraftWindow,
    endWindow: endLiveDraftWindow,
    startSession: startLiveDraftSession,
    clearDraft: clearLiveDraft,
    reset: resetLiveDrafts,
    runAtPauseCandidate: runDraftAtPauseCandidate,
  } = liveDrafts;

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    attemptsUsedRef.current = liveState.transcriptionRequests;
  }, [liveState.transcriptionRequests]);

  useEffect(() => {
    liveWordEntriesRef.current = liveWordEntries;
  }, [liveWordEntries]);



  const addLiveWordEntry = useCallback((row: WordRow) => {
    const next = addLiveWord(liveWordEntriesRef.current, row);
    liveWordEntriesRef.current = next;
    setLiveWordEntries(next);
  }, []);


  const removeLiveWordEntry = useCallback((id: string) => {
    const next = removeLiveWord(liveWordEntriesRef.current, id);
    liveWordEntriesRef.current = next;
    setLiveWordEntries(next);
  }, []);

  const requireTranslationRefresh = useCallback((required: boolean) => {
    translationRefreshRequiredRef.current = required;
    setTranslationRefreshRequired(required);
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("caption-studio-state", {
        detail: {
          status: liveState.status,
          message: liveState.message,
          microphoneActive: microphoneState === "active",
        },
      }),
    );
  }, [liveState.message, liveState.status, microphoneState]);

  const stopRecorder = useCallback(() => {
    endLiveDraftWindow();
    if (recorderTimerRef.current !== null) {
      clearBackgroundTimeout(recorderTimerRef.current);
      recorderTimerRef.current = null;
    }
    if (dynamicWindowTimerRef.current !== null) {
      clearBackgroundInterval(dynamicWindowTimerRef.current);
      dynamicWindowTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
  }, [endLiveDraftWindow]);

  const stopTranslationCapture = useCallback(() => {
    capturingRef.current = false;
    captureGenerationRef.current += 1;
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    queueRef.current = [];
    pendingDraftRef.current = null;
    resetLiveDrafts();
    stopRecorder();
  }, [resetLiveDrafts, stopRecorder]);

  const stopCapture = useCallback(() => {
    stopTranslationCapture();
    stopMicrophone();
  }, [stopMicrophone, stopTranslationCapture]);

  const clearSessionTimer = useCallback(() => {
    if (sessionTimerRef.current !== null) {
      clearBackgroundTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  const handleTakenOver = useCallback(
    (message = tRef.current("live.message.takenOver")) => {
      loadGenerationRef.current += 1;
      stopCapture();
      resetOutputBuffer();
      resetRecentOutputs();
      clearSessionTimer();
      window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
      window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
      window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
      window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
      sessionRef.current = null;
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
        latestPublicAt: null,
        latestPublicLanguage: null,
        transcriptionRequests: 0,
        llmUsage: emptyLlmSessionUsage(),
        liveSession: null,
        channel: current.channel
          ? {
              ...current.channel,
              status: "live",
              startedAt: null,
              expiresAt: null,
              transcriptionRequests: 0,
              llmUsage: emptyLlmSessionUsage(),
            }
          : current.channel,
      }));
    },
    [clearSessionTimer, requireTranslationRefresh, resetOutputBuffer, resetRecentOutputs, stopCapture],
  );

  const endLiveSession = useCallback(
    async (message = tRef.current("live.message.ended"), failed = false) => {
      if (endingRef.current) return;
      endingRef.current = true;
      loadGenerationRef.current += 1;
      setControlAction(null);
      stopCapture();
      resetOutputBuffer();
      resetRecentOutputs();
      clearSessionTimer();
      const liveSession = sessionRef.current;
      if (!liveSession) {
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
          transcriptionRequests: 0,
          llmUsage: emptyLlmSessionUsage(),
          liveSession: null,
        }));
        endingRef.current = false;
        return;
      }

      setLiveState((current) => ({
        ...current,
        status: "ending",
        message: tRef.current("live.message.ending"),
      }));
      try {
        await liveClientRef.current.endLiveSession(liveSession.controllerToken);
        stopCapture();
        window.sessionStorage.removeItem(CONTROLLER_STORAGE_KEY);
        window.sessionStorage.removeItem(VIEWER_STORAGE_KEY);
        window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
        window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
        sessionRef.current = null;
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
          latestPublicAt: null,
          latestPublicLanguage: null,
          transcriptionRequests: 0,
          llmUsage: emptyLlmSessionUsage(),
          liveSession: null,
          channel: current.channel
            ? {
                ...current.channel,
                status: "idle",
                startedAt: null,
                expiresAt: null,
                transcriptionRequests: 0,
                llmUsage: emptyLlmSessionUsage(),
              }
            : current.channel,
        }));
      } catch (error) {
        if (isControllerReplaced(error)) {
          handleTakenOver();
        } else {
          const detail =
            error instanceof Error ? error.message : tRef.current("live.message.deactivationFailed");
          endRetryRequiredRef.current = true;
          setEndRetryRequired(true);
          setLiveState((current) => ({
            ...current,
            status: "error",
            message: tRef.current("live.message.deactivationUnconfirmed", { detail }),
            liveSession,
          }));
        }
      } finally {
        endingRef.current = false;
      }
    },
    [clearSessionTimer, handleTakenOver, requireTranslationRefresh, resetOutputBuffer, resetRecentOutputs, stopCapture],
  );

  const reconcileExternalTranslationRevision = useCallback(
    (translationRevision: unknown, transcriptionRequests?: number) => {
      const liveSession = sessionRef.current;
      if (!liveSession) return;
      const currentRevision = liveSession.translationRevision;
      const nextRevision =
        Number.isSafeInteger(translationRevision) &&
        Number(translationRevision) >= 0
          ? Number(translationRevision)
          : currentRevision;
      const updatedSession = {
        ...liveSession,
        translationRevision: nextRevision,
      };

      refreshShouldResumeRef.current =
        capturingRef.current || refreshShouldResumeRef.current;
      stopCapture();
      resetOutputBuffer();
      sessionRef.current = updatedSession;
      activeTranslationSettingsRef.current = null;
      setActiveTranslationSettings(null);
      window.sessionStorage.removeItem(TRANSLATION_SETTINGS_STORAGE_KEY);
      translationRefreshRequestIdRef.current = null;
      requireTranslationRefresh(true);
      setLiveState((current) => ({
        ...current,
        status: "error",
        message:
          tRef.current("live.message.translationRefreshedElsewhere"),
        latestSourceText: "",
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
        lastLatencyMs: null,
        transcriptionRequests:
          transcriptionRequests ?? current.transcriptionRequests,
        liveSession: updatedSession,
        channel: current.channel
          ? {
              ...current.channel,
              translationRevision: nextRevision,
            }
          : current.channel,
      }));
    },
    [requireTranslationRefresh, resetOutputBuffer, stopCapture],
  );

  const publishBufferedEntry = useCallback(
    async (entry: OutputBufferEntry) => {
      const liveSession = sessionRef.current;
      if (!liveSession) return;
      // Also requires the buffer generation to be unchanged, since Pause/Clear/refresh/
      // takeover/End all discard it via resetOutputBuffer without changing controllerToken.
      const bufferGeneration = outputBufferGenerationRef.current;
      const isStillCurrentSession = () =>
        sessionRef.current?.controllerToken === liveSession.controllerToken &&
        outputBufferGenerationRef.current === bufferGeneration;
      try {
        const published = await liveClientRef.current.publish(liveSession.controllerToken, {
          ...entry.request,
          publicText: entry.publicText,
        });
        if (!isStillCurrentSession()) return;
        recordRecentOutput({ id: crypto.randomUUID(), at: Date.now(), sourceText: entry.sourceText, publicText: entry.publicText, hidden: entry.hidden });
        setLiveState((state) => ({
          ...state,
          message: tRef.current(
            entry.hidden
              ? "live.message.filteredHidden"
              : "live.message.published",
          ),
          sequence: published.sequence,
          historyIncomplete: state.historyIncomplete || published.historyIncomplete === true,
          latestSourceText: entry.sourceText,
          latestPublicText: entry.publicText,
          latestPublicAt: entry.publicText ? Date.now() : null,
          latestPublicLanguage: entry.publicText ? entry.targetLanguage : null,
        }));
      } catch (error) {
        // A stale response must not act on a session this tab has since ended or changed.
        if (!isStillCurrentSession()) return;
        if (isControllerReplaced(error)) {
          handleTakenOver();
          return;
        }
        if (error instanceof LiveApiError && error.code === "caption_cleared") return;
        if (error instanceof LiveApiError && error.code === "session_paused") {
          stopCapture();
          resetOutputBuffer();
          setLiveState((state) => ({
            ...state,
            status: "paused",
            latestPublicText: "",
            latestPublicAt: null,
            latestSourceText: "",
            message: tRef.current("live.message.pausedRemote"),
          }));
          return;
        }
        if (error instanceof LiveApiError && error.code === "translation_session_refreshed") {
          reconcileExternalTranslationRevision(error.translationRevision);
          return;
        }
        // Mirror drainQueue's escalation for the equivalent non-buffered publish failure.
        const message = error instanceof Error ? error.message : tRef.current("live.message.bufferedPublishFailed");
        if (liveSession.saveHistory) {
          setLiveState((state) => ({ ...state, historyIncomplete: true }));
          void experienceRequest("gap", {}, liveSession.controllerToken).catch(() => {});
        }
        if (
          isTerminalInferenceControlError(error) ||
          (error instanceof LiveApiError && error.code === "transcription_limit_reached") ||
          /quota|expired|event limit|language could not be detected|authentication/i.test(message)
        ) {
          await endLiveSession(message, true);
          return;
        }
        setLiveState((state) => ({ ...state, message }));
      }
    },
    [endLiveSession, handleTakenOver, reconcileExternalTranslationRevision, outputBufferGenerationRef, recordRecentOutput, resetOutputBuffer, stopCapture],
  );
  publishBufferedEntryRef.current = publishBufferedEntry;

  const processChunk = useCallback(
    async (audio: Blob, generation: number, draft?: PendingDraft) => {
      const isCurrentCapture = () =>
        Boolean(sessionRef.current) &&
        capturingRef.current &&
        generation === captureGenerationRef.current;
      if (!isCurrentCapture()) return;

      // Cloud latency starts after the current MediaRecorder chunk completes.
      const startedAt = performance.now();
      const current = activeTranslationSettingsRef.current;
      if (!current) return;
      const liveWordsAtStart = liveWordEntriesRef.current;
      const liveSettings = liveWordsToSettings(liveWordsAtStart);
      const activeGlossary = mergeGlossaries(
        parseGlossaryInput(current.keywordText, current.targetLanguage),
        parseGlossaryInput(liveSettings.keywordText, current.targetLanguage),
      );
      const signal = captureAbortRef.current?.signal;
      if (!signal) return;
      const sessionAtStart = sessionRef.current;
      if (!sessionAtStart) return;
      const reuseDraft = draft && draftReusedAsFinal(
        { captureGeneration: draft.generation, snapshot: draft.snapshot },
        {
          captureGeneration: generation,
          controllerToken: sessionAtStart.controllerToken,
          translationRevision: sessionAtStart.translationRevision,
          settings: current,
          liveWords: liveWordsAtStart,
          liveNote: settingsRef.current.liveNote,
        },
      ) ? draft : null;
      const recordTranscription = (transcription: CaptionTranscriptionResult) => {
        attemptsUsedRef.current = transcription.lease.transcriptionRequests;
        if (isCurrentCapture()) {
          setLiveState((state) => ({
            ...state,
            transcriptionRequests: transcription.lease.transcriptionRequests,
            filteredSegments: state.filteredSegments + transcription.droppedSegments,
          }));
        }
      };
      const onTranslation = (result: TranslationResult) =>
        setLiveState((state) => ({
          ...state,
          llmUsage: accumulateLlmSessionUsage(state.llmUsage, result),
        }));
      const onTranslationError = (error: unknown) => {
        if (error instanceof CloudProviderClientError && (error.rateLimit || error.usage)) {
          setLiveState((state) => ({
            ...state,
            llmUsage: error.usage
              ? accumulateLlmSessionUsage(state.llmUsage, error)
              : withLlmProviderRateLimit(state.llmUsage, error.rateLimit),
          }));
        }
      };
      const translate = (request: Parameters<CloudProviderClient["translate"]>[0], context: Parameters<CloudProviderClient["translate"]>[1], requestSignal: Parameters<CloudProviderClient["translate"]>[2]) =>
        cloudClientRef.current.translate(request, context, requestSignal);
      let inference: CaptionInferenceResult | null;
      if (reuseDraft) {
        // The draft already reserved and claimed this caption's transcription attempt.
        recordTranscription(reuseDraft.transcription);
        inference = await runCaptionTranslation({
          transcription: reuseDraft.transcription,
          settings: current,
          recentContext: recentContextRef.current,
          liveNote: settingsRef.current.liveNote,
          signal,
          isCurrent: isCurrentCapture,
          onTranslation,
          onTranslationError,
          dependencies: { translate },
        });
      } else {
        inference = await runCaptionInference({
          audio,
          settings: current,
          glossary: activeGlossary,
          controllerToken: sessionAtStart.controllerToken,
          recentContext: recentContextRef.current,
          liveNote: settingsRef.current.liveNote,
          signal,
          isCurrent: isCurrentCapture,
          currentRevision: sessionAtStart.translationRevision,
          onRevisionMismatch: (lease) =>
            reconcileExternalTranslationRevision(lease.translationRevision, lease.transcriptionRequests),
          onLease: (lease) => {
            attemptsUsedRef.current = lease.transcriptionRequests;
            if (isCurrentCapture()) {
              setLiveState((state) => ({ ...state, transcriptionRequests: lease.transcriptionRequests }));
            }
          },
          onDroppedSegments: (count) => setLiveState((state) => ({
            ...state,
            filteredSegments: state.filteredSegments + count,
          })),
          onTranslation,
          onTranslationError,
          dependencies: {
            reserve: (token) => liveClientRef.current.reserveTranscriptionAttempt(token),
            transcribe: (request, context, requestSignal) =>
              cloudClientRef.current.transcribe(request, context, requestSignal),
            translate,
          },
        });
      }
      if (!inference) return;
      const { lease, glossary, originalSource, sourceText, detectedLanguage, translation } = inference;

      if (sessionAtStart.saveHistory) {
        try {
          await experienceRequest("source", { source: { id: lease.transcriptionRequests,
            text: originalSource, correction: sourceText !== originalSource ? sourceText : undefined,
            language: detectedLanguage, translationRevision: lease.translationRevision } }, sessionAtStart.controllerToken);
        } catch {
          setLiveState((state) => ({ ...state, historyIncomplete: true, message: tRef.current("live.message.historySavingFailed") }));
          void experienceRequest("gap", {}, sessionAtStart.controllerToken).catch(() => {});
        }
      }

      if (!isCurrentCapture()) return;

      const effectiveFilterText = combineFilterText(
        liveSettings.filterText,
        current.filterText,
        MAX_FILTER_INPUT_CHARS,
      );
      const forms = prepareCaptionForms({
        sourceText,
        translatedText: translation.text,
        targetLanguage: current.targetLanguage,
        glossary,
        moderationRules: parseModerationInput(effectiveFilterText),
      });
      const event: PublicCaptionRequest = {
        captionEpoch: lease.captionEpoch ?? 0,
        transcriptionAttempt: lease.transcriptionRequests,
        reader: {
          filterText: effectiveFilterText,
          keywordText: combineKeywordText(
            liveSettings.keywordText,
            current.keywordText,
            MAX_TERMINOLOGY_INPUT_CHARS,
          ),
        },
        publicText: forms.publicText,
        targetLanguage: current.targetLanguage,
        style: normalizeCaptionStyle(settingsRef.current.style),
        translationRevision: lease.translationRevision,
      };
      const liveSession = sessionRef.current;
      if (!liveSession || !isCurrentCapture()) return;
      recentContextRef.current = [...recentContextRef.current, sourceText].slice(-4);

      const bufferCount = settingsRef.current.outputBufferCount;
      if (bufferCount === 0) {
        const published = await liveClientRef.current.publish(
          liveSession.controllerToken,
          event,
        );
        if (!isCurrentCapture()) return;
        recordRecentOutput({ id: crypto.randomUUID(), at: Date.now(), sourceText: forms.protectedSourceText, publicText: forms.publicText, hidden: forms.hiddenFromPublicDisplay });
        setLiveState((state) => ({
          ...state,
          message: tRef.current(
            forms.hiddenFromPublicDisplay
              ? "live.message.filteredHidden"
              : "live.message.published",
          ),
          sequence: published.sequence,
          historyIncomplete: state.historyIncomplete || published.historyIncomplete === true,
          latestSourceText: forms.protectedSourceText,
          latestPublicText: forms.publicText,
          latestPublicAt: forms.publicText ? Date.now() : null,
          latestPublicLanguage: forms.publicText ? current.targetLanguage : null,
          lastLatencyMs: Math.round(performance.now() - startedAt),
        }));
        return;
      }

      const outcome = enqueueOutputBufferEntry(
        outputBufferCapacity(bufferCount),
        {
          id: crypto.randomUUID(),
          sourceText: forms.protectedSourceText,
          targetLanguage: current.targetLanguage,
          publicText: forms.publicText,
          hidden: forms.hiddenFromPublicDisplay,
          request: event,
        },
        Date.now(),
      );
      // Sequential, not concurrent, so force-advanced entries can't resolve out of order;
      // bails early if a mid-loop Pause/Clear/etc. already discarded the buffer.
      const forceAdvanceGeneration = outputBufferGenerationRef.current;
      for (const forced of outcome.publishNow) {
        if (outputBufferGenerationRef.current !== forceAdvanceGeneration) break;
        await publishBufferedEntry(forced);
      }
      setLiveState((state) => ({
        ...state,
        message: tRef.current(
          outcome.dropped
            ? "live.message.bufferDropped"
            : "live.message.queued",
        ),
        lastLatencyMs: Math.round(performance.now() - startedAt),
      }));
    },
    [enqueueOutputBufferEntry, outputBufferGenerationRef, publishBufferedEntry, recordRecentOutput, reconcileExternalTranslationRevision],
  );

  const runLiveDraft = useCallback<LiveDraftRunner>(async ({ audio, signal, isCurrent, captureGeneration, onDisableForSession }) => {
    const current = activeTranslationSettingsRef.current;
    const sessionAtStart = sessionRef.current;
    if (!current || !sessionAtStart || !capturingRef.current || !isCurrent()) return null;
    const liveWords = liveWordEntriesRef.current;
    const liveNote = settingsRef.current.liveNote;
    const liveSettings = liveWordsToSettings(liveWords);
    const activeGlossary = mergeGlossaries(
      parseGlossaryInput(current.keywordText, current.targetLanguage),
      parseGlossaryInput(liveSettings.keywordText, current.targetLanguage),
    );
    const isCurrentDraft = () =>
      isCurrent() &&
      capturingRef.current &&
      captureGeneration === captureGenerationRef.current &&
      sessionRef.current?.controllerToken === sessionAtStart.controllerToken;
    const transcription = await runCaptionTranscription({
      audio,
      settings: current,
      glossary: activeGlossary,
      controllerToken: sessionAtStart.controllerToken,
      recentContext: recentContextRef.current,
      signal,
      isCurrent: isCurrentDraft,
      currentRevision: sessionAtStart.translationRevision,
      onRevisionMismatch: (lease) =>
        reconcileExternalTranslationRevision(lease.translationRevision, lease.transcriptionRequests),
      onLease: (lease) => {
        attemptsUsedRef.current = lease.transcriptionRequests;
        if (isCurrentDraft()) {
          setLiveState((state) => ({ ...state, transcriptionRequests: lease.transcriptionRequests }));
        }
      },
      onDroppedSegments: () => {},
      onTranscriptionError: (error) => {
        if (
          error instanceof CloudProviderClientError &&
          (error.code === "provider_request_rejected" || error.rateLimit || error.usage)
        ) {
          onDisableForSession();
        }
      },
      dependencies: {
        reserve: (token) => liveClientRef.current.reserveTranscriptionAttempt(token),
        transcribe: (request, context, requestSignal) =>
          cloudClientRef.current.transcribe(request, context, requestSignal),
      },
    });
    if (!transcription || !isCurrentDraft()) return null;
    return {
      sourceText: transcription.sourceText,
      transcription,
      snapshot: {
        captureGeneration,
        controllerToken: sessionAtStart.controllerToken,
        translationRevision: sessionAtStart.translationRevision,
        settings: current,
        liveWords,
        liveNote,
      },
    };
  }, [reconcileExternalTranslationRevision]);
  draftRunnerRef.current = runLiveDraft;

  const drainQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (sessionRef.current && capturingRef.current && queueRef.current.length) {
        const chunk = queueRef.current.shift();
        if (!chunk) continue;
        try {
          await processChunk(chunk.audio, chunk.generation, chunk.draft);
        } catch (error) {
          if (!capturingRef.current || chunk.generation !== captureGenerationRef.current) {
            continue;
          }
          if (error instanceof LiveApiError && error.code === "caption_cleared") continue;
          if ((error instanceof LiveApiError || error instanceof CloudProviderClientError) && error.code === "session_paused") {
            stopCapture();
            resetOutputBuffer();
            setLiveState((state) => ({ ...state, status: "paused", latestPublicText: "", latestPublicAt: null, latestSourceText: "", message: tRef.current("live.message.pausedRemote") }));
            break;
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
            error instanceof Error ? error.message : tRef.current("live.message.captionProcessingFailed");
          if (sessionRef.current?.saveHistory) {
            setLiveState((state) => ({ ...state, historyIncomplete: true }));
            void experienceRequest("gap", {}, sessionRef.current.controllerToken).catch(() => {});
          }
          if (
            isTerminalInferenceControlError(error) ||
            (error instanceof LiveApiError &&
              error.code === "transcription_limit_reached") ||
            /quota|expired|event limit|language could not be detected|authentication/i.test(
              message,
            )
          ) {
            await endLiveSession(message, true);
            break;
          }
          if (!providerBusyRef.current && isProviderLimitError(error)) {
            providerBusyRef.current = true;
            setLiveState((state) => ({
              ...state,
              status: "live",
              message: tRef.current("live.message.captionServiceBusy"),
            }));
            continue;
          }
          setLiveState((state) => ({
            ...state,
            status: "live",
            message,
            droppedChunks: state.droppedChunks + (
              error instanceof CloudProviderClientError && error.code === "translation_incomplete" ? 1 : 0
            ),
          }));
        } finally {
          // The final, or its failure, replaces the in-progress Heard draft, reused or not.
          if (chunk.draftWindowId !== undefined) clearLiveDraft(chunk.draftWindowId);
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [
    clearLiveDraft,
    endLiveSession,
    handleTakenOver,
    processChunk,
    resetOutputBuffer,
    stopCapture,
    reconcileExternalTranslationRevision,
  ]);

  const enqueueChunk = useCallback(
    (audio: Blob, generation: number, draftWindowId?: number) => {
      if (
        !sessionRef.current ||
        !capturingRef.current ||
        generation !== captureGenerationRef.current ||
        audio.size === 0
      ) {
        if (draftWindowId !== undefined) clearLiveDraft(draftWindowId);
        pendingDraftRef.current = null;
        return;
      }
      if (queueRef.current.length >= 2) {
        if (draftWindowId !== undefined) clearLiveDraft(draftWindowId);
        pendingDraftRef.current = null;
        if (sessionRef.current.saveHistory) {
          void experienceRequest("gap", {}, sessionRef.current.controllerToken).catch(() => {});
        }
        setLiveState((state) => ({
          ...state,
          historyIncomplete: state.historyIncomplete || sessionRef.current?.saveHistory === true,
          droppedChunks: state.droppedChunks + 1,
          message: tRef.current("live.message.cloudBehind"),
        }));
        return;
      }
      const pending = pendingDraftRef.current;
      pendingDraftRef.current = null;
      queueRef.current.push({
        audio,
        generation,
        ...(draftWindowId !== undefined ? { draftWindowId } : {}),
        ...(pending?.generation === generation ? { draft: pending } : {}),
      });
      void drainQueue();
    },
    [clearLiveDraft, drainQueue],
  );

  const startRecorder = useCallback(
    (stream: MediaStream, generation: number, recordingWindowMs: RecordingWindowMs) => {
      const startRecorderChunk = () => {
        if (
          !sessionRef.current ||
          !capturingRef.current ||
          generation !== captureGenerationRef.current
        ) {
          return;
        }
        const chunks: Blob[] = [];
        let windowSpeechMs = 0;
        let windowPeakRms = 0;
        let levelReadFailed = false;
        let draftWindowId: number | null = null;
        let endReason: CutReason | null = null;
        let heldDrafts = 0;
        let stoppedAtMs: number | null = null;
        const startedAtMs = performance.now();
        const recorder = new MediaRecorder(stream, recorderOptions());
        recorderRef.current = recorder;
        recorder.ondataavailable = ({ data }) => {
          if (data.size) chunks.push(data);
        };
        recorder.onerror = () => {
          if (generation === captureGenerationRef.current) {
            void endLiveSession(tRef.current("live.message.recorderStopped"), true);
          }
        };
        recorder.onstop = () => {
          endLiveDraftWindow();
          if (recorderRef.current === recorder) recorderRef.current = null;
          if (
            !sessionRef.current ||
            !capturingRef.current ||
            generation !== captureGenerationRef.current
          ) {
            return;
          }
          if (
            !shouldSendWindow(speechGateRef.current, {
              speechMs: windowSpeechMs,
              peakRms: windowPeakRms,
              levelReadFailed,
            })
          ) {
            if (draftWindowId !== null) clearLiveDraft(draftWindowId);
            pendingDraftRef.current = null;
            startRecorderChunk();
            return;
          }
          if (endReason !== null) {
            const cutWindow = {
              reason: endReason,
              lengthMs: (stoppedAtMs ?? performance.now()) - startedAtMs,
              heldDrafts,
            };
            setLiveState((state) => ({ ...state, cutMetrics: recordCutWindow(state.cutMetrics, cutWindow) }));
          }
          const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
          enqueueChunk(new Blob(chunks, { type: mimeType }), generation, draftWindowId ?? undefined);
          startRecorderChunk();
        };
        const windowPolicy = recordingWindowBoundsMs(recordingWindowMs);
        const bounds = providerBusyRef.current ? withRaisedFloor(windowPolicy) : windowPolicy;
        recorder.start(1_000);
        draftWindowId = beginLiveDraftWindow({
          generation,
          recordingWindowMs,
          snapshotAudio: () => new Blob(chunks, {
            type: recorder.mimeType || chunks[0]?.type || "audio/webm",
          }),
        });
        const stopWindow = (reason: CutReason) => {
          if (endReason === null) {
            endReason = reason;
            stoppedAtMs = performance.now();
          }
          if (dynamicWindowTimerRef.current !== null) {
            clearBackgroundInterval(dynamicWindowTimerRef.current);
            dynamicWindowTimerRef.current = null;
          }
          if (recorderTimerRef.current !== null) {
            clearBackgroundTimeout(recorderTimerRef.current);
            recorderTimerRef.current = null;
          }
          if (recorder.state === "recording") recorder.stop();
        };
        let policyState = initialWindowPolicyState();
        let draftHold: DynamicDraftHold = "idle";
        let silenceRun = 0;
        dynamicWindowTimerRef.current = setBackgroundInterval(() => {
          let sampleRms = 0;
          try {
            sampleRms = readLevel();
            if (!Number.isFinite(sampleRms)) {
              levelReadFailed = true;
              sampleRms = 0;
            }
          } catch {
            levelReadFailed = true;
          }
          windowPeakRms = Math.max(windowPeakRms, sampleRms);
          const observed = observeSpeechSample(speechGateRef.current, sampleRms);
          speechGateRef.current = observed.state;
          if (observed.speech) windowSpeechMs += DYNAMIC_SAMPLE_MS;
          const previousSilenceMs = policyState.silenceMs;
          const result = nextWindowDecision(policyState, sampleRms, bounds);
          if (previousSilenceMs > 0 && result.state.silenceMs === 0) {
            silenceRun += 1;
            draftHold = "idle";
          }
          policyState = result.state;
          if (recordingWindowMs !== "dynamic") {
            if (result.decision === "cut") {
              stopWindow(result.state.elapsedMs >= bounds.maxMs ? "limit" : "pause");
            }
            return;
          }
          const action = dynamicPauseAction(result, bounds, draftHold);
          if (action === "continue" || action === "hold") return;
          if (action === "run-draft") {
            const candidateSilenceRun = silenceRun;
            draftHold = "pending";
            void runDraftAtPauseCandidate().then((attempt) => {
              if (
                generation !== captureGenerationRef.current ||
                !capturingRef.current ||
                recorderRef.current !== recorder ||
                recorder.state !== "recording" ||
                candidateSilenceRun !== silenceRun
              ) return;
              const outcome = dynamicDraftResult(
                attempt.available && attempt.preview !== null,
                attempt.preview !== null && draftEndsWithTerminalPunctuation(attempt.preview.sourceText),
              );
              if (outcome === "hold") {
                draftHold = "rejected";
                heldDrafts += 1;
                return;
              }
              // A surviving terminal-punctuation draft is this window's final transcription.
              if (attempt.draft) {
                pendingDraftRef.current = {
                  generation,
                  windowId: attempt.draft.windowId,
                  transcription: attempt.draft.transcription,
                  snapshot: attempt.draft.snapshot,
                };
              }
              stopWindow(attempt.available && attempt.preview !== null ? "sentence" : "pause");
            });
            return;
          }
          stopWindow(result.state.elapsedMs >= bounds.maxMs ? "limit" : "pause");
        }, DYNAMIC_SAMPLE_MS);
        recorderTimerRef.current = setBackgroundTimeout(() => {
          recorderTimerRef.current = null;
          stopWindow("limit");
        }, bounds.maxMs);
      };
      startRecorderChunk();
    },
    [beginLiveDraftWindow, clearLiveDraft, endLiveDraftWindow, endLiveSession, enqueueChunk, readLevel, runDraftAtPauseCandidate],
  );

  const armSessionTimer = useCallback(
    (liveSession: LiveSessionDetails) => {
      clearSessionTimer();
      sessionTimerRef.current = setBackgroundTimeout(() => {
        void endLiveSession(
          tRef.current("live.message.sessionLimit"),
          true,
        );
      }, Math.min(MAX_LIVE_SESSION_MS, new Date(liveSession.expiresAt).getTime() - Date.now()));
    },
    [clearSessionTimer, endLiveSession],
  );

  const loadChannel = useCallback(async (silent = false) => {
    const loadGeneration = ++loadGenerationRef.current;
    const loadIsCurrent = () =>
      loadGenerationRef.current === loadGeneration &&
      !endingRef.current &&
      !endRetryRequiredRef.current;
    if (!loadIsCurrent()) return;
    if (!silent) {
      setLiveState((current) => ({
        ...current,
        status: "loading-channel",
        message: tRef.current("live.message.loadingChannel"),
      }));
    }
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
          const recovered: LiveSessionDetails = {
            sessionId: channel.sessionId,
            saveHistory: channel.saveHistory,
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
          recordingWindowRef.current =
            storedTranslationSettings?.recordingWindowMs ?? DEFAULT_RECORDING_WINDOW_MS;
          sessionRef.current = recovered;
          activeTranslationSettingsRef.current = storedTranslationSettings;
          setActiveTranslationSettings(storedTranslationSettings);
          requireTranslationRefresh(!storedTranslationSettings);
          refreshShouldResumeRef.current = false;
          translationRefreshRequestIdRef.current = null;
          armSessionTimer(recovered);
          setLiveState({
            ...INITIAL_LIVE_STATE,
            status: "paused",
            message: tRef.current(
              storedTranslationSettings
                ? "live.message.recovered"
                : "live.message.recoveredNoSettings",
            ),
            channel: {
              ...channel,
              status: "paused",
              translationRevision: recovery.translationRevision,
            },
            liveSession: recovered,
            transcriptionRequests: channel.transcriptionRequests,
            llmUsage: channel.llmUsage,
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
        message: tRef.current(
          channel.configured
            ? channel.status === "idle"
              ? "live.message.channelConfigured"
              : "live.message.channelOtherOperator"
            : "live.message.channelCreate",
        ),
        channel,
        transcriptionRequests: channel.transcriptionRequests,
        llmUsage: channel.llmUsage,
      });
    } catch (error) {
      if (!loadIsCurrent()) return;
      if (silent) return;
      setRotationRecoveryRequired(
        error instanceof LiveApiError && error.code === "invalid_overlay_key",
      );
      setLiveState({
        ...INITIAL_LIVE_STATE,
        status: "error",
        message: error instanceof Error ? error.message : tRef.current("live.message.channelLoadFailed"),
      });
    }
  }, [armSessionTimer, requireTranslationRefresh]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const liveSession = sessionRef.current;
    if (!liveSession) return;
    const style = normalizeCaptionStyle(settings.style);
    const timeout = window.setTimeout(() => {
      if (sessionRef.current?.controllerToken !== liveSession.controllerToken) return;
      void liveClientRef.current
        .updateStyle(style, liveSession.controllerToken)
        .catch((error) => {
          if (isControllerReplaced(error)) {
            handleTakenOver();
            return;
          }
          setLiveState((state) => ({
            ...state,
            message: error instanceof Error ? error.message : tRef.current("live.message.styleUpdateFailed"),
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
        message: tRef.current("live.message.channelCreated"),
        channel,
      }));
    } catch (error) {
      setLiveState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : tRef.current("live.message.channelCreationFailed"),
      }));
    } finally {
      setChannelAction(null);
    }
  }, [channelAction]);

  const rotateChannel = useCallback(async () => {
    if (channelAction || sessionRef.current) return;
    setChannelAction("rotate");
    try {
      const channel = await liveClientRef.current.rotateChannel();
      setRotationRecoveryRequired(false);
      setLiveState((current) => ({
        ...current,
        status: "idle",
        message: tRef.current("live.message.urlRotated"),
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
        channel,
      }));
    } catch (error) {
      setLiveState((current) => ({
        ...current,
        status: "error",
        message: error instanceof Error ? error.message : tRef.current("live.message.urlRotationFailed"),
      }));
    } finally {
      setChannelAction(null);
    }
  }, [channelAction]);

  const saveChannelStyle = useCallback(async () => {
    if (!liveState.channel?.configured || channelAction) return;
    setChannelAction("save-style");
    try {
      const liveSession = sessionRef.current;
      const style = normalizeCaptionStyle(settingsRef.current.style);
      await liveClientRef.current.updateStyle(style, liveSession?.controllerToken);
      setLiveState((current) => ({
        ...current,
        message: tRef.current("live.message.styleSaved"),
        channel: current.channel ? { ...current.channel, style } : current.channel,
      }));
    } catch (error) {
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message: error instanceof Error ? error.message : tRef.current("live.message.styleSaveFailed"),
        }));
      }
    } finally {
      setChannelAction(null);
    }
  }, [channelAction, handleTakenOver, liveState.channel?.configured]);

  const rememberReaderLink = useCallback((readerUrl: string) => {
    const liveSession = sessionRef.current;
    if (!liveSession) return;
    const updated = { ...liveSession, readerUrl };
    sessionRef.current = updated;
    setLiveState((current) => ({ ...current, liveSession: updated }));
  }, []);

  const replaceViewerLink = useCallback(async () => {
    const liveSession = sessionRef.current;
    if (
      !liveSession ||
      viewerAction ||
      endingRef.current ||
      endRetryRequiredRef.current
    ) {
      return;
    }
    const sessionIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      sessionRef.current?.controllerToken === liveSession.controllerToken;
    setViewerAction("replace");
    try {
      const { viewerUrl } = await liveClientRef.current.replaceViewerLink(
        liveSession.controllerToken,
      );
      if (!sessionIsCurrent()) return;
      const currentSession = sessionRef.current;
      if (!currentSession) return;
      const updated = { ...currentSession, viewerUrl };
      sessionRef.current = updated;
      window.sessionStorage.setItem(VIEWER_STORAGE_KEY, viewerUrl);
      setLiveState((current) => ({
        ...current,
        liveSession: updated,
        message: tRef.current("live.message.viewerReplaced"),
      }));
    } catch (error) {
      if (!sessionIsCurrent()) return;
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message:
            error instanceof Error
              ? error.message
              : tRef.current("live.message.viewerReplaceFailed"),
        }));
      }
    } finally {
      setViewerAction(null);
    }
  }, [handleTakenOver, viewerAction]);

  // The Start flow: begins capture, then registers the live session with the server through
  // the client's startLiveSession.
  const startSession = useCallback(
    async (takeover = false) => {
      if (sessionRef.current || endingRef.current) return;
      discardMicTest();
      startLiveDraftSession();
      attemptsUsedRef.current = 0;
      loadGenerationRef.current += 1;
      endRetryRequiredRef.current = false;
      setEndRetryRequired(false);
      setTakeoverRequired(false);
      setLiveState((current) => ({
        ...current,
        status: "starting",
        message: takeover
          ? tRef.current("live.message.takingOver")
          : tRef.current("live.message.verifying"),
        sequence: 0,
        historyIncomplete: false,
        droppedChunks: 0,
        filteredSegments: 0,
        transcriptionRequests: 0,
        cutMetrics: createCutMetrics(),
        llmUsage: emptyLlmSessionUsage(),
        latestSourceText: "",
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
        lastLatencyMs: null,
      }));
      try {
        if (!liveState.channel?.configured) {
          throw new Error(tRef.current("live.message.channelRequired"));
        }
        if (typeof MediaRecorder === "undefined") {
          throw new Error(tRef.current("live.message.recordingUnsupported"));
        }
        await cloudClientRef.current.readiness();
        const stream = await ensureMicrophone(selectedDeviceId || undefined);
        const translationSettings = normalizeTranslationSessionSettings(
          settingsRef.current,
        );
        const liveSession = await liveClientRef.current.startLiveSession(
          normalizeCaptionStyle(settingsRef.current.style),
          takeover,
          settingsRef.current.saveHistory === true,
        );
        const recordingWindowMs = translationSettings.recordingWindowMs;
        sessionRef.current = liveSession;
        activeTranslationSettingsRef.current = translationSettings;
        setActiveTranslationSettings(translationSettings);
        requireTranslationRefresh(false);
        refreshShouldResumeRef.current = false;
        translationRefreshRequestIdRef.current = null;
        recordingWindowRef.current = recordingWindowMs;
        window.sessionStorage.setItem(
          CONTROLLER_STORAGE_KEY,
          liveSession.controllerToken,
        );
        if (liveSession.viewerUrl) {
          window.sessionStorage.setItem(VIEWER_STORAGE_KEY, liveSession.viewerUrl);
        }
        window.sessionStorage.setItem(
          TRANSLATION_SETTINGS_STORAGE_KEY,
          serializeTranslationSessionSettings(translationSettings, liveSession),
        );
        window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
        recentContextRef.current = [];
        queueRef.current = [];
        speechGateRef.current = initialSpeechGateState();
        providerBusyRef.current = false;
        resetOutputBuffer();
        resetRecentOutputs();
        captureGenerationRef.current += 1;
        const generation = captureGenerationRef.current;
        captureAbortRef.current = new AbortController();
        capturingRef.current = true;
        startRecorder(stream, generation, recordingWindowMs);
        armSessionTimer(liveSession);
        const recordingWindowText =
          recordingWindowMs === "dynamic"
            ? tRef.current("recordingWindow.dynamicShort")
            : tRef.current("recordingWindow.secondsShort", {
                seconds: recordingWindowMs / 1_000,
              });
        setLiveState((current) => ({
          ...current,
          status: "live",
          message: takeover
            ? tRef.current("live.message.takeoverComplete")
            : tRef.current("live.message.listening", {
                window: recordingWindowText,
              }),
          liveSession,
          channel: current.channel
            ? {
                ...current.channel,
                status: "live",
                startedAt: liveSession.startedAt,
                expiresAt: liveSession.expiresAt,
                translationRevision: liveSession.translationRevision,
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
            message: tRef.current("live.message.channelInUse"),
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
          error instanceof Error ? error.message : tRef.current("live.message.startFailed");
        if (sessionRef.current) {
          await endLiveSession(tRef.current("live.message.startIncomplete", { detail }), true);
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
      armSessionTimer,
      endLiveSession,
      ensureMicrophone,
      liveState.channel?.configured,
      discardMicTest,
      requireTranslationRefresh,
      resetOutputBuffer,
      resetRecentOutputs,
      selectedDeviceId,
      startRecorder,
      startLiveDraftSession,
      stopMicrophone,
    ],
  );

  const pauseOrConfirmSession = useCallback(
    async (liveSession: LiveSessionDetails) => {
      try {
        return await liveClientRef.current.control(
          "pause",
          liveSession.controllerToken,
        );
      } catch (error) {
        if (isControllerReplaced(error)) throw error;
        try {
          const channel = await liveClientRef.current.getChannel();
          if (
            channel.configured &&
            channel.status === "paused" &&
            channel.startedAt === liveSession.startedAt &&
            channel.expiresAt === liveSession.expiresAt
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
    const liveSession = sessionRef.current;
    if (!liveSession || endingRef.current) return;
    const sessionIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      sessionRef.current?.controllerToken === liveSession.controllerToken;
    setControlAction("pause");
    setLiveState((current) => ({
      ...current,
      status: "pausing",
      message: tRef.current("live.message.stoppingCapture"),
    }));
    stopCapture();
    resetOutputBuffer();
    try {
      const response = await pauseOrConfirmSession(liveSession);
      if (!sessionIsCurrent()) return;
      if (response.translationRevision !== liveSession.translationRevision) {
        reconcileExternalTranslationRevision(response.translationRevision);
        return;
      }
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message: tRef.current("live.message.paused"),
        latestSourceText: "",
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
        channel: current.channel ? { ...current.channel, status: "paused" } : null,
      }));
    } catch (error) {
      if (!sessionIsCurrent()) return;
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          status: "error",
          message: tRef.current("live.message.pauseNotConfirmed", {
            detail:
              error instanceof Error
                ? error.message
                : tRef.current("live.message.retryPauseOrEnd"),
          }),
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [
    handleTakenOver,
    pauseOrConfirmSession,
    reconcileExternalTranslationRevision,
    resetOutputBuffer,
    stopCapture,
  ]);

  const resumeSession = useCallback(async () => {
    const liveSession = sessionRef.current;
    if (!liveSession || endingRef.current) return;
    const sessionIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      sessionRef.current?.controllerToken === liveSession.controllerToken;
    if (
      translationRefreshRequiredRef.current ||
      !activeTranslationSettingsRef.current
    ) {
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message: tRef.current("live.message.reviewSettings"),
      }));
      return;
    }
    setControlAction("resume");
    setLiveState((current) => ({
      ...current,
      status: "resuming",
      message: tRef.current("live.message.resuming"),
    }));
    try {
      const stream = await ensureMicrophone(selectedDeviceId || undefined);
      const response = await liveClientRef.current.control(
        "resume",
        liveSession.controllerToken,
      );
      if (!sessionIsCurrent()) {
        stopCapture();
        return;
      }
      if (response.translationRevision !== liveSession.translationRevision) {
        refreshShouldResumeRef.current = true;
        reconcileExternalTranslationRevision(response.translationRevision);
        return;
      }
      captureGenerationRef.current += 1;
      const generation = captureGenerationRef.current;
      captureAbortRef.current = new AbortController();
      capturingRef.current = true;
      queueRef.current = [];
      startRecorder(stream, generation, recordingWindowRef.current);
      setLiveState((current) => ({
        ...current,
        status: "live",
        message: tRef.current("live.message.resumed"),
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
        channel: current.channel ? { ...current.channel, status: "live" } : null,
      }));
    } catch (error) {
      stopCapture();
      if (!sessionIsCurrent()) return;
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          status: "paused",
          message: tRef.current("live.message.stillPaused", {
            detail:
              error instanceof Error
                ? error.message
                : tRef.current("live.message.resumeFailed"),
          }),
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
    const liveSession = sessionRef.current;
    if (
      !liveSession ||
      endingRef.current ||
      endRetryRequiredRef.current ||
      controlAction
    ) {
      return;
    }
    const sessionIsCurrent = () =>
      !endingRef.current &&
      !endRetryRequiredRef.current &&
      sessionRef.current?.controllerToken === liveSession.controllerToken;

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
            : tRef.current("live.message.invalidSettings"),
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
        tRef.current("live.message.refreshing"),
    }));
    stopTranslationCapture();

    try {
      const response = await liveClientRef.current.refreshTranslation(
        liveSession.controllerToken,
        liveSession.translationRevision,
        refreshRequestId,
      );
      if (!sessionIsCurrent()) {
        stopCapture();
        return;
      }
      const updatedSession = {
        ...(sessionRef.current ?? liveSession),
        translationRevision: response.translationRevision,
      };
      sessionRef.current = updatedSession;
      activeTranslationSettingsRef.current = translationSettings;
      setActiveTranslationSettings(translationSettings);
      recordingWindowRef.current = translationSettings.recordingWindowMs;
      recentContextRef.current = [];
      queueRef.current = [];
      resetOutputBuffer();
      window.sessionStorage.setItem(
        TRANSLATION_SETTINGS_STORAGE_KEY,
        serializeTranslationSessionSettings(
          translationSettings,
          updatedSession,
        ),
      );
      window.sessionStorage.removeItem(LEGACY_SPEECH_BUFFER_STORAGE_KEY);
      requireTranslationRefresh(false);
      translationRefreshRequestIdRef.current = null;

      if (shouldResume) {
        try {
          const stream = await ensureMicrophone(selectedDeviceId || undefined);
          if (!sessionIsCurrent()) {
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
            translationSettings.recordingWindowMs,
          );
          refreshShouldResumeRef.current = false;
          setLiveState((current) => ({
            ...current,
            status: "live",
            message:
              tRef.current("live.message.refreshedLive"),
            latestSourceText: "",
            latestPublicText: "",
            latestPublicAt: null,
            latestPublicLanguage: null,
            lastLatencyMs: null,
            liveSession: updatedSession,
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
          if (!sessionIsCurrent()) return;
          refreshShouldResumeRef.current = false;
          let pauseError: unknown;
          try {
            const pauseResponse = await pauseOrConfirmSession(updatedSession);
            if (!sessionIsCurrent()) {
              stopCapture();
              return;
            }
            if (
              pauseResponse.translationRevision !==
              updatedSession.translationRevision
            ) {
              reconcileExternalTranslationRevision(
                pauseResponse.translationRevision,
              );
              return;
            }
          } catch (caught) {
            pauseError = caught;
          }
          if (!sessionIsCurrent()) {
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
              ? tRef.current("live.message.refreshResumeFailed", {
                  detail:
                    error instanceof Error
                      ? error.message
                      : tRef.current("live.message.microphoneAccessFailed"),
                })
              : tRef.current("live.message.refreshPauseFailed", {
                  detail:
                    pauseError instanceof Error
                      ? pauseError.message
                      : tRef.current("live.message.pauseConfirmFailed"),
                }),
            latestSourceText: "",
            latestPublicText: "",
            latestPublicAt: null,
            latestPublicLanguage: null,
            lastLatencyMs: null,
            liveSession: updatedSession,
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
            const pauseResponse = await pauseOrConfirmSession(updatedSession);
            if (!sessionIsCurrent()) {
              stopCapture();
              return;
            }
            if (
              pauseResponse.translationRevision !==
              updatedSession.translationRevision
            ) {
              reconcileExternalTranslationRevision(
                pauseResponse.translationRevision,
              );
              return;
            }
          } catch (caught) {
            pauseError = caught;
          }
          if (!sessionIsCurrent()) {
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
              message: tRef.current("live.message.refreshPauseFailed", {
                detail:
                  pauseError instanceof Error
                    ? pauseError.message
                    : tRef.current("live.message.pauseConfirmFailed"),
              }),
              latestSourceText: "",
              latestPublicText: "",
              latestPublicAt: null,
              latestPublicLanguage: null,
              lastLatencyMs: null,
              liveSession: updatedSession,
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
            tRef.current("live.message.refreshedPaused"),
          latestSourceText: "",
          latestPublicText: "",
          latestPublicAt: null,
          latestPublicLanguage: null,
          lastLatencyMs: null,
          liveSession: updatedSession,
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
      if (!sessionIsCurrent()) return;
      if (isControllerReplaced(error)) {
        handleTakenOver();
      } else {
        if (
          error instanceof LiveApiError &&
          typeof error.translationRevision === "number"
        ) {
          const currentSession = sessionRef.current;
          if (currentSession) {
            const reconciled = {
              ...currentSession,
              translationRevision: error.translationRevision,
            };
            sessionRef.current = reconciled;
            setLiveState((current) => ({ ...current, liveSession: reconciled }));
          }
        }
        setLiveState((current) => ({
          ...current,
          status: "paused",
          message: tRef.current("live.message.refreshNotConfirmed", {
            detail:
              error instanceof Error
                ? error.message
                : tRef.current("live.message.refreshFailed"),
          }),
          latestSourceText: "",
          latestPublicText: "",
          latestPublicAt: null,
          latestPublicLanguage: null,
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
    pauseOrConfirmSession,
    reconcileExternalTranslationRevision,
    requireTranslationRefresh,
    resetOutputBuffer,
    selectedDeviceId,
    startRecorder,
    stopCapture,
    stopMicrophone,
    stopTranslationCapture,
  ]);

  const clearCaption = useCallback(async () => {
    if (!liveState.channel?.configured || endingRef.current) return;
    setControlAction("clear");
    const wasCapturing = capturingRef.current;
    stopTranslationCapture();
    resetOutputBuffer();
    recentContextRef.current = [];
    try {
      await liveClientRef.current.control(
        "clear",
        sessionRef.current?.controllerToken,
      );
      if (wasCapturing && streamRef.current?.active && sessionRef.current) {
        capturingRef.current = true;
        captureAbortRef.current = new AbortController();
        startRecorder(streamRef.current, captureGenerationRef.current, recordingWindowRef.current);
      }
      setLiveState((current) => ({
        ...current,
        message: tRef.current(
          current.status === "paused"
            ? "live.message.clearedPaused"
            : "live.message.clearedLive",
        ),
        latestSourceText: "",
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
      }));
      return true;
    } catch (error) {
      stopCapture();
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          status: "error",
          message: error instanceof Error ? error.message : tRef.current("live.message.clearFailed"),
        }));
      }
      return false;
    } finally {
      setControlAction(null);
    }
  }, [handleTakenOver, liveState.channel?.configured, resetOutputBuffer, startRecorder, stopTranslationCapture, stopCapture, streamRef]);

  const showTestCaption = useCallback(async () => {
    if (!liveState.channel?.configured || liveState.status === "live") return;
    setControlAction("show-test");
    try {
      const current = settingsRef.current;
      const response = await liveClientRef.current.control(
        "show-test",
        sessionRef.current?.controllerToken,
        {
          targetLanguage: current.targetLanguage,
          style: normalizeCaptionStyle(current.style),
        },
      );
      setLiveState((state) => ({
        ...state,
        message:
          state.status === "paused"
            ? tRef.current("live.message.testShownPaused")
            : tRef.current("live.message.testShown"),
        sequence: response.sequence ?? state.sequence,
        latestSourceText: "",
        latestPublicText: SAMPLE_CAPTIONS[current.targetLanguage],
        latestPublicAt: Date.now(),
        latestPublicLanguage: current.targetLanguage,
        channel: state.channel
          ? { ...state.channel, style: normalizeCaptionStyle(current.style) }
          : state.channel,
      }));
    } catch (error) {
      if (isControllerReplaced(error)) handleTakenOver();
      else {
        setLiveState((current) => ({
          ...current,
          message: error instanceof Error ? error.message : tRef.current("live.message.testFailed"),
        }));
      }
    } finally {
      setControlAction(null);
    }
  }, [handleTakenOver, liveState.channel?.configured, liveState.status]);

  const showManualCaption = useCallback(
    async (text: string) => {
      const manualText = text.trim();
      if (!liveState.channel?.configured || liveState.status !== "paused" || !manualText) {
        return;
      }
      setControlAction("manual");
      try {
        const current = settingsRef.current;
        const targetLanguage =
          activeTranslationSettingsRef.current?.targetLanguage ?? current.targetLanguage;
        const response = await liveClientRef.current.control(
          "manual",
          sessionRef.current?.controllerToken,
          {
            targetLanguage,
            style: normalizeCaptionStyle(current.style),
            manualText,
          },
        );
        setLiveState((state) => ({
          ...state,
          message: response.historyIncomplete
            ? tRef.current("live.message.manualNotSaved")
            : tRef.current("live.message.manualShown"),
          sequence: response.sequence ?? state.sequence,
          historyIncomplete: state.historyIncomplete || response.historyIncomplete === true,
          latestSourceText: "",
          latestPublicText: manualText,
          latestPublicAt: Date.now(),
          latestPublicLanguage: targetLanguage,
          channel: state.channel
            ? { ...state.channel, style: normalizeCaptionStyle(current.style) }
            : state.channel,
        }));
      } catch (error) {
        if (isControllerReplaced(error)) handleTakenOver();
        else {
          setLiveState((current) => ({
            ...current,
            message: error instanceof Error ? error.message : tRef.current("live.message.manualFailed"),
          }));
        }
      } finally {
        setControlAction(null);
      }
    },
    [handleTakenOver, liveState.channel?.configured, liveState.status],
  );

  useEffect(() => {
    const pauseForLifecycle = () => {
      if (lifecyclePauseRef.current) return;
      lifecyclePauseRef.current = true;
      stopCapture();
      resetOutputBuffer();
      const liveSession = sessionRef.current;
      if (!liveSession) return;
      setLiveState((current) => ({
        ...current,
        status: "paused",
        message: tRef.current("live.message.appInactive"),
        latestSourceText: "",
        latestPublicText: "",
        latestPublicAt: null,
        latestPublicLanguage: null,
        channel: current.channel ? { ...current.channel, status: "paused" } : null,
      }));
      void fetch("/api/live/channel/control", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-caption-controller": liveSession.controllerToken,
        },
        body: JSON.stringify({ action: "pause" }),
        keepalive: true,
      });
    };

    const reconcileAfterForeground = () => {
      lifecyclePauseRef.current = false;
      void loadChannel();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && lifecyclePauseRef.current) reconcileAfterForeground();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && lifecyclePauseRef.current) {
        reconcileAfterForeground();
      }
    };

    window.addEventListener("pagehide", pauseForLifecycle);
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", pauseForLifecycle);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadChannel, resetOutputBuffer, stopCapture]);

  useEffect(() => {
    if (!navigator.mediaDevices) return;
    const onDeviceChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      stopCapture();
    };
  }, [refreshDevices, stopCapture]);

  useEffect(() => {
    if (!liveState.liveSession?.sessionId) return;
    let cancelled = false;
    const controller = liveState.liveSession.controllerToken;
    const stop = startSerialPolling(async () => {
      if (cancelled || sessionRef.current?.controllerToken !== controller || endingRef.current) return;
      try {
        const state = await experienceRequest<{ status: string; command: { id: string; action: "pause" | "resume" | "clear"; status: string } | null }>("host", { capturing: capturingRef.current }, controller);
        if (cancelled || sessionRef.current?.controllerToken !== controller) return;
        const command = state.command;
        if (command?.status === "pending") {
          if (remoteResultRef.current?.controller !== controller || remoteResultRef.current.id !== command.id) {
            let success = true;
            if (command.action === "pause") { await pauseSession(); success = !capturingRef.current; }
            else if (command.action === "resume") { await resumeSession(); success = capturingRef.current; }
            else success = Boolean(await clearCaption());
            remoteResultRef.current = { controller, id: command.id, success };
          }
          if (!cancelled) await experienceRequest("host", { acknowledgement: command.id, success: remoteResultRef.current.success, capturing: capturingRef.current }, controller);
        } else if (state.status === "paused" && capturingRef.current) {
          await pauseSession();
        }
      } catch { /* The inference boundary still enforces server pause while reconnecting. */ }
    }, 2000);
    return () => { cancelled = true; stop(); };
  }, [liveState.liveSession?.sessionId, liveState.liveSession?.controllerToken, pauseSession, resumeSession, clearCaption]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId: (deviceId: string) => {
      micTest.discard();
      chooseDevice(deviceId);
    },
    microphoneState,
    microphoneError,
    level,
    liveState,
    controlAction,
    channelAction,
    viewerAction,
    activeTranslationSettings,
    translationRefreshRequired,
    activeRecordingWindowMs:
      activeTranslationSettings?.recordingWindowMs ?? settings.recordingWindowMs,
    endRetryRequired,
    takeoverRequired,
    rotationRecoveryRequired,
    cancelTakeover: () => setTakeoverRequired(false),
    micTest,
    createChannel,
    rotateChannel,
    saveChannelStyle,
    replaceViewerLink,
    startSession,
    pauseSession,
    resumeSession,
    refreshTranslationSession,
    clearCaption,
    liveWordEntries,
    addLiveWordEntry,
    removeLiveWordEntry,
    rememberReaderLink,
    showTestCaption,
    showManualCaption,
    outputBufferQueue,
    recentOutputs,
    liveDraft: liveDraftPreview,
    liveDraftSessionDisabled,
    resetLiveDrafts,
    setOutputBufferEntryPaused,
    clearOutputBufferEntry,
    fastForwardOutputBufferEntry,
    beginOutputBufferEdit,
    updateOutputBufferEditDraft,
    cancelOutputBufferEdit,
    submitOutputBufferEdit,
    stopSession: () => endLiveSession(),
    reloadChannel: loadChannel,
  };
}
