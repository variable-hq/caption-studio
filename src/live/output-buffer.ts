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
export const OUTPUT_BUFFER_DWELL_MS = 2_000;

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
  originalPublicText: string;
  publicText: string;
  editedDraft: string | null;
  editing: boolean;
  revisedByModel: boolean;
  /** Captured at translation time; publish uses `publicText` above in its place. */
  request: PublicCaptionRequest;
  dueAt: number | null;
  remainingMs: number | null;
  manuallyPaused: boolean;
  pausedForEdit: boolean;
  pausedForReview: boolean;
}

export interface OutputBufferQueueState {
  entries: OutputBufferEntry[];
}

export interface OutputBufferReviewState {
  busy: boolean;
  message: string;
}

export const EMPTY_OUTPUT_BUFFER_QUEUE: OutputBufferQueueState = { entries: [] };

export function isOutputBufferEntryPaused(entry: OutputBufferEntry): boolean {
  return entry.manuallyPaused || entry.pausedForEdit || entry.pausedForReview;
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
  flag: "manuallyPaused" | "pausedForEdit" | "pausedForReview",
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
    dueAt: now + (next.remainingMs ?? OUTPUT_BUFFER_DWELL_MS),
    remainingMs: null,
  };
}

/** Restores the invariant that a front entry mid-edit is always paused, after any mutation that could change the front. */
function applyFrontEditGuard(queue: OutputBufferQueueState, now: number): OutputBufferQueueState {
  const front = queue.entries[0];
  if (!front || !front.editing || front.pausedForEdit) return queue;
  return { entries: [withPauseFlag(front, now, "pausedForEdit", true), ...queue.entries.slice(1)] };
}

export type NewOutputBufferEntry = Pick<
  OutputBufferEntry,
  "id" | "sourceText" | "targetLanguage" | "publicText" | "request"
>;

export interface EnqueueOutcome {
  queue: OutputBufferQueueState;
  /** Entries force-advanced to make room, oldest first; usually 0 or 1, more only if capacity just shrank. */
  publishNow: OutputBufferEntry[];
  /** True when the incoming translation was dropped (queue full, front paused). */
  dropped: boolean;
}

/** Admits a translated caption into a queue of the given capacity. */
export function enqueueTranslation(
  queue: OutputBufferQueueState,
  count: number,
  candidate: NewOutputBufferEntry,
  now: number,
): EnqueueOutcome {
  const entry: OutputBufferEntry = {
    ...candidate,
    originalPublicText: candidate.publicText,
    editedDraft: null,
    editing: false,
    revisedByModel: false,
    manuallyPaused: false,
    pausedForEdit: false,
    pausedForReview: false,
    remainingMs: null,
    dueAt: now + OUTPUT_BUFFER_DWELL_MS,
  };

  if (queue.entries.length < count) {
    return {
      queue: applyFrontEditGuard({ entries: [...queue.entries, entry] }, now),
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
    queue: applyFrontEditGuard({ entries: [...entries, entry] }, now),
    publishNow,
    dropped: false,
  };
}

export interface TickOutcome {
  queue: OutputBufferQueueState;
  publish: OutputBufferEntry | null;
}

/** Advances the front entry to Live once its dwell time has elapsed, unless it is paused. */
export function tick(queue: OutputBufferQueueState, now: number): TickOutcome {
  const front = queue.entries[0];
  if (!front || isOutputBufferEntryPaused(front) || front.dueAt === null || front.dueAt > now) {
    return { queue, publish: null };
  }
  return { queue: applyFrontEditGuard({ entries: queue.entries.slice(1) }, now), publish: front };
}

export function setManualPause(
  queue: OutputBufferQueueState,
  id: string,
  paused: boolean,
  now: number,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) => withPauseFlag(entry, now, "manuallyPaused", paused));
}

export function clearEntry(queue: OutputBufferQueueState, id: string, now: number): OutputBufferQueueState {
  const entries = queue.entries.filter((entry) => entry.id !== id);
  if (entries.length === queue.entries.length) return queue;
  return applyFrontEditGuard({ entries }, now);
}

export interface FastForwardOutcome {
  queue: OutputBufferQueueState;
  publish: OutputBufferEntry | null;
}

export function fastForwardEntry(
  queue: OutputBufferQueueState,
  id: string,
  now: number,
): FastForwardOutcome {
  const target = queue.entries.find((entry) => entry.id === id) ?? null;
  if (!target) return { queue, publish: null };
  const entries = queue.entries.filter((entry) => entry.id !== id);
  return { queue: applyFrontEditGuard({ entries }, now), publish: target };
}

export function beginEdit(queue: OutputBufferQueueState, id: string, now: number): OutputBufferQueueState {
  const withEditing = mapEntry(queue, id, (entry) =>
    entry.editing ? entry : { ...entry, editing: true, editedDraft: entry.publicText },
  );
  return applyFrontEditGuard(withEditing, now);
}

export function updateEditDraft(
  queue: OutputBufferQueueState,
  id: string,
  text: string,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) => (entry.editing ? { ...entry, editedDraft: text } : entry));
}

export function cancelEdit(queue: OutputBufferQueueState, id: string, now: number): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) =>
    entry.editing
      ? { ...withPauseFlag(entry, now, "pausedForEdit", false), editing: false, editedDraft: null }
      : entry,
  );
}

/** Applies the operator's edited text (already moderated by the caller) and releases the edit hold. */
export function submitEdit(
  queue: OutputBufferQueueState,
  id: string,
  finalPublicText: string,
  now: number,
): OutputBufferQueueState {
  return mapEntry(queue, id, (entry) =>
    entry.editing
      ? {
          ...withPauseFlag(entry, now, "pausedForEdit", false),
          editing: false,
          editedDraft: null,
          publicText: finalPublicText,
          revisedByModel: false,
        }
      : entry,
  );
}

export function beginReview(queue: OutputBufferQueueState, now: number): OutputBufferQueueState {
  return { entries: queue.entries.map((entry) => withPauseFlag(entry, now, "pausedForReview", true)) };
}

export function endReview(queue: OutputBufferQueueState, now: number): OutputBufferQueueState {
  const released = { entries: queue.entries.map((entry) => withPauseFlag(entry, now, "pausedForReview", false)) };
  return applyFrontEditGuard(released, now);
}

/** Applies Beta model revisions (already moderated by the caller) by entry id; never overwrites an entry the operator is hand-editing. */
export function applyReviewResults(
  queue: OutputBufferQueueState,
  revisions: ReadonlyMap<string, string>,
): OutputBufferQueueState {
  return {
    entries: queue.entries.map((entry) => {
      const revised = revisions.get(entry.id);
      if (revised === undefined || entry.editing) return entry;
      return { ...entry, publicText: revised, revisedByModel: true };
    }),
  };
}
