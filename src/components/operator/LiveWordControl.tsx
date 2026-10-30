"use client";

import { useId, useState } from "react";

import { LIVE_WORD_ACTIONS, MAX_LIVE_WORD_CHARS, type LiveWordEntry } from "@/live/live-words";
import { WORD_ACTIONS, cleanWordValue, type WordRow } from "@/live/words";

interface LiveWordControlProps {
  entries: readonly LiveWordEntry[];
  onAdd: (row: WordRow) => void;
  onRemove: (id: string) => void;
  onKeepInWords: (row: WordRow) => void;
  disabled?: boolean;
}

const LIVE_ACTION_OPTIONS = LIVE_WORD_ACTIONS
  .map((value) => WORD_ACTIONS.find((option) => option.value === value))
  .filter((option): option is (typeof WORD_ACTIONS)[number] => Boolean(option));

/** Quick corrections that apply to captions starting after the operator adds them. */
export function LiveWordControl({
  entries,
  onAdd,
  onRemove,
  onKeepInWords,
  disabled = false,
}: LiveWordControlProps) {
  const [word, setWord] = useState("");
  const [action, setAction] = useState<(typeof LIVE_WORD_ACTIONS)[number]>("hide");
  const [withValue, setWithValue] = useState("");
  const [error, setError] = useState("");
  const [keptEntryIds, setKeptEntryIds] = useState<ReadonlySet<string>>(() => new Set());
  const errorId = useId();
  const needsWith = action === "fix" || action === "translate";

  const add = () => {
    const cleanWord = cleanWordValue(word);
    const cleanWith = needsWith ? cleanWordValue(withValue) : "";
    if (!cleanWord) return setError("Type the word first.");
    if (needsWith && !cleanWith) return setError("Fill in “With” for this action.");
    onAdd({ word: cleanWord, action, with: cleanWith });
    setWord("");
    setWithValue("");
    setError("");
  };

  return (
    <section className="liveWordControl" aria-labelledby="live-word-control-heading">
      <h3 id="live-word-control-heading">Quick override</h3>
      <p className="settingHint">
        Applies from the next caption, without Apply now. Keep in Words saves it for future services.
      </p>
      <form
        className="liveWordForm"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label>
          Word
          <input
            name="liveWord"
            autoComplete="off"
            spellCheck={false}
            value={word}
            maxLength={MAX_LIVE_WORD_CHARS}
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
            placeholder="e.g. Pastor Ken…"
            onChange={(event) => setWord(event.target.value)}
          />
        </label>
        <label>
          What to do
          <select
            name="liveWordAction"
            autoComplete="off"
            value={action}
            disabled={disabled}
            onChange={(event) => setAction(event.target.value as (typeof LIVE_WORD_ACTIONS)[number])}
          >
            {LIVE_ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {needsWith ? (
          <label>
            With
            <input
              name="liveWordWith"
              autoComplete="off"
              spellCheck={false}
              value={withValue}
              maxLength={MAX_LIVE_WORD_CHARS}
              disabled={disabled}
              aria-describedby={error ? errorId : undefined}
              placeholder={action === "fix" ? "e.g. Pastor Kenneth…" : "e.g. Rahmat…"}
              onChange={(event) => setWithValue(event.target.value)}
            />
          </label>
        ) : null}
        <button type="submit" className="primaryButton" disabled={disabled}>
          Add quick override
        </button>
      </form>
      {error ? <p className="errorText" id={errorId} role="alert">{error}</p> : null}
      <div className="liveWordEntries">
        <h4>Quick overrides in use</h4>
        {entries.length ? (
          <ul className="liveWordList">
            {entries.map(({ id, row }) => {
              const actionLabel = LIVE_ACTION_OPTIONS.find(({ value }) => value === row.action)?.label.replace(/…$/u, "");
              const kept = keptEntryIds.has(id);
              return (
                <li key={id}>
                  <div className="liveWordEntryDetails">
                    <strong>{row.word}</strong>
                    <span>{actionLabel}{row.with ? ` ${row.with}` : ""}</span>
                  </div>
                  <div className="liveWordEntryActions">
                    {kept ? (
                      <span role="status" aria-live="polite">Kept for Apply now</span>
                    ) : (
                      <button
                        type="button"
                        className="textButton"
                        disabled={disabled}
                        onClick={() => {
                          onKeepInWords(row);
                          setKeptEntryIds((current) => new Set(current).add(id));
                        }}
                      >
                        Keep in Words
                      </button>
                    )}
                    <button
                      type="button"
                      className="textButton"
                      aria-label={`Remove ${row.word} quick override`}
                      disabled={disabled}
                      onClick={() => {
                        onRemove(id);
                        setKeptEntryIds((current) => {
                          const next = new Set(current);
                          next.delete(id);
                          return next;
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="emptyState">No quick overrides in use. Add a word and choose what to do.</p>
        )}
      </div>
    </section>
  );
}
