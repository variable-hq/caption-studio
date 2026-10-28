"use client";
import { MAX_SESSION_DESCRIPTION_CHARS, MAX_SESSION_SPEAKER_CHARS, MAX_SESSION_TOPIC_CHARS, type SessionMetadata } from "@/experience/contracts";

function localDateTime(value: number | null) {
  if (value === null) return "";
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export function SessionMetadataFields({ value, disabled, onChange }: { value: SessionMetadata; disabled: boolean; onChange: (value: SessionMetadata) => void }) {
  const update = (field: keyof SessionMetadata, next: string | number | null) => onChange({ ...value, [field]: next });
  return <div className="sessionMetadataFields">
    <h3>Session details</h3>
    <label>Topic<input name="sessionTopic" autoComplete="off" maxLength={MAX_SESSION_TOPIC_CHARS} disabled={disabled} value={value.topic} onChange={(event) => update("topic", event.target.value)} /></label>
    <label>Speaker<input name="sessionSpeaker" autoComplete="off" maxLength={MAX_SESSION_SPEAKER_CHARS} disabled={disabled} value={value.speaker} onChange={(event) => update("speaker", event.target.value)} /></label>
    <label>Session date and time<input type="datetime-local" name="sessionAt" disabled={disabled} value={localDateTime(value.sessionAt)} onChange={(event) => update("sessionAt", event.target.value ? new Date(event.target.value).getTime() : null)} /></label>
    <label>Description<textarea name="sessionDescription" autoComplete="off" maxLength={MAX_SESSION_DESCRIPTION_CHARS} rows={3} disabled={disabled} value={value.description} onChange={(event) => update("description", event.target.value)} /></label>
  </div>;
}
