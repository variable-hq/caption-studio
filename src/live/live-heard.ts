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
