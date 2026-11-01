/**
 * The MIME types the live capture tries, in order. Shared with the microphone test clip
 * so both use the same MediaRecorder configuration.
 */
const RECORDER_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

export function recorderOptions(): MediaRecorderOptions | undefined {
  const mimeType = RECORDER_TYPES.find((value) => MediaRecorder.isTypeSupported(value));
  return mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined;
}

export function recorderMimeType(recorder: { mimeType?: string } | null, chunks: Blob[]) {
  return recorder?.mimeType || chunks[0]?.type || "audio/webm";
}
