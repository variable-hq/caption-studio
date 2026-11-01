import { recorderMimeType, recorderOptions } from "@/live/recorder-options";

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

interface MicTestClipDependencies {
  onChange: (snapshot: MicTestClipSnapshot) => void;
  ensureStream?: () => Promise<MediaStream | null>;
  createRecorder?: (stream: MediaStream) => MediaRecorder;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  createAudio?: (url: string) => HTMLAudioElement;
}

/**
 * Records one short microphone test clip and plays it back. Everything stays in memory;
 * `discard` stops recording or playback and releases the object URL.
 */
export class MicTestClip {
  private snapshot: MicTestClipSnapshot = { state: "idle", playbackAvailable: true };
  private ensureStream: (() => Promise<MediaStream | null>) | undefined;
  private recorder: MediaRecorder | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private objectUrl: string | null = null;
  private audio: HTMLAudioElement | null = null;
  private generation = 0;

  constructor(private readonly dependencies: MicTestClipDependencies) {
    this.ensureStream = dependencies.ensureStream;
  }

  setEnsureStream(ensureStream: () => Promise<MediaStream | null>) {
    this.ensureStream = ensureStream;
  }

  async start() {
    if (this.snapshot.state === "recording") {
      this.stopRecording();
      return;
    }
    if (this.snapshot.state === "asking") return;

    this.discard();
    const generation = this.generation;
    this.set({ state: "asking" });

    let stream: MediaStream | null;
    try {
      stream = this.ensureStream ? await this.ensureStream() : null;
    } catch {
      if (generation === this.generation) this.set({ state: "idle" });
      return;
    }
    if (generation !== this.generation) return;
    if (!stream) {
      this.set({ state: "idle" });
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      this.set({ state: "idle", playbackAvailable: false });
      return;
    }

    try {
      const recorder = this.dependencies.createRecorder
        ? this.dependencies.createRecorder(stream)
        : new MediaRecorder(stream, recorderOptions());
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => this.finish(recorder, chunks);
      recorder.onerror = () => {
        if (this.recorder !== recorder) return;
        this.recorder = null;
        this.clearTimer();
        this.set({ state: "idle", playbackAvailable: false });
      };
      this.recorder = recorder;
      recorder.start();
      this.timer = setTimeout(() => this.stopRecording(), MIC_TEST_CLIP_MAX_MS);
      this.set({ state: "recording", playbackAvailable: true });
    } catch {
      this.set({ state: "idle", playbackAvailable: false });
    }
  }

  stopRecording() {
    if (this.snapshot.state !== "recording" || !this.recorder) return;
    this.clearTimer();
    try {
      this.recorder.stop();
    } catch {
      this.discard();
    }
  }

  togglePlayback() {
    if (this.snapshot.state === "playing") {
      this.stopPlayback();
      return;
    }
    if (this.snapshot.state !== "ready" || !this.audio) return;
    const playback = this.audio.play() as Promise<void> | undefined;
    this.set({ state: "playing" });
    void playback?.catch(() => this.stopPlayback());
  }

  discard() {
    this.generation += 1;
    this.clearTimer();
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch { /* The recorder is already inactive. */ }
    }
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio = null;
    }
    if (this.objectUrl) {
      this.revokeObjectUrl(this.objectUrl);
      this.objectUrl = null;
    }
    this.set({ state: "idle", playbackAvailable: this.snapshot.playbackAvailable });
  }

  getSnapshot() {
    return this.snapshot;
  }

  private finish(recorder: MediaRecorder, chunks: Blob[]) {
    if (this.recorder !== recorder) return;
    this.recorder = null;
    this.clearTimer();
    if (chunks.length === 0) {
      this.set({ state: "idle", playbackAvailable: true });
      return;
    }
    let url: string;
    try {
      url = this.dependencies.createObjectUrl
        ? this.dependencies.createObjectUrl(new Blob(chunks, { type: recorderMimeType(recorder, chunks) }))
        : URL.createObjectURL(new Blob(chunks, { type: recorderMimeType(recorder, chunks) }));
    } catch {
      this.set({ state: "idle", playbackAvailable: false });
      return;
    }
    let audio: HTMLAudioElement;
    try {
      audio = this.dependencies.createAudio ? this.dependencies.createAudio(url) : new Audio(url);
    } catch {
      this.revokeObjectUrl(url);
      this.set({ state: "idle", playbackAvailable: false });
      return;
    }
    this.objectUrl = url;
    this.audio = audio;
    audio.onended = () => this.stopPlayback();
    audio.onerror = () => this.stopPlayback();
    this.set({ state: "ready", playbackAvailable: true });
  }

  private stopPlayback() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    if (this.snapshot.state === "playing") this.set({ state: "ready" });
  }

  private clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private revokeObjectUrl(url: string) {
    if (this.dependencies.revokeObjectUrl) this.dependencies.revokeObjectUrl(url);
    else URL.revokeObjectURL(url);
  }

  private set(next: Partial<MicTestClipSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.dependencies.onChange(this.snapshot);
  }
}
