import {
  DYNAMIC_ABS_SILENCE_RMS,
  DYNAMIC_SILENCE_RATIO,
  SPEECH_PEAK_DECAY,
} from "@/live/window-policy";

/** A window with less speech than this is skipped once the session has heard speech. */
export const MIN_WINDOW_SPEECH_MS = 300;
/** A window is only skipped when its peak is well below the speech heard so far. */
export const QUIET_WINDOW_RATIO = 0.25;

export interface SpeechGateState {
  heardSpeech: boolean;
  peakRms: number;
}

export interface WindowSpeechStats {
  speechMs: number;
  peakRms: number;
  /** Any unreadable level sample sends the window rather than guessing it was silent. */
  levelReadFailed: boolean;
}

export function initialSpeechGateState(): SpeechGateState {
  return { heardSpeech: false, peakRms: 0 };
}

/**
 * Classify one 100ms level sample and learn the recent speech peak. Activity erodes the
 * peak so a loud transient or a loud passage cannot lift the thresholds for the rest of
 * the service; silence does not, so a quiet stretch keeps its baseline and stays gated.
 */
export function observeSpeechSample(
  state: SpeechGateState,
  sampleRms: number,
): { state: SpeechGateState; speech: boolean } {
  const sample = Number.isFinite(sampleRms) ? Math.max(0, sampleRms) : 0;
  const active = sample >= DYNAMIC_ABS_SILENCE_RMS;
  const baselinePeak = active ? state.peakRms * SPEECH_PEAK_DECAY : state.peakRms;
  const threshold = Math.max(
    DYNAMIC_ABS_SILENCE_RMS,
    DYNAMIC_SILENCE_RATIO * baselinePeak,
  );
  if (sample <= 0 || sample < threshold) {
    return {
      state: { heardSpeech: state.heardSpeech, peakRms: baselinePeak },
      speech: false,
    };
  }
  return {
    state: { heardSpeech: true, peakRms: Math.max(baselinePeak, sample) },
    speech: true,
  };
}

/**
 * Decide whether a completed window is worth transcribing. Gating starts only after the
 * session has heard speech, any doubt sends the window, and a quiet microphone is never
 * fully silenced.
 */
export function shouldSendWindow(
  state: SpeechGateState,
  stats: WindowSpeechStats,
): boolean {
  if (stats.levelReadFailed) return true;
  if (!state.heardSpeech) return true;
  if (stats.speechMs >= MIN_WINDOW_SPEECH_MS) return true;
  if (state.peakRms <= 0) return true;
  return stats.peakRms >= state.peakRms * QUIET_WINDOW_RATIO;
}
