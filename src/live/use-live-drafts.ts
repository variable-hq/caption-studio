"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import type { CaptionTranscriptionResult } from "@/live/caption-inference";
import {
  MAX_TRANSCRIPTION_REQUESTS,
  recordingWindowBoundsMs,
  type RecordingWindowMs,
} from "@/live/contracts";
import { canDraft, createLiveDraftToggle } from "@/live/live-drafts";
import { clearHeardDraft, type DraftReuseSnapshot, type HeardDraft } from "@/live/live-heard";

export type LiveDraftPreview = HeardDraft;

export interface LiveDraftRunContext {
  audio: Blob;
  signal: AbortSignal;
  captureGeneration: number;
  isCurrent: () => boolean;
  /** Stop drafts for the rest of the session after a provider limit or rejection. */
  onDisableForSession: () => void;
}

export interface LiveDraftResult {
  sourceText: string;
  transcription: CaptionTranscriptionResult;
  snapshot: DraftReuseSnapshot;
}

export type LiveDraftRunner = (context: LiveDraftRunContext) => Promise<LiveDraftResult | null>;

interface DraftWindow {
  id: number;
  generation: number;
  maxWindowMs: number;
  snapshotAudio: () => Blob;
  draftsUsed: number;
  disabled: boolean;
}

export interface LiveDraftAttempt {
  available: boolean;
  preview: LiveDraftPreview | null;
  draft: (LiveDraftResult & { windowId: number }) | null;
}

const UNAVAILABLE: LiveDraftAttempt = { available: false, preview: null, draft: null };

interface UseLiveDraftsOptions {
  runnerRef: MutableRefObject<LiveDraftRunner>;
  attemptsUsed: () => number;
  finalBusy: () => boolean;
  remainingSessionMs: () => number;
}

export function useLiveDrafts(options: UseLiveDraftsOptions) {
  const [draft, setDraft] = useState<LiveDraftPreview | null>(null);
  const [sessionDisabled, setSessionDisabled] = useState(false);
  const optionsRef = useRef(options);
  const activeWindowRef = useRef<DraftWindow | null>(null);
  const nextWindowIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const toggleRef = useRef<ReturnType<typeof createLiveDraftToggle> | null>(null);

  const invalidateWindow = useCallback(() => {
    activeWindowRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    nextWindowIdRef.current += 1;
  }, []);

  const getToggle = useCallback(() => {
    if (!toggleRef.current) {
      toggleRef.current = createLiveDraftToggle({
        invalidatePendingWork: invalidateWindow,
        setSessionDisabled,
      });
    }
    return toggleRef.current;
  }, [invalidateWindow, setSessionDisabled]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  /** Keep the visible draft across the window end so it lasts until the final replaces it. */
  const endWindow = useCallback(() => {
    getToggle().reset();
  }, [getToggle]);

  const clearDraft = useCallback((windowId?: number) => {
    setDraft((current) => clearHeardDraft(current, windowId));
  }, []);

  const reset = useCallback(() => {
    endWindow();
    setDraft(null);
  }, [endWindow]);

  const startSession = useCallback(() => {
    getToggle().startSession();
    setDraft(null);
  }, [getToggle]);

  const runDraft = useCallback(async (window: DraftWindow): Promise<LiveDraftAttempt> => {
    const isCurrent = () =>
      activeWindowRef.current?.id === window.id &&
      !window.disabled &&
      getToggle().canRun();
    if (!isCurrent()) return UNAVAILABLE;
    if (!canDraft({
      attemptsUsed: optionsRef.current.attemptsUsed(),
      maxAttempts: MAX_TRANSCRIPTION_REQUESTS,
      remainingMs: optionsRef.current.remainingSessionMs(),
      windowMs: window.maxWindowMs,
      draftsUsed: window.draftsUsed,
      finalBusy: optionsRef.current.finalBusy(),
      draftInFlight: controllerRef.current !== null,
    })) return UNAVAILABLE;

    const audio = window.snapshotAudio();
    if (!audio.size) return UNAVAILABLE;
    const controller = new AbortController();
    controllerRef.current = controller;
    window.draftsUsed += 1;
    try {
      const result = await optionsRef.current.runnerRef.current({
        audio,
        signal: controller.signal,
        captureGeneration: window.generation,
        isCurrent: () => isCurrent() && !controller.signal.aborted,
        onDisableForSession: () => {
          getToggle().disableForSession();
          setDraft(null);
        },
      });
      if (!result || !isCurrent() || controller.signal.aborted) return UNAVAILABLE;
      const preview: LiveDraftPreview = { windowId: window.id, sourceText: result.sourceText };
      setDraft(preview);
      return { available: true, preview, draft: { ...result, windowId: window.id } };
    } catch {
      if (activeWindowRef.current?.id !== window.id || controller.signal.aborted) {
        return UNAVAILABLE;
      }
      window.disabled = true;
      setDraft(null);
      return UNAVAILABLE;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [getToggle]);

  /** Only Dynamic runs a draft, and only at a qualifying pause candidate. */
  const runAtPauseCandidate = useCallback(async (): Promise<LiveDraftAttempt> => {
    const window = activeWindowRef.current;
    if (!window) return UNAVAILABLE;
    return runDraft(window);
  }, [runDraft]);

  /**
   * Only Dynamic starts a draft window; numbered options never schedule a draft. The id
   * travels with that window's audio chunk so its final can clear the draft, reused or not.
   */
  const beginWindow = useCallback((input: {
    generation: number;
    recordingWindowMs: RecordingWindowMs;
    snapshotAudio: () => Blob;
  }): number | null => {
    endWindow();
    if (!getToggle().canRun() || input.recordingWindowMs !== "dynamic") return null;
    activeWindowRef.current = {
      id: ++nextWindowIdRef.current,
      generation: input.generation,
      maxWindowMs: recordingWindowBoundsMs("dynamic").maxMs,
      snapshotAudio: input.snapshotAudio,
      draftsUsed: 0,
      disabled: false,
    };
    return activeWindowRef.current.id;
  }, [endWindow, getToggle]);

  useEffect(() => () => {
    toggleRef.current?.reset();
  }, []);

  return {
    draft,
    beginWindow,
    endWindow,
    startSession,
    clearDraft,
    reset,
    sessionDisabled,
    runAtPauseCandidate,
  };
}
