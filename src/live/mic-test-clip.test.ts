import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MIC_TEST_CLIP_MAX_MS, MicTestClip, type MicTestClipSnapshot } from "@/live/mic-test-clip";

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["synthetic-clip"], { type: "audio/webm" }) } as BlobEvent);
    this.onstop?.();
  });
}

function fakeStream() {
  return { active: true } as MediaStream;
}

function fakeAudio() {
  return {
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    currentTime: 0,
    onended: null,
    onerror: null,
  } as unknown as HTMLAudioElement;
}

let urlCounter = 0;

function setup(overrides: Partial<ConstructorParameters<typeof MicTestClip>[0]> = {}) {
  const snapshots: MicTestClipSnapshot[] = [];
  const audio = fakeAudio();
  const createObjectUrl = vi.fn(() => `blob:synthetic-${++urlCounter}`);
  const revokeObjectUrl = vi.fn();
  const ensureStream = vi.fn(async () => fakeStream());
  const clip = new MicTestClip({
    ensureStream,
    onChange: (snapshot) => snapshots.push(snapshot),
    createAudio: () => audio,
    createObjectUrl,
    revokeObjectUrl,
    ...overrides,
  });
  return { clip, snapshots, audio, createObjectUrl, revokeObjectUrl, ensureStream };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("microphone test clip", () => {
  it("records for at most ten seconds, then becomes ready", async () => {
    const { clip, createObjectUrl } = setup();

    await clip.start();
    expect(clip.getSnapshot()).toEqual({ state: "recording", playbackAvailable: true });

    await vi.advanceTimersByTimeAsync(MIC_TEST_CLIP_MAX_MS - 1);
    expect(clip.getSnapshot().state).toBe("recording");
    await vi.advanceTimersByTimeAsync(1);

    expect(clip.getSnapshot()).toEqual({ state: "ready", playbackAvailable: true });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("stops early and keeps one clip", async () => {
    const { clip, createObjectUrl } = setup();

    await clip.start();
    clip.stopRecording();

    expect(clip.getSnapshot().state).toBe("ready");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("replaces the clip and revokes the old URL on Test again", async () => {
    const { clip, createObjectUrl, revokeObjectUrl } = setup();

    await clip.start();
    clip.stopRecording();
    const firstUrl = createObjectUrl.mock.results[0]?.value;

    await clip.start();
    expect(revokeObjectUrl).toHaveBeenCalledWith(firstUrl);
    clip.stopRecording();

    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it("discards the clip, stops playback and revokes the URL", async () => {
    const { clip, audio, createObjectUrl, revokeObjectUrl } = setup();

    await clip.start();
    clip.stopRecording();
    clip.togglePlayback();
    const url = createObjectUrl.mock.results[0]?.value;

    clip.discard();

    expect(clip.getSnapshot().state).toBe("idle");
    expect(audio.pause).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith(url);
    expect(audio.onended).toBeNull();
  });

  it("stops a recording without producing a clip when discarded", async () => {
    const { clip, createObjectUrl } = setup();

    await clip.start();
    clip.discard();

    expect(clip.getSnapshot().state).toBe("idle");
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("plays and stops the clip", async () => {
    const { clip, audio } = setup();

    await clip.start();
    clip.stopRecording();
    clip.togglePlayback();
    expect(clip.getSnapshot().state).toBe("playing");
    expect(audio.play).toHaveBeenCalledTimes(1);

    clip.togglePlayback();
    expect(clip.getSnapshot().state).toBe("ready");
    expect(audio.pause).toHaveBeenCalled();
  });

  it("returns to ready when playback ends", async () => {
    const { clip, audio } = setup();

    await clip.start();
    clip.stopRecording();
    clip.togglePlayback();
    audio.onended?.(new Event("ended"));

    expect(clip.getSnapshot().state).toBe("ready");
  });

  it("keeps the level-only test when MediaRecorder is unavailable", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const { clip, ensureStream, createObjectUrl } = setup();

    await clip.start();

    expect(ensureStream).toHaveBeenCalledTimes(1);
    expect(clip.getSnapshot()).toEqual({ state: "idle", playbackAvailable: false });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("keeps the level-only test when the recorder fails to start", async () => {
    const { clip, ensureStream } = setup({
      createRecorder: () => {
        throw new Error("synthetic recorder failure");
      },
    });

    await clip.start();

    expect(ensureStream).toHaveBeenCalledTimes(1);
    expect(clip.getSnapshot()).toEqual({ state: "idle", playbackAvailable: false });
  });

  it("leaves no clip when microphone access is rejected", async () => {
    const { clip, createObjectUrl } = setup({
      ensureStream: async () => {
        throw new Error("denied");
      },
    });

    await clip.start();

    expect(clip.getSnapshot()).toEqual({ state: "idle", playbackAvailable: true });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("never sends the clip over the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { clip } = setup();

    await clip.start();
    clip.stopRecording();
    clip.togglePlayback();
    clip.togglePlayback();
    clip.discard();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
