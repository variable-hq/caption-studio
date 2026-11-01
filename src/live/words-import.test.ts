import { describe, expect, it } from "vitest";

import { wordsFromSettings, wordsToSettings, type WordRow } from "@/live/words";
import {
  MAX_TERMS_IMPORT_BYTES,
  MAX_TERMS_IMPORT_ROWS,
  isAcceptedTermsFile,
  parseWordsImport,
} from "@/live/words-import";

function imported(text: string): WordRow[] {
  const result = parseWordsImport(text);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result.ok ? result.rows : [];
}

describe("Terms list import", () => {
  it("reads one row per new line and per semicolon", () => {
    expect(imported("word1,recognise\nword2,hide")).toEqual([
      { word: "word1", action: "recognise", with: "" },
      { word: "word2", action: "hide", with: "" },
    ]);
    expect(imported("word1,recognise; word2,hide")).toEqual([
      { word: "word1", action: "recognise", with: "" },
      { word: "word2", action: "hide", with: "" },
    ]);
  });

  it("reads term,action and term,action,with", () => {
    expect(imported("word1,recognise")).toEqual([
      { word: "word1", action: "recognise", with: "" },
    ]);
    expect(imported("word1,replace,word2")).toEqual([
      { word: "word1", action: "replace", with: "word2" },
    ]);
    expect(imported("word1,fix,word2")).toEqual([
      { word: "word1", action: "fix", with: "word2" },
    ]);
    expect(imported("word1,translate,word2")).toEqual([
      { word: "word1", action: "translate", with: "word2" },
    ]);
  });

  it("accepts recognise and recognize", () => {
    expect(imported("word1,recognise")).toEqual(imported("word1,recognize"));
  });

  it("ignores a first header line", () => {
    expect(imported("term,action,with\nword1,recognise")).toEqual([
      { word: "word1", action: "recognise", with: "" },
    ]);
  });

  it("removes optional surrounding quotes", () => {
    expect(imported('"word1",recognise\n"word2",replace,"word3"')).toEqual([
      { word: "word1", action: "recognise", with: "" },
      { word: "word2", action: "replace", with: "word3" },
    ]);
  });

  it("accepts a byte-order mark and CRLF line endings", () => {
    expect(imported("\uFEFFword1,recognise\r\nword2,hide\r\n")).toEqual([
      { word: "word1", action: "recognise", with: "" },
      { word: "word2", action: "hide", with: "" },
    ]);
  });

  it("reports the first unknown action with its line and the action", () => {
    const result = parseWordsImport("word1,recognise\nword2,paint\nword3,hide");
    expect(result).toEqual({
      ok: false,
      failure: { kind: "invalid-row", line: 2, reason: "unknown-action", action: "paint" },
    });
  });

  it("reports a row without a term or an action", () => {
    expect(parseWordsImport("\n,recognise")).toEqual({
      ok: false,
      failure: { kind: "invalid-row", line: 2, reason: "needs-term-and-action" },
    });
    expect(parseWordsImport("word1,")).toEqual({
      ok: false,
      failure: { kind: "invalid-row", line: 1, reason: "needs-term-and-action" },
    });
  });

  it("requires a with value for fix, translate and replace", () => {
    for (const action of ["fix", "translate", "replace"]) {
      expect(parseWordsImport(`word1,${action}`)).toEqual({
        ok: false,
        failure: { kind: "invalid-row", line: 1, reason: "needs-with" },
      });
    }
  });

  it("stops at the first bad line and returns no rows with it", () => {
    const result = parseWordsImport("word1,fix,word2\nword3,paint\nword4,hide");
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("rows");
  });

  it("rejects past the byte and row bounds", () => {
    expect(parseWordsImport("a".repeat(MAX_TERMS_IMPORT_BYTES + 1))).toEqual({
      ok: false,
      failure: { kind: "too-large" },
    });
    const rows = Array.from({ length: MAX_TERMS_IMPORT_ROWS + 1 }, (_, index) => `word${index},recognise`).join("\n");
    expect(parseWordsImport(rows)).toEqual({ ok: false, failure: { kind: "too-large" } });
    const atLimit = Array.from({ length: MAX_TERMS_IMPORT_ROWS }, (_, index) => `word${index},recognise`).join("\n");
    expect(parseWordsImport(atLimit).ok).toBe(true);
  });

  it("accepts .csv and .txt files and refuses other names", () => {
    expect(isAcceptedTermsFile("terms.csv", "")).toBe(true);
    expect(isAcceptedTermsFile("terms.TXT", "")).toBe(true);
    expect(isAcceptedTermsFile("terms", "text/plain")).toBe(true);
    expect(isAcceptedTermsFile("terms.xlsx", "application/vnd.ms-excel")).toBe(false);
    expect(isAcceptedTermsFile("terms.pdf", "application/pdf")).toBe(false);
  });

  it("round trips imported rows through the stored settings", () => {
    const rows: WordRow[] = [
      { word: "alpha", action: "recognise", with: "" },
      { word: "Yesus", action: "fix", with: "Jesus" },
      { word: "Kristus", action: "translate", with: "Christ" },
      { word: "hidden", action: "mask", with: "" },
      { word: "word1", action: "replace", with: "word2" },
      { word: "caption", action: "hide", with: "" },
    ];
    const restored = wordsFromSettings(wordsToSettings(rows).keywordText, wordsToSettings(rows).filterText);
    const key = (row: WordRow) => `${row.action}:${row.word}:${row.with}`;
    expect(restored.map(key).sort()).toEqual(rows.map(key).sort());
  });
});
