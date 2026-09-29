import type { LanguageLocale } from "@/domain/languages";
import type { PublicCaptionRequest } from "@/live/contracts";

/**
 * Delay queue between translation and public Live output (OBS/viewer), distinct from the
 * recording window (src/live/contracts.ts). Operator sees only On/Off and the front
 * entry; internally an enabled buffer holds up to OUTPUT_BUFFER_BACKING_CAPACITY entries
 * so a paused/edited front caption has headroom before a new one is dropped. See ADR 0016.
 */
export const OUTPUT_BUFFER_COUNT_OPTIONS = [0, 1] as const;
export type OutputBufferCount = (typeof OUTPUT_BUFFER_COUNT_OPTIONS)[number];
export const DEFAULT_OUTPUT_BUFFER_COUNT: OutputBufferCount = 0;
export const OUTPUT_BUFFER_BACKING_CAPACITY = 4;

/** How long a queued caption is held before advancing to Live, once the buffer is on. */
export const OUTPUT_BUFFER_DWELL_OPTIONS_MS = [1_000, 2_000, 3_000, 4_000, 5_000] as const;
export type OutputBufferDwellMs = (typeof OUTPUT_BUFFER_DWELL_OPTIONS_MS)[number];
export const DEFAULT_OUTPUT_BUFFER_DWELL_MS: OutputBufferDwellMs = 3_000;

export function normalizeOutputBufferDwellMs(value: unknown): OutputBufferDwellMs {
  const number = Number(value);
  return OUTPUT_BUFFER_DWELL_OPTIONS_MS.includes(number as OutputBufferDwellMs)
    ? (number as OutputBufferDwellMs)
    : DEFAULT_OUTPUT_BUFFER_DWELL_MS;
}

export function normalizeOutputBufferCount(value: unknown): OutputBufferCount {
  const number = Number(value);
  return OUTPUT_BUFFER_COUNT_OPTIONS.includes(number as OutputBufferCount)
    ? (number as OutputBufferCount)
    : DEFAULT_OUTPUT_BUFFER_COUNT;
}

/** 0 when off, the full backing capacity when on. */
export function outputBufferCapacity(count: OutputBufferCount): number {
  return count === 0 ? 0 : OUTPUT_BUFFER_BACKING_CAPACITY;
}

export interface OutputBufferEntry {
  id: string;
  sourceText: string;
  targetLanguage: LanguageLocale;
  publicText: string;
  /** Whether a filter hid `publicText`, vs. it happening to be empty for another reason. */
  hidden: boolean;
  editedDraft: string | null;
  editing: boolean;
  /** Captured at translation time; publish uses `publicText` above in its place. */
  request: PublicCaptionRequest;
  dueAt: number | null;
  remainingMs: number | null;
  manuallyPaused: boolean;
  pausedForEdit: boolean;
}

export interface OutputBufferQueueState {
  entries: OutputBufferEntry[];
}

export const EMPTY_OUTPUT_BUFFER_QUEUE: OutputBufferQueueState = { entries: [] };

export function isOutputBufferEntryPaused(entry: OutputBufferEntry): boolean {
  return entry.manuallyPaused || entry.pausedForEdit;
}

function mapEntry(
  queue: OutputBufferQueueState,
  id: string,
  transform: (entry: OutputBufferEntry) => OutputBufferEntry,
): OutputBufferQueueState {
  let changed = false;
  const entries = queue.entries.map((entry) => {
    if (entry.id !== id) return entry;
    changed = true;
    return transform(entry);
  });
  return changed ? { entries } : queue;
}

function withPauseFlag(
  entry: OutputBufferEntry,
  now: number,
  dwellMs: OutputBufferDwellMs,
  flag: "manuallyPaused" | "pausedForEdit",
  value: boolean,
): OutputBufferEntry {
  if (entry[flag] === value) return entry;
  const wasPaused = isOutputBufferEntryPaused(entry);
  const next = { ...entry, [flag]: value };
  const nowPaused = isOutputBufferEntryPaused(next);
  if (nowPaused === wasPaused) return next;
  if (nowPaused) {
    return {
      ...next,
      dueAt: null,
      remainingMs: next.dueAt !== null ? Math.max(0, next.dueAt - now) : next.remainingMs,
    };
  }
  return {
    ...next,
    dueAt: now + (next.remainingMs ?? dwellMs),
    remainingMs: null,
  };
}

/** Restores the invariant that a front entry mid-edit is always paused, after any mutation that could change the front. */
function applyFrontEditGuard(
  queue: OutputBufferQueueState,
  now: number,
  dwellMs: OutputBufferDwellMs,
): OutputBufferQueueState {
  const front = queue.entries[0];
  if (!front || !front.editing || front.pausedForEdit) return queue;
  return { entries: [withPauseFlag(front, now, dwellMs, "pausedForEdit", true), ...queue.entries.slice(1)] };
}

