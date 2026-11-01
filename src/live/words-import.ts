import {
  cleanWordValue,
  WORD_ACTIONS,
  type WordAction,
  type WordRow,
} from "@/live/words";

/** The import bounds stated in the helper text and the too-large message. */
export const MAX_TERMS_IMPORT_BYTES = 64 * 1024;
export const MAX_TERMS_IMPORT_ROWS = 500;
export const TERMS_IMPORT_HEADER = "term,action,with";

export type WordsImportFailure =
  | { kind: "too-large" }
  | {
      kind: "invalid-row";
      line: number;
      reason: "needs-term-and-action" | "unknown-action" | "needs-with";
      action?: string;
    };

export type WordsImportResult =
  | { ok: true; rows: WordRow[] }
  | { ok: false; failure: WordsImportFailure };

const ACTIONS = new Set<WordAction>(WORD_ACTIONS.map(({ value }) => value));

function stripSurroundingQuotes(value: string) {
  return value.replace(/^"(.*)"$/u, "$1").trim();
}

/**
 * Parse an imported Terms list. One parser serves picked files and pasted text; a first
 * `term,action,with` line is ignored, and the first bad row stops the import.
 */
export function parseWordsImport(text: string): WordsImportResult {
  if (new TextEncoder().encode(text).length > MAX_TERMS_IMPORT_BYTES) {
    return { ok: false, failure: { kind: "too-large" } };
  }
  const cleaned = text.replace(/^\uFEFF/u, "");
  const entries = cleaned
    .split(/\r?\n/u)
    .flatMap((line, index) => line.split(";").map((part) => ({ text: part, line: index + 1 })));
  const rows: WordRow[] = [];
  let firstEntry = true;
  for (const { text: raw, line } of entries) {
    const value = raw.trim();
    if (!value) continue;
    if (firstEntry) {
      firstEntry = false;
      if (value.toLowerCase() === TERMS_IMPORT_HEADER) continue;
    }
    const [termRaw = "", actionRaw = "", ...rest] = value
      .split(",")
      .map(stripSurroundingQuotes);
    const word = cleanWordValue(termRaw);
    const actionText = actionRaw.trim().toLowerCase();
    if (!word || !actionText) {
      return {
        ok: false,
        failure: { kind: "invalid-row", line, reason: "needs-term-and-action" },
      };
    }
    const normalized = actionText === "recognize" ? "recognise" : actionText;
    if (!ACTIONS.has(normalized as WordAction)) {
      return {
        ok: false,
        failure: {
          kind: "invalid-row",
          line,
          reason: "unknown-action",
          action: actionRaw.trim(),
        },
      };
    }
    const action = normalized as WordAction;
    const needsWith = WORD_ACTIONS.find(({ value: candidate }) => candidate === action)?.needsWith ?? false;
    const withValue = cleanWordValue(rest.join(","));
    if (needsWith && !withValue) {
      return {
        ok: false,
        failure: { kind: "invalid-row", line, reason: "needs-with" },
      };
    }
    rows.push({ word, action, with: needsWith ? withValue : "" });
  }
  if (rows.length > MAX_TERMS_IMPORT_ROWS) {
    return { ok: false, failure: { kind: "too-large" } };
  }
  return { ok: true, rows };
}

/** The file control's accepted names and types, mirrored by its `accept` attribute. */
export function isAcceptedTermsFile(name: string, type: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".csv") ||
    lower.endsWith(".txt") ||
    type === "text/csv" ||
    type === "text/plain"
  );
}
