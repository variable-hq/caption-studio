"use client";

import { useId, useState } from "react";

import type { LanguageLocale, SourceLanguage } from "@/domain/languages";
import { TB2_SERVICE_VOCABULARY } from "@/pipeline/bible-terms";
import { SettingGroup } from "@/components/operator/SettingsParts";
import {
  WORD_ACTIONS,
  cleanWordValue,
  wordsFromSettings,
  wordsToSettings,
  type WordAction,
  type WordRow,
} from "@/live/words";

interface WordsEditorProps {
  keywordText: string;
  filterText: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: LanguageLocale;
  disabled: boolean;
  onChange: (settings: { keywordText: string; filterText: string }) => void;
}

const ACTION_LABELS = Object.fromEntries(WORD_ACTIONS.map(({ value, label }) => [value, label.replace(/…$/u, "")])) as Record<WordAction, string>;

/** Settings › Words: one row per word and one action, saved as the glossary and filter. */
export function WordsEditor({ keywordText, filterText, sourceLanguage, targetLanguage, disabled, onChange }: WordsEditorProps) {
  const rows = wordsFromSettings(keywordText, filterText);
  const [word, setWord] = useState("");
  const [action, setAction] = useState<WordAction>("recognise");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const errorId = useId();
  const needsWith = WORD_ACTIONS.find(({ value }) => value === action)?.needsWith ?? false;

  const save = (next: readonly WordRow[]) => onChange(wordsToSettings(next));

  const add = () => {
    const cleanWord = cleanWordValue(word);
    const cleanTarget = cleanWordValue(target);
    if (!cleanWord) return setError("Type the word first.");
    if (needsWith && !cleanTarget) return setError("Fill in “With” for this action.");
    save([...rows, { word: cleanWord, action, with: needsWith ? cleanTarget : "" }]);
    setWord("");
    setTarget("");
    setError("");
  };

  // The pipeline reads at most 40 glossary entries and 40 filter entries.
  const { keywordText: compiledKeywords, filterText: compiledFilters } = wordsToSettings(rows);
  const overLimit =
    compiledKeywords.split(", ").filter(Boolean).length > 40 ||
    compiledFilters.split(", ").filter(Boolean).length > 40;
  const tb2Available = targetLanguage === "en" && (sourceLanguage === "id" || sourceLanguage === "auto");

  return (
    <>
      <SettingGroup title="Your words" hint="You always see the original under “Heard” on the Live screen.">
      {rows.length ? (
        <div className="wordsTableBox">
          <table className="wordsTable">
            <thead>
              <tr>
                <th scope="col">Word</th>
                <th scope="col">What to do</th>
                <th scope="col">With</th>
                <th scope="col"><span className="visuallyHidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.action}:${row.word}:${index}`}>
                  <td>{row.word}</td>
                  <td>{ACTION_LABELS[row.action]}</td>
                  <td data-empty={!row.with}>{row.with || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="textButton"
                      disabled={disabled}
                      aria-label={`Remove ${row.word}`}
                      onClick={() => save(rows.filter((_, other) => other !== index))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="emptyState">No words yet. Add names the AI should know, or words never to show.</p>
      )}
      </SettingGroup>
      <SettingGroup title="Add a word">
      {overLimit ? (
        <p className="operatorBanner" data-tone="warn" role="status">
          Only the first 40 names and terms and the first 40 hidden words are used. Remove some you no longer need.
        </p>
      ) : null}
      <form
        className="wordsAddRow"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label>
          Word
          <input
            name="word"
            autoComplete="off"
            spellCheck={false}
            value={word}
            maxLength={100}
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
            placeholder="e.g. Pastor Ken…"
            onChange={(event) => setWord(event.target.value)}
          />
        </label>
        <label>
          What to do
          <select
            name="wordAction"
            autoComplete="off"
            value={action}
            disabled={disabled}
            onChange={(event) => setAction(event.target.value as WordAction)}
          >
            {WORD_ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          With
          <input
            name="wordWith"
            autoComplete="off"
            spellCheck={false}
            value={target}
            maxLength={100}
            disabled={disabled || !needsWith}
            placeholder={needsWith ? "e.g. Pastor Kenneth…" : "Not needed"}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <button type="submit" className="primaryButton" disabled={disabled}>
          Add word
        </button>
      </form>
      {error ? <p className="errorText" id={errorId} role="alert">{error}</p> : null}
      </SettingGroup>
      <SettingGroup
        title="Bible names"
        hint="Adds the TB2 list of names once. Only useful when the preacher speaks Indonesian and captions are in English."
      >
        <div className="buttonRow">
        <button
          className="secondaryButton"
          type="button"
          disabled={disabled || !tb2Available}
          onClick={() => onChange({ keywordText: [keywordText, TB2_SERVICE_VOCABULARY].filter(Boolean).join(", "), filterText })}
        >
          Import names
        </button>
        </div>
      </SettingGroup>
    </>
  );
}
