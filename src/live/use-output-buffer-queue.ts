"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { parseGlossaryInput, parseModerationInput } from "@/live/config";
import { MAX_MANUAL_CAPTION_CHARS } from "@/live/contracts";
import {
  EMPTY_OUTPUT_BUFFER_QUEUE,
  beginEdit as beginOutputBufferEntryEdit,
  cancelEdit as cancelOutputBufferEntryEdit,
  clearEntry as clearOutputBufferQueueEntry,
  enqueueTranslation,
  fastForwardEntry,
  outputBufferCapacity,
  setManualPause,
  submitEdit as submitOutputBufferEntryEdit,
  tick as tickOutputBufferQueue,
  updateEditDraft,
  type EnqueueOutcome,
  type NewOutputBufferEntry,
  type OutputBufferCount,
  type OutputBufferDwellMs,
  type OutputBufferEntry,
  type OutputBufferQueueState,
} from "@/live/output-buffer";
import { combineFilterText, liveWordsToSettings, mergeGlossaries, type LiveWordEntry } from "@/live/live-words";
import { MAX_FILTER_INPUT_CHARS, type TranslationSessionSettings } from "@/live/translation-settings";
import { prepareCaptionForms } from "@/pipeline/caption-pipeline";
import { clearBackgroundInterval, setBackgroundInterval } from "@/live/background-timer";

interface SessionSettingsForBuffer extends TranslationSessionSettings {
  outputBufferDwellMs: OutputBufferDwellMs;
}

interface UseOutputBufferQueueParams {
  count: OutputBufferCount;
  /** Whether the tick loop should run at all right now (mirrors `liveState.status === "live"`). */
  tickEnabled: boolean;
  /** Read live at call time, so a settings change mid-session applies without re-subscribing. */
  settingsRef: RefObject<SessionSettingsForBuffer>;
  /** Publishes one buffered entry to Live; shares fate-handling with the direct publish path.
   * A ref, not a plain callback: `publishBufferedEntry` itself needs this hook's `generationRef`
   * and `reset` (see the `service_paused` case in `use-live-caption-session.ts`), which would
   * otherwise be a circular dependency between the two hooks. The caller keeps this ref's
   * `.current` up to date with its latest `publishBufferedEntry` closure every render. */
  publishBufferedEntryRef: RefObject<(entry: OutputBufferEntry) => Promise<void>>;
  /** Re-moderates a submitted edit against the confirmed session settings, not an unconfirmed draft. */
  activeTranslationSettingsRef: RefObject<TranslationSessionSettings | null>;
  liveWordEntriesRef: RefObject<LiveWordEntry[]>;
}

/**
 * Owns the output buffer's queue state end to end: the hidden backing queue, its tick-driven
 * advancement to Live, the capacity-shrink flush, and every operator mutation (pause, clear,
 * fast-forward, edit). See `src/live/output-buffer.ts` for the pure queue engine this wraps,
 * and ADR 0016/0017 for the buffer's design and configurable dwell.
 *
 * `reset` only touches this hook's own state - callers compose it into their own broader
 * session-reset logic (pause/refresh/takeover/End all discard the buffer, among other things).
 * `generationRef` lets a caller's own async loop (e.g. force-advancing entries while enqueuing
 * a new translation) detect that a reset happened mid-loop and stop early.
 */
