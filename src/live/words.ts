/**
 * The Settings › Words list: one row per word with one action, stored as the two existing
 * text settings so translation, moderation, drafts and saved setups keep their formats.
 *
 * - keywordText entries `canonical|variant… => translation` carry "help recognise",
 *   "fix spelling" (variant → canonical) and "always translate as".
 * - filterText entries `word`, `word=>replacement`, `word=>!hide` carry the three
 *   ways of keeping a word off audience screens.
 */

export type WordAction = "recognise" | "fix" | "translate" | "mask" | "replace" | "hide";

export interface WordRow {
  word: string;
  action: WordAction;
  /** The corrected spelling, the translation or the replacement; empty when unused. */
  with: string;
}

export const WORD_ACTIONS: readonly { value: WordAction; label: string; needsWith: boolean }[] = [
  { value: "recognise", label: "Help the AI recognise it", needsWith: false },
  { value: "fix", label: "Fix spelling to…", needsWith: true },
  { value: "translate", label: "Always translate as…", needsWith: true },
  { value: "mask", label: "Hide the word (***)", needsWith: false },
  { value: "replace", label: "Replace on screen with…", needsWith: true },
  { value: "hide", label: "Hide the whole caption", needsWith: false },
];

const MAX_WORD_CHARS = 100;

/** Commas and newlines separate entries and `|`/`=>` are syntax, so none may appear in a value. */
export function cleanWordValue(value: string) {
  return value.replace(/[\n,|]+/gu, " ").replace(/=>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, MAX_WORD_CHARS);
}

function entries(value: string) {
  return value.split(/[\n,]+/u).map((item) => item.trim()).filter(Boolean);
}

export function wordsFromSettings(keywordText: string, filterText: string): WordRow[] {
  const rows: WordRow[] = [];
  for (const entry of entries(keywordText)) {
    const [left, ...rightParts] = entry.split("=>");
    const [canonical = "", ...variants] = left.split("|").map((part) => part.trim());
    const translation = rightParts.join("=>").trim();
    if (!canonical) continue;
    const fixes = variants.filter(Boolean);
    for (const variant of fixes) rows.push({ word: variant, action: "fix", with: canonical });
    if (translation) rows.push({ word: canonical, action: "translate", with: translation });
    if (!translation && !fixes.length) rows.push({ word: canonical, action: "recognise", with: "" });
  }
  for (const entry of entries(filterText)) {
    const [left, ...rightParts] = entry.split("=>");
    const word = left.trim();
    const action = rightParts.join("=>").trim();
    if (!word) continue;
    if (action.toLowerCase() === "!hide") rows.push({ word, action: "hide", with: "" });
    else if (action) rows.push({ word, action: "replace", with: action });
    else rows.push({ word, action: "mask", with: "" });
  }
  return rows;
}

export function wordsToSettings(rows: readonly WordRow[]): { keywordText: string; filterText: string } {
  // Group the glossary rows by canonical spelling, in order of first appearance.
  const glossary = new Map<string, { variants: string[]; translation: string }>();
  const entry = (canonical: string) => {
    const key = canonical.toLowerCase();
    let found = [...glossary.entries()].find(([existing]) => existing.toLowerCase() === key);
    if (!found) {
      glossary.set(canonical, { variants: [], translation: "" });
      found = [canonical, glossary.get(canonical)!];
    }
    return found[1];
  };
  const filters: string[] = [];
  for (const row of rows) {
    const word = cleanWordValue(row.word);
    const target = cleanWordValue(row.with);
    if (!word) continue;
    if (row.action === "recognise") entry(word);
    else if (row.action === "fix" && target) {
      const variants = entry(target).variants;
      if (!variants.some((existing) => existing.toLowerCase() === word.toLowerCase())) variants.push(word);
    } else if (row.action === "translate" && target) entry(word).translation = target;
    else if (row.action === "mask") filters.push(word);
    else if (row.action === "replace" && target) filters.push(`${word}=>${target}`);
    else if (row.action === "hide") filters.push(`${word}=>!hide`);
  }
  const keywordText = [...glossary.entries()]
    .map(([canonical, { variants, translation }]) =>
      `${[canonical, ...variants].join("|")}${translation ? ` => ${translation}` : ""}`)
    .join(", ");
  return { keywordText, filterText: filters.join(", ") };
}
