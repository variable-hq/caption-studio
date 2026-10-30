import type { LanguageLocale } from "@/domain/languages";
import { MAX_FILTER_INPUT_CHARS, MAX_TERMINOLOGY_INPUT_CHARS } from "@/live/translation-settings";
import { cleanWordValue, wordsToSettings, type WordAction, type WordRow } from "@/live/words";
import type { GlossaryEntry } from "@/pipeline/glossary";

export interface LiveWordEntry {
  id: string;
  row: WordRow;
}

export const LIVE_WORD_ACTIONS = ["hide", "fix", "translate", "recognise"] as const satisfies readonly WordAction[];
export const MAX_LIVE_WORD_ENTRIES = 20;
export const MAX_LIVE_WORD_CHARS = 100;

const LIVE_WORD_ACTION_SET = new Set<WordAction>(LIVE_WORD_ACTIONS);

function cleanLiveWordValue(value: string) {
  return cleanWordValue(value).normalize("NFC").slice(0, MAX_LIVE_WORD_CHARS);
}

function needsWith(action: WordAction) {
  return action === "fix" || action === "translate";
}

export function addLiveWord(entries: readonly LiveWordEntry[], row: WordRow): LiveWordEntry[] {
  if (!LIVE_WORD_ACTION_SET.has(row.action)) return [...entries];
  const word = cleanLiveWordValue(row.word);
  const withValue = needsWith(row.action) ? cleanLiveWordValue(row.with) : "";
  if (!word || (needsWith(row.action) && !withValue)) return [...entries];

  const nextRow = { word, action: row.action, with: withValue };
  const withoutDuplicate = entries.filter((entry) =>
    entry.row.action !== nextRow.action || entry.row.word.toLowerCase() !== word.toLowerCase(),
  );
  if (withoutDuplicate.length >= MAX_LIVE_WORD_ENTRIES) return [...entries];
  return [...withoutDuplicate, { id: crypto.randomUUID(), row: nextRow }];
}

export function removeLiveWord(entries: readonly LiveWordEntry[], id: string): LiveWordEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function liveWordsToSettings(entries: readonly LiveWordEntry[]) {
  return wordsToSettings(entries.map(({ row }) => row));
}

function combineText(liveText: string, savedText: string, maxChars: number) {
  return [liveText, savedText].filter(Boolean).join(", ").slice(0, maxChars);
}

export function combineKeywordText(liveText: string, savedText: string, maxChars = MAX_TERMINOLOGY_INPUT_CHARS) {
  return combineText(liveText, savedText, maxChars);
}

export function combineFilterText(liveText: string, savedText: string, maxChars = MAX_FILTER_INPUT_CHARS) {
  return combineText(liveText, savedText, maxChars);
}

function mergeVariants(live: readonly string[], saved: readonly string[] = []) {
  const seen = new Set<string>();
  return [...live, ...saved].filter((variant) => {
    const key = variant.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function liveGlossaryId(id: string) {
  return id.startsWith("live-word-") ? id : `live-word-${id.replace(/^operator-term-/u, "")}`;
}

export function mergeGlossaries(
  saved: readonly GlossaryEntry[],
  live: readonly GlossaryEntry[],
): GlossaryEntry[] {
  const liveEntries = live.map((entry, index) => {
    const savedMatch = saved.find((candidate) =>
      candidate.canonical.toLowerCase() === entry.canonical.toLowerCase(),
    );
    const preferredTranslations: Partial<Record<LanguageLocale, string>> = {
      ...savedMatch?.preferredTranslations,
      ...entry.preferredTranslations,
    };
    return {
      ...savedMatch,
      ...entry,
      id: liveGlossaryId(entry.id),
      priority: 80 - index,
      variants: mergeVariants(entry.variants ?? [], savedMatch?.variants ?? []),
      preferredTranslations: Object.keys(preferredTranslations).length ? preferredTranslations : undefined,
    };
  });
  const matchedSaved = new Set(liveEntries.flatMap((entry) =>
    saved.filter((candidate) => candidate.canonical.toLowerCase() === entry.canonical.toLowerCase()),
  ));
  const savedEntries = saved
    .filter((entry) => !matchedSaved.has(entry));
  return [...liveEntries, ...savedEntries];
}