export function useOutputBufferQueue({
  count,
  tickEnabled,
  settingsRef,
  publishBufferedEntryRef,
  activeTranslationSettingsRef,
  liveWordEntriesRef,
}: UseOutputBufferQueueParams) {
  const [queue, setQueue] = useState<OutputBufferQueueState>(EMPTY_OUTPUT_BUFFER_QUEUE);
  const queueRef = useRef<OutputBufferQueueState>(EMPTY_OUTPUT_BUFFER_QUEUE);
  // Bumped every time the buffer is discarded (pause/refresh/takeover/End), so an in-flight
  // async flush of force-published entries (see the capacity-shrink effect) can tell that the
  // session moved on mid-loop and stop, instead of publishing the rest of a stale backlog.
  const generationRef = useRef(0);
  const previousCapacityRef = useRef(outputBufferCapacity(count));

  const reset = useCallback(() => {
    generationRef.current += 1;
    queueRef.current = EMPTY_OUTPUT_BUFFER_QUEUE;
    setQueue(EMPTY_OUTPUT_BUFFER_QUEUE);
  }, []);

  const enqueue = useCallback(
    (capacity: number, candidate: NewOutputBufferEntry, now: number): EnqueueOutcome => {
      const outcome = enqueueTranslation(queueRef.current, capacity, candidate, now, settingsRef.current.outputBufferDwellMs);
      queueRef.current = outcome.queue;
      setQueue(outcome.queue);
      return outcome;
    },
    [settingsRef],
  );

  useEffect(() => {
    if (count === 0 || !tickEnabled) return;
    const id = setBackgroundInterval(() => {
      const outcome = tickOutputBufferQueue(queueRef.current, Date.now(), settingsRef.current.outputBufferDwellMs);
      if (outcome.queue !== queueRef.current) {
        queueRef.current = outcome.queue;
        setQueue(outcome.queue);
      }
      if (outcome.publish) void publishBufferedEntryRef.current(outcome.publish);
    }, 200);
    return () => clearBackgroundInterval(id);
  }, [count, tickEnabled, settingsRef, publishBufferedEntryRef]);

  // Shrinking capacity can leave more entries queued than it now allows; enqueueTranslation
  // only fixes that on the next arrival, which may never come. Flush the excess to Live now.
  useEffect(() => {
    const capacity = outputBufferCapacity(count);
    const previousCapacity = previousCapacityRef.current;
    previousCapacityRef.current = capacity;
    if (capacity >= previousCapacity) return;
    const current = queueRef.current.entries;
    const overflow = current.length - capacity;
    if (overflow <= 0) return;
    const excess = current.slice(0, overflow);
    const kept = { entries: current.slice(overflow) };
    queueRef.current = kept;
    setQueue(kept);
    void (async () => {
      // If publishing one entry reveals the session paused/refreshed/ended (reset runs as
      // part of handling that), stop rather than keep force-publishing the rest of a backlog
      // that no longer should exist.
      const flushGeneration = generationRef.current;
      for (const entry of excess) {
        if (generationRef.current !== flushGeneration) return;
        await publishBufferedEntryRef.current(entry);
      }
    })();
  }, [count, publishBufferedEntryRef]);

  const setEntryPaused = useCallback(
    (id: string, paused: boolean) => {
      const next = setManualPause(queueRef.current, id, paused, Date.now(), settingsRef.current.outputBufferDwellMs);
      queueRef.current = next;
      setQueue(next);
    },
    [settingsRef],
  );

  const clearEntry = useCallback(
    (id: string) => {
      const next = clearOutputBufferQueueEntry(queueRef.current, id, Date.now(), settingsRef.current.outputBufferDwellMs);
      queueRef.current = next;
      setQueue(next);
    },
    [settingsRef],
  );

  const fastForwardOutputBufferEntry = useCallback(
    (id: string) => {
      const outcome = fastForwardEntry(queueRef.current, id, Date.now(), settingsRef.current.outputBufferDwellMs);
      queueRef.current = outcome.queue;
      setQueue(outcome.queue);
      if (outcome.publish) void publishBufferedEntryRef.current(outcome.publish);
    },
    [settingsRef, publishBufferedEntryRef],
  );

  const beginEdit = useCallback(
    (id: string) => {
      const next = beginOutputBufferEntryEdit(queueRef.current, id, Date.now(), settingsRef.current.outputBufferDwellMs);
      queueRef.current = next;
      setQueue(next);
    },
    [settingsRef],
  );

  const updateEditDraftText = useCallback((id: string, text: string) => {
    const next = updateEditDraft(queueRef.current, id, text.slice(0, MAX_MANUAL_CAPTION_CHARS));
    queueRef.current = next;
    setQueue(next);
  }, []);

  const cancelEdit = useCallback(
    (id: string) => {
      const next = cancelOutputBufferEntryEdit(queueRef.current, id, Date.now(), settingsRef.current.outputBufferDwellMs);
      queueRef.current = next;
      setQueue(next);
    },
    [settingsRef],
  );

  const submitEdit = useCallback(
    (id: string) => {
      const entry = queueRef.current.entries.find((item) => item.id === id);
      if (!entry || entry.editedDraft === null) return;
      // Re-moderates against the confirmed session settings, not the unconfirmed draft.
      const current = activeTranslationSettingsRef.current ?? settingsRef.current;
      const liveWordSettings = liveWordsToSettings(liveWordEntriesRef.current);
      const effectiveFilterText = combineFilterText(liveWordSettings.filterText, current.filterText, MAX_FILTER_INPUT_CHARS);
      // Same glossary + moderation pass every other caption gets, via prepareCaptionForms.
      const forms = prepareCaptionForms({
        sourceText: entry.sourceText,
        translatedText: entry.editedDraft,
        targetLanguage: current.targetLanguage,
        glossary: mergeGlossaries(
          parseGlossaryInput(current.keywordText, current.targetLanguage),
          parseGlossaryInput(liveWordSettings.keywordText, current.targetLanguage),
        ),
        moderationRules: parseModerationInput(effectiveFilterText),
      });
      const next = submitOutputBufferEntryEdit(
        queueRef.current,
        id,
        forms.publicText,
        forms.hiddenFromPublicDisplay,
        Date.now(),
        settingsRef.current.outputBufferDwellMs,
      );
      queueRef.current = next;
      setQueue(next);
    },
    [activeTranslationSettingsRef, liveWordEntriesRef, settingsRef],
  );

  return {
    queue,
    generationRef,
    reset,
    enqueue,
    setEntryPaused,
    clearEntry,
    fastForwardOutputBufferEntry,
    beginEdit,
    updateEditDraft: updateEditDraftText,
    cancelEdit,
    submitEdit,
  };
}
