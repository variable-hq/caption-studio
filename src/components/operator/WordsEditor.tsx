"use client";

import { useId, useRef, useState } from "react";

import { SettingGroup } from "@/components/operator/SettingsParts";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { translatePlural } from "@/i18n";
import {
  MAX_TERMS_IMPORT_BYTES,
  isAcceptedTermsFile,
  parseWordsImport,
} from "@/live/words-import";
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

/** Settings › Terms: one row per term and one action, saved as the glossary and filter. */
export function WordsEditor({ keywordText, filterText, disabled, onChange }: WordsEditorProps) {
  const { t, locale } = useI18n();
  const rows = wordsFromSettings(keywordText, filterText);
  const [word, setWord] = useState("");
  const [action, setAction] = useState<WordAction>("recognise");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string>("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const errorId = useId();
  const importErrorId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const importList = (text: string, source: "paste" | "file") => {
    setImportStatus("");
    const result = parseWordsImport(text);
    if (!result.ok) {
      const failure = result.failure;
      if (failure.kind === "too-large") {
        setImportError(t("wordsEditor.importTooLarge"));
        return;
      }
      const reason =
        failure.reason === "unknown-action"
          ? t("wordsEditor.importReasonUnknownAction", { action: failure.action ?? "" })
          : failure.reason === "needs-with"
            ? t("wordsEditor.importReasonNeedsWith")
            : t("wordsEditor.importReasonNeedsTerm");
      setImportError(t("wordsEditor.importParseError", { line: failure.line, reason }));
      return;
    }
    save([...rows, ...result.rows]);
    setImportError("");
    if (source === "paste") setImportText("");
    setImportStatus(translatePlural(locale, "wordsEditor.importSuccess", result.rows.length));
  };

  const chooseFile = async (file: File) => {
    setImportStatus("");
    if (!isAcceptedTermsFile(file.name, file.type)) {
      setImportError(t("wordsEditor.importWrongType"));
      return;
    }
    if (file.size > MAX_TERMS_IMPORT_BYTES) {
      setImportError(t("wordsEditor.importTooLarge"));
      return;
    }
    try {
      importList(await file.text(), "file");
    } catch {
      setImportError(t("wordsEditor.importUnreadable"));
    }
  };

  // The pipeline reads at most 40 glossary entries and 40 filter entries.
  const { keywordText: compiledKeywords, filterText: compiledFilters } = wordsToSettings(rows);
  const overLimit =
    compiledKeywords.split(", ").filter(Boolean).length > 40 ||
    compiledFilters.split(", ").filter(Boolean).length > 40;

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
      <SettingGroup title={t("wordsEditor.addTitle")} hint={t("wordsEditor.addHint")}>
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
      <SettingGroup title={t("wordsEditor.importTitle")} hint={t("wordsEditor.importHint")}>
        <label>
          {t("wordsEditor.importPaste")}
          <textarea
            name="termsImport"
            autoComplete="off"
            spellCheck={false}
            rows={4}
            value={importText}
            disabled={disabled}
            aria-describedby={importError ? importErrorId : undefined}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportError("");
              setImportStatus("");
            }}
          />
        </label>
        <div className="buttonRow">
          <button
            type="button"
            className="secondaryButton"
            data-testid="terms-import-choose"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            {t("wordsEditor.importChooseFile")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="visuallyHidden"
            data-testid="terms-import-file"
            aria-label={t("wordsEditor.importChooseFile")}
            tabIndex={-1}
            accept=".csv,.txt,text/csv,text/plain"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void chooseFile(file);
            }}
          />
          <button
            type="button"
            className="primaryButton"
            disabled={disabled || !importText.trim()}
            onClick={() => importList(importText, "paste")}
          >
            {t("wordsEditor.importAction")}
          </button>
        </div>
        {importError ? <p className="errorText" id={importErrorId} role="alert">{importError}</p> : null}
        {importStatus ? <p className="settingHint" role="status" aria-live="polite">{importStatus}</p> : null}
      </SettingGroup>
    </>
  );
}
