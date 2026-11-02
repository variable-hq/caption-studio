import type { OperatorPreferences } from "@/experience/preferences";
import {
  DEFAULT_OUTPUT_BUFFER_DWELL_MS,
  type OutputBufferCount,
  type OutputBufferDwellMs,
} from "@/live/output-buffer";

/** The per-service choices visible on the Live screen when its shared save button is used. */
export interface LiveScreenChoices {
  hasService: boolean;
  saveHistory: boolean;
  outputBufferCount: OutputBufferCount;
  outputBufferDwellMs: OutputBufferDwellMs;
}

/** The saved defaults those choices are compared with; `null` means never saved. */
export interface LiveScreenSavedDefaults {
  saveHistoryDefault: boolean | null;
  outputBufferCount: OutputBufferCount | null;
  outputBufferDwellMs: OutputBufferDwellMs | null;
}

export type LiveScreenDefaultsPatch = Partial<
  Pick<
    OperatorPreferences,
    "saveHistoryDefault" | "outputBufferCount" | "outputBufferDwellMs"
  >
>;

export interface LiveScreenDefaultsMessages {
  saving: string;
  saved: string;
  failed: string;
}

export interface SaveLiveScreenDefaultsOptions {
  choices: LiveScreenChoices;
  save: (patch: LiveScreenDefaultsPatch) => Promise<boolean>;
  report: (message: string) => void;
  messages: LiveScreenDefaultsMessages;
}

function outputBufferDiffers(
  choices: LiveScreenChoices,
  defaults: LiveScreenSavedDefaults,
): boolean {
  if (defaults.outputBufferCount === null) return true;
  if (defaults.outputBufferCount !== choices.outputBufferCount) return true;
  // The dwell only matters while the buffer is on; Off has no duration.
  return (
    choices.outputBufferCount > 0 &&
    (defaults.outputBufferDwellMs ?? DEFAULT_OUTPUT_BUFFER_DWELL_MS) !== choices.outputBufferDwellMs
  );
}

/** The Live save button appears only while a visible choice differs from its saved default.
 * The transcript choice is visible only before a service starts. */
export function liveScreenDefaultsChanged(
  choices: LiveScreenChoices,
  defaults: LiveScreenSavedDefaults,
): boolean {
  const transcriptChanged =
    !choices.hasService && defaults.saveHistoryDefault !== choices.saveHistory;
  return transcriptChanged || outputBufferDiffers(choices, defaults);
}

/** The write for one shared save: only the choices currently visible on Live, so a hidden
 * choice is never overwritten. Before a service that is the transcript choice and the
 * output buffer wait; during a service it is the wait alone. */
export function liveScreenDefaultsPatch(
  choices: LiveScreenChoices,
): LiveScreenDefaultsPatch {
  if (choices.hasService) {
    return {
      outputBufferCount: choices.outputBufferCount,
      outputBufferDwellMs: choices.outputBufferDwellMs,
    };
  }
  return {
    saveHistoryDefault: choices.saveHistory,
    outputBufferCount: choices.outputBufferCount,
    outputBufferDwellMs: choices.outputBufferDwellMs,
  };
}

/** Saves the visible choices, reporting progress and the outcome. A failed save leaves the
 * local choices untouched, so the operator can retry without losing them. */
export async function saveLiveScreenDefaults({
  choices,
  save,
  report,
  messages,
}: SaveLiveScreenDefaultsOptions): Promise<boolean> {
  report(messages.saving);
  let saved = false;
  try {
    saved = await save(liveScreenDefaultsPatch(choices));
  } catch {
    saved = false;
  }
  report(saved ? messages.saved : messages.failed);
  return saved;
}
