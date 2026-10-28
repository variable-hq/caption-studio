"use client";
import { MAX_LIVE_NOTE_CHARS } from "@/live/live-note";
import { DISALLOWED_CONTROL_CHARACTERS } from "@/ai/translation-prompt";

export function LiveNoteControl({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <div className="liveNoteControl">
    <label htmlFor="live-note">Live note</label>
    <textarea id="live-note" name="liveNote" autoComplete="off" maxLength={MAX_LIVE_NOTE_CHARS} rows={3} disabled={disabled} value={value}
      onChange={(event) => {
        if (!DISALLOWED_CONTROL_CHARACTERS.test(event.target.value)) onChange(event.target.value.slice(0, MAX_LIVE_NOTE_CHARS));
      }} />
    <p className="settingHint">Tells the translator about names, sound words or who is speaking, from the next caption. To change a word exactly, use Settings › Words. <span className="characterCount">{value.length}/{MAX_LIVE_NOTE_CHARS}</span></p>
    <div className="buttonRow"><button type="button" className="textButton" disabled={disabled || !value} onClick={() => onChange("")}>Clear live note</button></div>
  </div>;
}
