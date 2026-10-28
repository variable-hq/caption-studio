# ADR 0016: client-side output buffer with a hidden backing queue

27 September 2026. Status: accepted, implemented in source; extended by [ADR 0023](0023-live-note-and-recent-outputs.md) for same-tab live note and recent-output state.

## Context

Every previous merge published a translated caption to the Main room the moment
moderation finished; there was no way for an operator to catch a bad transcription or
translation before the audience saw it. A staging queue between translation and
publication was requested: upcoming captions held briefly, pausable, editable,
clearable, or fast-forwardable.

Two names collided during design: the feature request called this new delay queue a
"buffer", and this repository already uses "buffer" for the existing 6/9/12/15/18-second
audio recording window (`RecordingWindowMs` in `src/live/contracts.ts`). Both names were
individually accurate, but an operator picking between two same-named "buffer" durations
in the same Translation-adjacent UI would be confused regardless. Rather than overload the
new feature onto the ambiguous name, the audio-window setting was renamed to "recording
window" throughout code, tests and the maintained docs so the two concepts stay
unambiguous next to each other; the new feature took "output buffer".

An early design exposed the queue depth directly as an operator-facing count (0/1/2
slots) with a separate configurable dwell delay (Auto or a fixed 2/4/6s). Working through
that design surfaced two problems before it shipped: defaulting the buffer on would add
latency to every service for a benefit — catching a bad *translation* — most operators
can't judge without knowing the target language; and a 1–2 slot queue is exhausted almost
immediately, so pausing or editing one caption while speech continues would drop the next
one (leakage) far sooner than an operator would expect. The design below is the one that
shipped, addressing both directly.

A separate, on-demand "Beta" model call that revised queued captions for continuity was
designed, implemented, and then removed before merge: it had no access to the source text
or the approved-terms glossary, so it could not reliably fix the specific recurring
mistranslation that would actually cause an operator to reach for it; it revised the
whole backlog indiscriminately rather than the one caption that needed a fix; and nothing
required the operator to review its output before the queue's pause released and it
resumed flowing to Live. A proactive alternative — feeding operator-supplied context into
the *live* translation call itself, so future captions self-correct instead of patching
already-translated ones after the fact — was judged more promising and is tracked as a
separate idea, not part of this feature.

## Decision

- **State lives client-side, in the controlling operator's tab.** The room
  (`CaptionRoom`) stays the authoritative source for published public state — sequence
  numbers, translation revisions, Clear epochs — because that state must survive reload
  and be visible to a second workspace operator. The output buffer is pre-publish
  staging: only the *result* of draining it (a call to the existing
  `POST /api/live/channel/caption`) is public. Holding it client-side, in
  `src/live/output-buffer.ts` and `src/live/use-live-caption-session.ts`, matches how
  translation drafts and the active recording-window setting already work, and avoids a
  new Durable Object protocol, new WebSocket fields, and new per-slot API endpoints for
  content nothing but the controlling tab ever needs to see or drive. The cost is that the
  queue does not survive reload or takeover; both already clear it explicitly, consistent
  with how they already discard in-flight translation state.
- **On/Off, default Off.** Off matches behavior before this feature existed exactly. On
  holds each caption for a fixed dwell before it advances to Live. **Superseded by
  [ADR 0017](0017-configurable-output-buffer-dwell.md):** the dwell was originally a
  single fixed 3-second value with no configurable delay, on the reasoning that Pause
  already gives the operator an on-demand, unbounded hold on any one caption; ADR 0017
  makes the dwell a configurable, saved-default setting instead.
- **Backing capacity decouples from visibility.** An enabled buffer holds up to
  `OUTPUT_BUFFER_BACKING_CAPACITY` (4) entries internally, but only the front (next-up)
  entry is ever rendered or individually controllable (`OutputBufferPanel.tsx`). This is
  what actually bounds leakage: a paused or in-edit front caption has three slots of
  headroom behind it before an arriving translation is dropped, instead of effectively
  zero. `enqueueTranslation`'s capacity parameter is a plain number, independent of the
  operator-facing on/off setting, so the same force-advance/leakage logic serves both.
  Regardless of capacity, a completely full queue force-advances its front entry to admit
  a new translation unless that entry is paused, in which case the arriving translation is
  dropped (leakage) rather than growing the queue without bound. `enqueueTranslation`
  treats a non-positive capacity as an unconditional drop rather than assuming a caller
  never passes one, since its capacity parameter is a plain number decoupled from the
  on/off setting.
- **Editing auto-pauses only at the front.** An edited entry auto-pauses once it reaches
  the front of the queue, and auto-resumes on Submit — the operator can start editing an
  entry earlier, but nothing blocks it from advancing until it's actually next in line.
- Turning the buffer off or shrinking it discards any unsubmitted edit draft on a flushed
  entry — the flush publishes each entry's committed `publicText`, never `editedDraft`.
- A visible `entries/OUTPUT_BUFFER_BACKING_CAPACITY` counter and an explicit "buffer full"
  warning (shown only when the backlog is at capacity *and* the next-up caption is held)
  make the leakage risk observable rather than something an operator could discover only
  by losing content. The tooltip states the same tradeoff outright.

## Tradeoffs and verification

- The queue is not persisted or synced to a second operator; only the controlling tab can
  see or steer buffered content, matching every other draft/translation-session behavior
  in this codebase. A future decision could move it server-side if multi-operator
  visibility into pre-publish staging is ever required — that would need new room state,
  protocol and API surface, deliberately deferred here.
- The on/off choice applies live, without the translation-refresh gate that
  language/terminology/filter/recording-window/prompt changes require, because it does not
  affect the model call — only client-side pacing before an already-produced translation
  reaches Live. It is saved to `OperatorPreferences` through the same **Save as my
  default** action used elsewhere, independent of the translation-refresh cycle.
- `src/live/output-buffer.ts` is pure and covered by `output-buffer.test.ts`
  (enqueue/tick/pause/edit/clear/fast-forward transitions, including draining down to a
  shrunk capacity, headroom before leakage, and a steady-arrivals simulation confirming the
  dwell does not compound into growing lag).
- Both the buffer's tick and the recorder's own chunk-boundary timer depend on browser
  timers, which a backgrounded tab throttles unpredictably. Rather than add buffer-specific
  timer workarounds, the operator tab treats sustained backgrounding (10+ seconds) the same
  as `pagehide`: an explicit Pause with a clear message, which already discards the buffer
  along with capture. This closes a pre-existing gap in the capture pipeline more than it
  patches the buffer specifically — plain tab-switching was not covered by the existing
  `pagehide`/native-background handling at all — and it also fixes a related inconsistency
  where that existing lifecycle-pause path did not discard the buffer like every other
  pause path already did.
