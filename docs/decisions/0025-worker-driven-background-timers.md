# ADR 0025: worker-driven timers keep live sessions running in background tabs

Date: 29 October 2026. Status: accepted, implemented in source.

## Decision

Recorder chunk boundaries, service expiry, and output-buffer dwell ticks use a dedicated
Web Worker as their clock. The worker owns only timer scheduling; microphone capture,
recording, and buffer state remain on the main thread. When workers are unavailable or
cannot be constructed, these timers fall back to browser timers.

Backgrounding or losing focus no longer pauses a session. Closing or navigating away still
pauses through `pagehide`. When a page returns from the back-forward cache, or a
page-hidden pause is followed by visibility restoration, the client reloads channel status
without automatically resuming capture. The unused native-shell lifecycle events were
removed along with the shell in ADR 0020.

This supersedes the sustained-background pause described in ADR 0016. A worker clock keeps
the existing wall-clock durations meaningful when main-thread timers are throttled, while
the fallback preserves operation in browsers that cannot construct a worker.

## Tradeoffs and verification

- `src/live/background-timer.ts` owns callback bookkeeping and exposes timeout and interval
  functions; `src/live/timer-worker.ts` schedules messages and contains no session state.
- The background timer registry is covered with injected tests for one-shot timeouts,
  repeating intervals, clearing, fallback behavior, and distinct ids. Browser worker
  delivery and sustained hidden-tab capture require manual verification with synthetic
  audio in Chrome and Safari, including a minimized tab and `pagehide` pause.
- Both `npm run build` and `npm run build:cloudflare` must bundle the worker. The operator
  page has no Content Security Policy of its own; no `worker-src` exception is expected.