export type NewOutputBufferEntry = Pick<
  OutputBufferEntry,
  "id" | "sourceText" | "targetLanguage" | "publicText" | "hidden" | "request"
>;

export interface EnqueueOutcome {
  queue: OutputBufferQueueState;
  /** Entries force-advanced to make room, oldest first; usually 0 or 1, more only if capacity just shrank. */
  publishNow: OutputBufferEntry[];
  /** True when the incoming translation was dropped (queue full, front paused). */
  dropped: boolean;
}

/** Admits a translated caption into a queue of the given capacity (0 always drops). */
export function enqueueTranslation(
  queue: OutputBufferQueueState,
  count: number,
  candidate: NewOutputBufferEntry,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): EnqueueOutcome {
  if (count <= 0) return { queue, publishNow: [], dropped: true };

  const entry: OutputBufferEntry = {
    ...candidate,
    editedDraft: null,
    editing: false,
    manuallyPaused: false,
    pausedForEdit: false,
    remainingMs: null,
    dueAt: now + dwellMs,
  };

  if (queue.entries.length < count) {
    return {
      queue: applyFrontEditGuard({ entries: [...queue.entries, entry] }, now, dwellMs),
      publishNow: [],
      dropped: false,
    };
  }

  // Full, or over capacity because count just shrank: force-advance from the front until
  // there's room for one more, or a paused entry blocks further progress.
  const publishNow: OutputBufferEntry[] = [];
  let entries = queue.entries;
  while (entries.length >= count) {
    const front = entries[0];
    if (isOutputBufferEntryPaused(front)) break;
    publishNow.push(front);
    entries = entries.slice(1);
  }
  if (entries.length >= count) {
    return { queue: { entries }, publishNow, dropped: true };
  }
  return {
    queue: applyFrontEditGuard({ entries: [...entries, entry] }, now, dwellMs),
    publishNow,
    dropped: false,
  };
}

export interface TickOutcome {
  queue: OutputBufferQueueState;
  publish: OutputBufferEntry | null;
}

/** Advances the front entry to Live once its dwell time has elapsed, unless it is paused. */
export function tick(
  queue: OutputBufferQueueState,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): TickOutcome {
  const front = queue.entries[0];
  if (!front || isOutputBufferEntryPaused(front) || front.dueAt === null || front.dueAt > now) {
    return { queue, publish: null };
  }
  return { queue: applyFrontEditGuard({ entries: queue.entries.slice(1) }, now, dwellMs), publish: front };
}

export function setManualPause(
  queue: OutputBufferQueueState,
  id: string,
  paused: boolean,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) => withPauseFlag(entry, now, dwellMs, "manuallyPaused", paused));
}

export function clearEntry(
  queue: OutputBufferQueueState,
  id: string,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): OutputBufferQueueState {
  const entries = queue.entries.filter((entry) => entry.id !== id);
  if (entries.length === queue.entries.length) return queue;
  return applyFrontEditGuard({ entries }, now, dwellMs);
}

export interface FastForwardOutcome {
  queue: OutputBufferQueueState;
  publish: OutputBufferEntry | null;
}

export function fastForwardEntry(
  queue: OutputBufferQueueState,
  id: string,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): FastForwardOutcome {
  const target = queue.entries.find((entry) => entry.id === id) ?? null;
  if (!target) return { queue, publish: null };
  const entries = queue.entries.filter((entry) => entry.id !== id);
  return { queue: applyFrontEditGuard({ entries }, now, dwellMs), publish: target };
}

export function beginEdit(
  queue: OutputBufferQueueState,
  id: string,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): OutputBufferQueueState {
  const withEditing = mapEntry(queue, id, (entry) =>
    entry.editing ? entry : { ...entry, editing: true, editedDraft: entry.publicText },
  );
  return applyFrontEditGuard(withEditing, now, dwellMs);
}

export function updateEditDraft(
  queue: OutputBufferQueueState,
  id: string,
  text: string,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) => (entry.editing ? { ...entry, editedDraft: text } : entry));
}

export function cancelEdit(
  queue: OutputBufferQueueState,
  id: string,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) =>
    entry.editing
      ? { ...withPauseFlag(entry, now, dwellMs, "pausedForEdit", false), editing: false, editedDraft: null }
      : entry,
  );
}

/** Applies the operator's edited text (already moderated by the caller) and releases the edit hold. */
export function submitEdit(
  queue: OutputBufferQueueState,
  id: string,
  finalPublicText: string,
  finalHidden: boolean,
  now: number,
  dwellMs: OutputBufferDwellMs = DEFAULT_OUTPUT_BUFFER_DWELL_MS,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) =>
    entry.editing
      ? {
          ...withPauseFlag(entry, now, dwellMs, "pausedForEdit", false),
          editing: false,
          editedDraft: null,
          publicText: finalPublicText,
          hidden: finalHidden,
        }
      : entry,
  );
}
