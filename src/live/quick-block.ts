export interface QuickBlockEntry {
  id: string;
  term: string;
}

export const MAX_QUICK_BLOCK_ENTRIES = 20;
export const MAX_QUICK_BLOCK_TERM_CHARS = 100;

/** Adds a quick-blocked term, replacing a case-insensitive duplicate rather than adding a second entry. */
export function addQuickBlockEntry(entries: readonly QuickBlockEntry[], term: string): QuickBlockEntry[] {
  // Normalize before comparing/storing so visually-identical terms in different Unicode
  // compositions (precomposed vs. combining-mark) are treated as the same term.
  const trimmed = term.trim().normalize("NFC").slice(0, MAX_QUICK_BLOCK_TERM_CHARS);
  if (!trimmed) return [...entries];
  const withoutDuplicate = entries.filter((entry) => entry.term.toLowerCase() !== trimmed.toLowerCase());
  return [...withoutDuplicate, { id: crypto.randomUUID(), term: trimmed }].slice(-MAX_QUICK_BLOCK_ENTRIES);
}

export function removeQuickBlockEntry(entries: readonly QuickBlockEntry[], id: string): QuickBlockEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

/**
 * Serializes entries into the "term=>!hide" syntax parseModerationInput already understands.
 * Always hide-segment, not mask: this path exists for urgency, and a partial mask leaving
 * surrounding context visible isn't a strong enough response for something urgent enough
 * to need a faster path than the ordinary filter-settings field.
 */
export function quickBlockFilterText(entries: readonly QuickBlockEntry[]): string {
  return entries.map((entry) => `${entry.term}=>!hide`).join(", ");
}

/**
 * Combines quick-blocked terms with the saved filter list into the one string
 * parseModerationInput consumes, for both the live caption pipeline and the reader/archive
 * append payload. Quick-block terms are listed first for two reasons: they take priority
 * over a weaker saved rule for the same term (applyModeration stops at the first match), and
 * they survive truncation preferentially if the combined string would exceed maxChars.
 */
export function combineFilterText(
  quickBlockEntries: readonly QuickBlockEntry[],
  savedFilterText: string,
  maxChars: number,
): string {
  return [quickBlockFilterText(quickBlockEntries), savedFilterText]
    .filter(Boolean)
    .join(", ")
    .slice(0, maxChars);
}
