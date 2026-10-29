# ADR 0017: configurable output buffer dwell duration

Date: 30 September 2026. Status: accepted; amended by
[ADR 0022](0022-shared-church-setup-and-words-list.md), which presents On/Off and the
dwell as one choice (Off, or Wait 1–5 seconds) stored the same way.

## Decision

[ADR 0016](0016-client-side-output-buffer.md) shipped the output buffer with one fixed
3-second dwell, deciding against a configurable delay because Pause already gives the
operator an on-demand, unbounded hold on any one caption — a passive, pre-configured
delay looked like it would only add a setting without adding capability.

In practice, operators calibrating the buffer for a specific service (a slower or
faster speaker, a language pair with more or less translation lag) wanted to tune how
much of a head start they get before a caption auto-advances, without having to reach
for manual Pause on every single caption to get equivalent breathing room. That is a
real difference in capability, not just a cosmetic setting: a longer default dwell
gives the operator more of a passive window to read and react before deciding whether
to intervene at all.

This reverses that specific point of ADR 0016 while keeping everything else in it
unchanged (client-side state, On/Off default Off, the decoupled backing capacity,
front-only editing auto-pause). The dwell is now one of five fixed options —
`OUTPUT_BUFFER_DWELL_OPTIONS_MS` (1/2/3/4/5 seconds), default 3s — surfaced as a
`<select>` in `OutputBufferPanel.tsx` only when the buffer is On, and saved to
`OperatorPreferences.outputBufferDwellMs` through the same **Save as my default** action
already used for the On/Off setting.

An open-ended numeric input or an "Auto" mode (both considered in the design ADR 0016
describes) were not revisited: a bounded set of options keeps the value always valid
without extra clamping logic, and matches how the recording window
(`RecordingWindowMs`) already presents its own fixed choices rather than free entry.

## Tradeoffs and verification

- `src/live/output-buffer.ts`'s queue functions (`enqueueTranslation`, `tick`,
  `setManualPause`, `clearEntry`, `fastForwardEntry`, `beginEdit`, `cancelEdit`,
  `submitEdit`) now take an optional `dwellMs` parameter defaulting to
  `DEFAULT_OUTPUT_BUFFER_DWELL_MS`, so existing callers and tests that don't care about
  a non-default dwell are unaffected.
- `use-live-caption-session.ts` passes the operator's chosen `outputBufferDwellMs` from
  session settings at every one of those call sites; changing it does not require the
  translation-refresh gate, for the same reason the On/Off setting doesn't — it's
  client-side pacing before an already-produced translation reaches Live, not a change
  to the model call.
- `output-buffer.test.ts`'s no-compounding-lag regression test is parametrized over
  `OUTPUT_BUFFER_DWELL_OPTIONS_MS`, confirming the property holds at every dwell option
  (1-5s), not just the 3-second default; the rest of the suite's fixed-dwell tests are
  unchanged, since a caller that omits `dwellMs` still gets the same 3-second default
  ADR 0016 shipped.

## Amendment (29 October 2026)

The dwell clock now starts when an entry becomes the visible, controllable front of the
queue, rather than when it is enqueued. The previous enqueue-time clock let a hidden entry
spend most or all of its dwell behind a slower front, then release about one tick after it
became visible. Queue bursts therefore violated the operator-facing promise that each
caption waits next-up for its selected dwell.

`dueAt` is non-null only for an unpaused front entry. Later entries start a full dwell as
they move to the front; pause/resume retains the front's remaining dwell. This intentionally
adds one dwell per queued caption during a burst, bounded by the four-entry capacity. The
steady state is unchanged when recording windows are at least six seconds and dwell is at
most five seconds. Buffer Off, Fast-forward, full-queue force-advance, and capacity-shrink
flush retain their explicit early-release behavior.
