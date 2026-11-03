import type { LiveWordEntry } from "@/live/live-words";
import type { TranslationSessionSettings } from "@/live/translation-settings";

/** What Dynamic Heard shows: the draft's source text until the final replaces it. */
export interface HeardDraft {
  windowId: number;
  sourceText: string;
}

export interface LiveHeardText {
  text: string;
  inProgress: boolean;
}

/** Prefer the in-progress draft, otherwise the last published source text. */
export function heardSourceText(latestSourceText: string, draft: HeardDraft | null): LiveHeardText {
  return draft?.sourceText
    ? { text: draft.sourceText, inProgress: true }
    : { text: latestSourceText, inProgress: false };
}

/** Clear the draft belonging to one window; leave a newer window's draft alone. */
export function clearHeardDraft(draft: HeardDraft | null, windowId?: number): HeardDraft | null {
  return windowId === undefined || draft?.windowId === windowId ? null : draft;
}

/** Recorded when a Dynamic draft ran; the final reuses it only from a matching state. */
export interface DraftReuseSnapshot {
  captureGeneration: number;
  controllerToken: string;
  translationRevision: number;
  settings: TranslationSessionSettings;
  liveWords: readonly LiveWordEntry[];
  liveNote: string | undefined;
  presetId?: string;
}

export interface DraftForReuse {
  captureGeneration: number;
  snapshot: DraftReuseSnapshot;
}

/**
 * The final may take the confirming draft's transcription when nothing it depended on
 * changed. Speech resuming, pause, clear and takeover all invalidate the draft before a
 * cut, so only state that can change silently needs comparing here.
 */
export function draftReusedAsFinal(
  draft: DraftForReuse,
  current: DraftReuseSnapshot,
): boolean {
  const { snapshot } = draft;
  return (
    draft.captureGeneration === current.captureGeneration &&
    snapshot.captureGeneration === current.captureGeneration &&
    snapshot.controllerToken === current.controllerToken &&
    snapshot.translationRevision === current.translationRevision &&
    snapshot.settings === current.settings &&
    snapshot.liveWords === current.liveWords &&
    snapshot.liveNote === current.liveNote &&
    snapshot.presetId === current.presetId
  );
}
