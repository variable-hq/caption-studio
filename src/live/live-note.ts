import { DISALLOWED_CONTROL_CHARACTERS } from "@/ai/translation-prompt";

export const MAX_LIVE_NOTE_CHARS = 500;

export function normalizeLiveNote(value: unknown): string {
  if (typeof value !== "string" || DISALLOWED_CONTROL_CHARACTERS.test(value)) return "";
  return value.trim().slice(0, MAX_LIVE_NOTE_CHARS).trim();
}
