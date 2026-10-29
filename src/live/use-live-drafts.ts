"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { MAX_TRANSCRIPTION_REQUESTS, recordingWindowBoundsMs, type RecordingWindowMs } from "@/live/contracts";
import { clearBackgroundTimeout, setBackgroundTimeout } from "@/live/background-timer";
import { canDraft, DRAFT_END_MARGIN_MS, DRAFT_MIN_NEW_AUDIO_MS, draftOffsets } from "@/live/live-drafts";

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

interface UseLiveDraftsOptions {
  enabled: boolean;
  runnerRef: MutableRefObject<LiveDraftRunner>;
  attemptsUsed: () => number;
  finalBusy: () => boolean;
  remainingServiceMs: () => number;
  onPartialAudioRejected: () => void;
}

export function useLiveDrafts(options: UseLiveDraftsOptions) {
  const [draft, setDraft] = useState<LiveDraftPreview | null>(null);
  const optionsRef = useRef(options);
  const activeWindowRef = useRef<DraftWindow | null>(null);
  const nextWindowIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionDisabledRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) clearBackgroundTimeout(timer);
    timersRef.current = [];
  }, []);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const endWindow = useCallback(() => {
    clearTimers();
    activeWindowRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    nextWindowIdRef.current += 1;
    setDraft(null);
  }, [clearTimers]);

  const startSession = useCallback(() => {
    sessionDisabledRef.current = false;
    endWindow();
  }, [endWindow]);

  const runDraft = useCallback(async (window: DraftWindow, offsetMs: number) => {
    const isCurrent = () =>
      activeWindowRef.current?.id === window.id &&
      !window.disabled &&
      !sessionDisabledRef.current;
    if (!isCurrent() || !optionsRef.current.enabled) return;
    if (!window.dynamic && window.maxWindowMs - offsetMs < DRAFT_END_MARGIN_MS) return;
    if (offsetMs - window.lastDraftAtMs < DRAFT_MIN_NEW_AUDIO_MS) return;
    if (!canDraft({
      attemptsUsed: optionsRef.current.attemptsUsed(),
      maxAttempts: MAX_TRANSCRIPTION_REQUESTS,
      remainingMs: optionsRef.current.remainingServiceMs(),
      windowMs: window.maxWindowMs,
      draftsUsed: window.draftsUsed,
      finalBusy: optionsRef.current.finalBusy(),
      draftInFlight: controllerRef.current !== null,
    })) return;

    const audio = window.snapshotAudio();
    if (!audio.size) return;
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
          sessionDisabledRef.current = true;
          optionsRef.current.onPartialAudioRejected();
        },
      });
      if (result && isCurrent() && !controller.signal.aborted) setDraft(result);
    } catch {
      if (activeWindowRef.current?.id !== window.id || controller.signal.aborted) return;
      window.disabled = true;
      clearTimers();
      setDraft(null);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [clearTimers]);

  useEffect(() => {
    if (options.enabled) return;
    clearTimers();
    activeWindowRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, [clearTimers, options.enabled]);

  const beginWindow = useCallback((input: {
    generation: number;
    recordingWindowMs: RecordingWindowMs;
    snapshotAudio: () => Blob;
  }) => {
    endWindow();
    if (!optionsRef.current.enabled || sessionDisabledRef.current) return;
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
  }, [endWindow, runDraft]);

  useEffect(() => () => {
    clearTimers();
    controllerRef.current?.abort();
  }, [clearTimers]);

  return { draft, beginWindow, endWindow, startSession, reset: endWindow };
}
