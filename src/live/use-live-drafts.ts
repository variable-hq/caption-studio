"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { MAX_TRANSCRIPTION_REQUESTS, recordingWindowBoundsMs, type RecordingWindowMs } from "@/live/contracts";
import { clearBackgroundTimeout, setBackgroundTimeout } from "@/live/background-timer";
import {
  canDraft,
  createLiveDraftToggle,
  DRAFT_END_MARGIN_MS,
  DRAFT_MIN_NEW_AUDIO_MS,
  draftOffsets,
} from "@/live/live-drafts";

export interface LiveDraftPreview {
  sourceText: string;
  publicText: string;
}

export interface LiveDraftRunContext {
  audio: Blob;
  signal: AbortSignal;
  captureGeneration: number;
  isCurrent: () => boolean;
  onPartialAudioRejected: () => void;
}

export type LiveDraftRunner = (context: LiveDraftRunContext) => Promise<LiveDraftPreview | null>;

interface DraftWindow {
  id: number;
  generation: number;
  maxWindowMs: number;
  dynamic: boolean;
  snapshotAudio: () => Blob;
  draftsUsed: number;
  lastDraftAtMs: number;
  disabled: boolean;
}

export interface LiveDraftAttempt {
  available: boolean;
  preview: LiveDraftPreview | null;
}

interface UseLiveDraftsOptions {
  enabled: boolean;
  runnerRef: MutableRefObject<LiveDraftRunner>;
  attemptsUsed: () => number;
  finalBusy: () => boolean;
  remainingServiceMs: () => number;
}

export function useLiveDrafts(options: UseLiveDraftsOptions) {
  const [draft, setDraft] = useState<LiveDraftPreview | null>(null);
  const [sessionDisabled, setSessionDisabled] = useState(false);
  const optionsRef = useRef(options);
  const activeWindowRef = useRef<DraftWindow | null>(null);
  const nextWindowIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const toggleRef = useRef<ReturnType<typeof createLiveDraftToggle> | null>(null);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearBackgroundTimeout(timer);
    timersRef.current = [];
  }, []);

  const invalidateWindow = useCallback(() => {
    activeWindowRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    nextWindowIdRef.current += 1;
  }, []);

  const getToggle = useCallback(() => {
    if (!toggleRef.current) {
      toggleRef.current = createLiveDraftToggle(optionsRef.current.enabled, {
        invalidatePendingWork: () => {
          clearTimers();
          invalidateWindow();
        },
        setSessionDisabled,
      });
    }
    return toggleRef.current;
  }, [clearTimers, invalidateWindow, setSessionDisabled]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    getToggle().setEnabled(options.enabled);
  }, [getToggle, options.enabled]);

  const endWindow = useCallback(() => {
    getToggle().reset();
    setDraft(null);
  }, [getToggle]);

  const startSession = useCallback(() => {
    getToggle().startSession();
    setDraft(null);
  }, [getToggle]);

  const runDraft = useCallback(async (window: DraftWindow, offsetMs: number): Promise<LiveDraftAttempt> => {
    const isCurrent = () =>
      activeWindowRef.current?.id === window.id &&
      !window.disabled &&
      getToggle().canRun();
    if (!isCurrent()) return { available: false, preview: null };
    if (!window.dynamic && window.maxWindowMs - offsetMs < DRAFT_END_MARGIN_MS) return { available: false, preview: null };
    if (offsetMs - window.lastDraftAtMs < DRAFT_MIN_NEW_AUDIO_MS) return { available: false, preview: null };
    if (!canDraft({
      attemptsUsed: optionsRef.current.attemptsUsed(),
      maxAttempts: MAX_TRANSCRIPTION_REQUESTS,
      remainingMs: optionsRef.current.remainingServiceMs(),
      windowMs: window.maxWindowMs,
      draftsUsed: window.draftsUsed,
      finalBusy: optionsRef.current.finalBusy(),
      draftInFlight: controllerRef.current !== null,
    })) return { available: false, preview: null };

    const audio = window.snapshotAudio();
    if (!audio.size) return { available: false, preview: null };
    const controller = new AbortController();
    controllerRef.current = controller;
    window.draftsUsed += 1;
    window.lastDraftAtMs = offsetMs;
    try {
      const result = await optionsRef.current.runnerRef.current({
        audio,
        signal: controller.signal,
        captureGeneration: window.generation,
        isCurrent: () => isCurrent() && !controller.signal.aborted,
        onPartialAudioRejected: () => {
          getToggle().disableForSession();
          setDraft(null);
        },
      });
      const preview = result && isCurrent() && !controller.signal.aborted ? result : null;
      if (preview) setDraft(preview);
      return { available: preview !== null, preview };
    } catch {
      if (activeWindowRef.current?.id !== window.id || controller.signal.aborted) {
        return { available: false, preview: null };
      }
      window.disabled = true;
      clearTimers();
      setDraft(null);
      return { available: false, preview: null };
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [clearTimers, getToggle]);

  const runAtPauseCandidate = useCallback(async (elapsedMs: number): Promise<LiveDraftAttempt> => {
    const window = activeWindowRef.current;
    if (!window?.dynamic) return { available: false, preview: null };
    return runDraft(window, elapsedMs);
  }, [runDraft]);

  const beginWindow = useCallback((input: {
    generation: number;
    recordingWindowMs: RecordingWindowMs;
    snapshotAudio: () => Blob;
  }) => {
    endWindow();
    if (!getToggle().canRun()) return;
    const bounds = recordingWindowBoundsMs(input.recordingWindowMs);
    const window: DraftWindow = {
      id: ++nextWindowIdRef.current,
      generation: input.generation,
      maxWindowMs: bounds.maxMs,
      dynamic: input.recordingWindowMs === "dynamic",
      snapshotAudio: input.snapshotAudio,
      draftsUsed: 0,
      lastDraftAtMs: 0,
      disabled: false,
    };
    activeWindowRef.current = window;
    for (const offsetMs of draftOffsets(input.recordingWindowMs)) {
      const timer = setBackgroundTimeout(() => {
        void runDraft(window, offsetMs);
      }, offsetMs);
      timersRef.current.push(timer);
    }
  }, [endWindow, getToggle, runDraft]);

  useEffect(() => () => {
    toggleRef.current?.reset();
  }, []);

  return { draft, beginWindow, endWindow, startSession, reset: endWindow, sessionDisabled, runAtPauseCandidate };
}
