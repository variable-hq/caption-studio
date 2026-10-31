"use client";

import { useId, useState } from "react";

import type { LanguageLocale, SourceLanguage } from "@/domain/languages";
import { TB2_SERVICE_VOCABULARY } from "@/pipeline/bible-terms";
import { SettingGroup } from "@/components/operator/SettingsParts";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/provider";
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

const ACTION_LABEL_KEYS: Record<WordAction, MessageKey> = {
  recognise: "wordAction.recognise",
  fix: "wordAction.fix",
  translate: "wordAction.translate",
  mask: "wordAction.mask",
  replace: "wordAction.replace",
  hide: "wordAction.hide",
};

/** The action label without the trailing ellipsis, for a table cell or summary line. */
export function wordActionLabel(t: (key: MessageKey) => string, action: WordAction) {
  return t(ACTION_LABEL_KEYS[action]).replace(/…$/u, "");
}

/** Settings › Words: one row per word and one action, saved as the glossary and filter. */
export function WordsEditor({ keywordText, filterText, sourceLanguage, targetLanguage, disabled, onChange }: WordsEditorProps) {
  const t = useT();
  const rows = wordsFromSettings(keywordText, filterText);
  const [word, setWord] = useState("");
  const [action, setAction] = useState<WordAction>("recognise");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string>("");
  const errorId = useId();
  const needsWith = WORD_ACTIONS.find(({ value }) => value === action)?.needsWith ?? false;

  const save = (next: readonly WordRow[]) => onChange(wordsToSettings(next));

  const add = () => {
    const cleanWord = cleanWordValue(word);
    const cleanTarget = cleanWordValue(target);
    if (!cleanWord) return setError(t("common.typeWordFirst"));
    if (needsWith && !cleanTarget) return setError(t("common.fillWith"));
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
      <SettingGroup title={t("wordsEditor.yourWordsTitle")} hint={t("wordsEditor.yourWordsHint")}>
      {rows.length ? (
        <div className="wordsTableBox">
          <table className="wordsTable">
            <thead>
              <tr>
                <th scope="col">{t("wordsEditor.word")}</th>
                <th scope="col">{t("wordsEditor.action")}</th>
                <th scope="col">{t("wordsEditor.with")}</th>
                <th scope="col"><span className="visuallyHidden">{t("wordsEditor.actions")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.action}:${row.word}:${index}`}>
                  <td>{row.word}</td>
                  <td>{wordActionLabel(t, row.action)}</td>
                  <td data-empty={!row.with}>{row.with || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="textButton"
                      disabled={disabled}
                      aria-label={t("wordsEditor.removeLabel", { word: row.word })}
                      onClick={() => save(rows.filter((_, other) => other !== index))}
                    >
                      {t("common.remove")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="emptyState">{t("wordsEditor.empty")}</p>
      )}
      </SettingGroup>
      <SettingGroup title={t("wordsEditor.addTitle")}>
      {overLimit ? (
        <p className="operatorBanner" data-tone="warn" role="status">
          {t("wordsEditor.overLimit", { max: 40 })}
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
          {t("wordsEditor.word")}
          <input
            name="word"
            autoComplete="off"
            spellCheck={false}
            value={word}
            maxLength={100}
            disabled={disabled}
            aria-describedby={error ? errorId : undefined}
            placeholder={t("wordsEditor.placeholderWord")}
            onChange={(event) => setWord(event.target.value)}
          />
        </label>
        <label>
          {t("wordsEditor.action")}
          <select
            name="wordAction"
            autoComplete="off"
            value={action}
            disabled={disabled}
            onChange={(event) => setAction(event.target.value as WordAction)}
          >
            {WORD_ACTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(ACTION_LABEL_KEYS[option.value])}</option>
            ))}
          </select>
        </label>
        <label>
          {t("wordsEditor.with")}
          <input
            name="wordWith"
            autoComplete="off"
            spellCheck={false}
            value={target}
            maxLength={100}
            disabled={disabled || !needsWith}
            placeholder={needsWith ? t("liveWord.placeholderFix") : t("wordsEditor.notNeeded")}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <button type="submit" className="primaryButton" disabled={disabled}>
          {t("wordsEditor.add")}
        </button>
      </form>
      {error ? <p className="errorText" id={errorId} role="alert">{error}</p> : null}
      </SettingGroup>
      <SettingGroup
        title={t("wordsEditor.bibleNamesTitle")}
        hint={t("wordsEditor.bibleNamesHint")}
      >
        <div className="buttonRow">
        <button
          className="secondaryButton"
          type="button"
          disabled={disabled || !tb2Available}
          onClick={() => onChange({ keywordText: [keywordText, TB2_SERVICE_VOCABULARY].filter(Boolean).join(", "), filterText })}
        >
          {t("wordsEditor.importNames")}
        </button>
        </div>
      </SettingGroup>
    </>
  );
}
