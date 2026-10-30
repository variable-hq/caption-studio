# ADR 0026: pause-driven recording windows

Date: 29 October 2026. Status: accepted, implemented in source.

## Decision

The operator chooses a fixed 6, 10, or 14-second recording window, or Dynamic (the
default). Dynamic uses the browser's raw microphone RMS level: after at least 6 seconds it
cuts at the first pause of about 700ms of silence, and forces a cut at 14 seconds. A pure
policy module uses a slowly decaying speech peak to adapt its silence threshold. It makes
no model call and does not change the transcription or translation contract.

The existing `recordingWindowMs` field remains in church defaults and service snapshots.
Stored values migrate as follows: 6s stays 6s; 9s becomes 10s; 12s, 15s and 18s become
14s. Missing or invalid values become Dynamic. The minimum remains 6s, so the 90-minute
service ceiling stays at 900 transcription attempts regardless of the selected option.

Dynamic ends at the first qualifying pause after 6 seconds, or at 14 seconds. With Live
drafts enabled and admitted, a draft of the audio at the pause candidate confirms an early
cut only when its source text ends in terminal punctuation (`.`, `?`, `!`, `…`, `。`, `？`,
`！`), optionally followed by closing quotes or brackets. An unfinished clause keeps
recording for another pause. When drafts are off or unavailable, the pause-only behavior
applies. No extra language-model call is introduced.

## Tradeoffs and verification

- `src/live/window-policy.ts` owns the pause thresholds and state transitions, making
  minimum, pause, hard-limit, quiet-speaker adaptation and per-window reset behavior
  deterministic to test.
- Fixed windows keep their one hard timer. Dynamic uses the worker clock to sample the
  existing microphone analyser every 100ms and also keeps a 14-second hard timer, so a
  missed sample cannot extend the window.
- Fixed-window draft offsets stay unchanged. Dynamic drafts run at pause candidates, use
  the same admission rules and cap of two per caption, and cannot delay the 14-second cut.
- The thresholds are starting values and require manual tuning with synthetic speech and
  pauses. Verify fixed and Dynamic timing, the continuous-speech hard cut, and saved legacy
  values in a live browser session before release.
