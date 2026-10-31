"use client";

import { useId, useState } from "react";

import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/provider";
import {
  LIVE_WORD_ACTIONS,
  MAX_LIVE_WORD_CHARS,
  MAX_LIVE_WORD_ENTRIES,
  type LiveWordEntry,
} from "@/live/live-words";
import { cleanWordValue, type WordRow } from "@/live/words";

interface LiveWordControlProps {
  entries: readonly LiveWordEntry[];
  onAdd: (row: WordRow) => void;
  onRemove: (id: string) => void;
  onKeepInWords: (row: WordRow) => void;
  disabled?: boolean;
}

const LIVE_ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  recognise: "wordAction.recognise",
  fix: "wordAction.fix",
  translate: "wordAction.translate",
  mask: "wordAction.mask",
  replace: "wordAction.replace",
  hide: "wordAction.hide",
};

/** Quick corrections that apply to captions starting after the operator adds them. */
export function LiveWordControl({
  entries,
  onAdd,
  onRemove,
  onKeepInWords,
  disabled = false,
}: LiveWordControlProps) {
  const t = useT();
  const [word, setWord] = useState("");
  const [action, setAction] = useState<(typeof LIVE_WORD_ACTIONS)[number]>("hide");
  const [withValue, setWithValue] = useState("");
  const [error, setError] = useState("");
  const [keptEntryIds, setKeptEntryIds] = useState<ReadonlySet<string>>(() => new Set());
  const errorId = useId();
  const needsWith = action === "fix" || action === "translate";
  const atCapacity = entries.length >= MAX_LIVE_WORD_ENTRIES;
  const actionLabel = (value: string) => t(LIVE_ACTION_LABEL_KEYS[value] ?? "wordAction.recognise");
  const actionSummary = (value: string) => actionLabel(value).replace(/…$/u, "");

  const add = () => {
    if (atCapacity) return;
    const cleanWord = cleanWordValue(word);
    const cleanWith = needsWith ? cleanWordValue(withValue) : "";
    if (!cleanWord) return setError(t("common.typeWordFirst"));
    if (needsWith && !cleanWith) return setError(t("common.fillWith"));
    onAdd({ word: cleanWord, action, with: cleanWith });
    setWord("");
    setWithValue("");
    setError("");
  };

  return (
    <section className="liveWordControl" aria-labelledby="live-word-control-heading">
      <h3 id="live-word-control-heading">{t("liveWord.title")}</h3>
      <p className="settingHint">
        {t("liveWord.hint")}
      </p>
      <form
        className="liveWordForm"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <label>
          {t("liveWord.word")}
          <input
            name="liveWord"
            autoComplete="off"
            spellCheck={false}
            value={word}
            maxLength={MAX_LIVE_WORD_CHARS}
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
            placeholder={t("liveWord.placeholderWord")}
            onChange={(event) => setWord(event.target.value)}
          />
        </label>
        <label>
          {t("liveWord.action")}
          <select
            name="liveWordAction"
            autoComplete="off"
            value={action}
            disabled={disabled}
            onChange={(event) => setAction(event.target.value as (typeof LIVE_WORD_ACTIONS)[number])}
          >
            {LIVE_WORD_ACTIONS.map((value) => (
              <option key={value} value={value}>{actionLabel(value)}</option>
            ))}
          </select>
        </label>
        {needsWith ? (
          <label>
            {t("liveWord.with")}
            <input
              name="liveWordWith"
              autoComplete="off"
              spellCheck={false}
              value={withValue}
              maxLength={MAX_LIVE_WORD_CHARS}
              disabled={disabled}
              aria-describedby={error ? errorId : undefined}
              placeholder={action === "fix" ? t("liveWord.placeholderFix") : t("liveWord.placeholderTranslate")}
              onChange={(event) => setWithValue(event.target.value)}
            />
          </label>
        ) : null}
        <button type="submit" className="primaryButton" disabled={disabled || atCapacity}>
          {t("liveWord.add")}
        </button>
      </form>
      {atCapacity ? (
        <p className="settingHint" role="status">
          {t("liveWord.capacity", { max: MAX_LIVE_WORD_ENTRIES })}
        </p>
      ) : null}
      {error ? <p className="errorText" id={errorId} role="alert">{error}</p> : null}
      <div className="liveWordEntries">
        <h4>{t("liveWord.inUse")}</h4>
        {entries.length ? (
          <ul className="liveWordList">
            {entries.map(({ id, row }) => {
              const kept = keptEntryIds.has(id);
              return (
                <li key={id}>
                  <div className="liveWordEntryDetails">
                    <strong>{row.word}</strong>
                    <span>{actionSummary(row.action)}{row.with ? ` ${row.with}` : ""}</span>
                  </div>
                  <div className="liveWordEntryActions">
                    {kept ? (
                      <span role="status" aria-live="polite">{t("liveWord.kept")}</span>
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
                        {t("liveWord.keep")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="textButton"
                      aria-label={t("liveWord.removeLabel", { word: row.word })}
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
                      {t("common.remove")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="emptyState">{t("liveWord.empty")}</p>
        )}
      </div>
    </section>
  );
}
