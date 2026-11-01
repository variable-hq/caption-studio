"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MicTestClip, type MicTestClipApi, type MicTestClipSnapshot } from "@/live/mic-test-clip";

const INITIAL_SNAPSHOT: MicTestClipSnapshot = { state: "idle", playbackAvailable: true };

/**
 * Wires the microphone test clip to React state. The caller supplies the stream getter, so
 * the clip records from the same microphone the level meter and live capture use.
 */
export function useMicTestClip(
  ensureStream: () => Promise<MediaStream | null>,
): MicTestClipApi {
  const ensureStreamRef = useRef(ensureStream);
  useEffect(() => {
    ensureStreamRef.current = ensureStream;
  }, [ensureStream]);

  const [snapshot, setSnapshot] = useState<MicTestClipSnapshot>(INITIAL_SNAPSHOT);
  const [clip] = useState(() => new MicTestClip({ onChange: setSnapshot }));

  useEffect(() => {
    ensureStreamRef.current = ensureStream;
    clip.setEnsureStream(() => ensureStreamRef.current());
  }, [clip, ensureStream]);

  useEffect(() => () => clip.discard(), [clip]);

  const start = useCallback(() => clip.start(), [clip]);
  const stopRecording = useCallback(() => clip.stopRecording(), [clip]);
  const togglePlayback = useCallback(() => clip.togglePlayback(), [clip]);
  const discard = useCallback(() => clip.discard(), [clip]);

  return { snapshot, start, stopRecording, togglePlayback, discard };
}
