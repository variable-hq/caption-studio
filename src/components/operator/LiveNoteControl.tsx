"use client";
import { useT } from "@/i18n/provider";
import { MAX_LIVE_NOTE_CHARS } from "@/live/live-note";
import { DISALLOWED_CONTROL_CHARACTERS } from "@/ai/translation-prompt";

export function LiveNoteControl({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const t = useT();
  return <div className="liveNoteControl">
    <label htmlFor="live-note">{t("liveNote.label")}</label>
    <textarea id="live-note" name="liveNote" autoComplete="off" maxLength={MAX_LIVE_NOTE_CHARS} rows={3} disabled={disabled} value={value}
      onChange={(event) => {
        if (!DISALLOWED_CONTROL_CHARACTERS.test(event.target.value)) onChange(event.target.value.slice(0, MAX_LIVE_NOTE_CHARS));
      }} />
    <p className="settingHint">{t("liveNote.hint")} <span className="characterCount">{t("liveNote.characterCount", { count: value.length, max: MAX_LIVE_NOTE_CHARS })}</span></p>
    <div className="buttonRow"><button type="button" className="textButton" disabled={disabled || !value} onClick={() => onChange("")}>{t("liveNote.clear")}</button></div>
  </div>;
}
