/**
 * The in-memory microphone test clip. A test records at most `MIC_TEST_CLIP_MAX_MS`,
 * then can be played back through the browser's default speaker. The clip never leaves
 * this module: it is a Blob held in memory, never uploaded, stored or logged.
 */
export const MIC_TEST_CLIP_MAX_MS = 10_000;

export type MicTestClipState = "idle" | "asking" | "recording" | "ready" | "playing";

export interface MicTestClipSnapshot {
  state: MicTestClipState;
  /** False when the browser cannot record a clip; the level-only test still works. */
  playbackAvailable: boolean;
}

export interface MicTestClipApi {
  snapshot: MicTestClipSnapshot;
  start: () => Promise<void>;
  stopRecording: () => void;
  togglePlayback: () => void;
  discard: () => void;
}
