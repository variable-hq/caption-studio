# ADR 0016: client-side output buffer, on/off, with a hidden backing queue and a Beta continuity review call

27 September 2026. Status: accepted, implemented in source.

## Context

Every previous merge published a translated caption to the Main room the moment
moderation finished; there was no way for an operator to catch a bad transcription or
translation before the audience saw it. A staging queue between translation and
publication was requested: upcoming captions held briefly, pausable, editable,
clearable, or fast-forwardable, plus an optional model call to smooth continuity between
queued captions and the caption already on Live.

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
  holds each caption for one fixed 2-second dwell (`OUTPUT_BUFFER_DWELL_MS`) before it
  advances to Live; there is no separate configurable delay. Pause already gives the
  operator an on-demand, unbounded hold on any one caption, so a passive, pre-configured
  delay would only add a setting without adding capability.
- **Backing capacity decouples from visibility.** An enabled buffer holds up to
  `OUTPUT_BUFFER_BACKING_CAPACITY` (4) entries internally, but only the front (next-up)
  entry is ever rendered or individually controllable (`OutputBufferPanel.tsx`). This is
  what actually bounds leakage: a paused or in-edit front caption has three slots of
  headroom behind it before an arriving translation is dropped, instead of effectively
  zero. `enqueueTranslation`'s capacity parameter is a plain number, independent of the
  operator-facing on/off setting, so the same force-advance/leakage logic serves both.
  Regardless of capacity, a completely full queue force-advances its front entry to admit
  a new translation unless that entry is paused, in which case the arriving translation is
  dropped (leakage) rather than growing the queue without bound.
- **Editing and Beta review share one pause mechanism.** An edited entry auto-pauses only
  once it reaches the front, and auto-resumes on Submit. A Beta "review buffer" call pauses
  the whole backlog — including entries not yet visible — for the call's duration and
  releases it afterward, independent of any entry separately paused by hand; this does not
  remove the leakage risk during a review call, but the larger backing capacity makes
  "completely full" a rarer state to be in when a review starts.
- **Beta review is scoped, not a general revision loop.** A single, immutable,
  non-operator-editable prompt (`src/ai/buffer-review-prompt.ts`) may revise the *queued*
  entries' already-translated text — the whole backlog, including hidden entries, since
  the operator may want continuity across everything queued even though only one caption
  is shown at a time — for continuity with the current Live caption; it never retranslates
  from source and never touches Live. It is a new inference stage (`"buffer-review"`)
  admitted through the existing `meteredGroq` usage-ledger path, but bounded independently
  of the 900-request transcription ceiling: it is operator-triggered on demand, not one
  call per audio chunk, so `CaptionRoom` gates it with its own `bufferReviewRequests`
  counter capped at `MAX_BUFFER_REVIEW_REQUESTS` (30) per service, reset only when a
  service (re)starts. `MAX_BUFFER_REVIEW_ENTRIES` (4) matches the backing capacity, with
  matching completion-token and request-byte budgets. Revised text is re-run through the
  same glossary/moderation pipeline as any other public caption before it replaces an
  entry's text, and an entry the operator is actively hand-editing is never overwritten by
  a review result.
- The tooltip states outright that a full, paused/edited buffer drops further captions,
  rather than leaving that as an implementation detail an operator could discover only by
  losing content.

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
- A visible `entries/OUTPUT_BUFFER_BACKING_CAPACITY` counter and an explicit "buffer full"
  warning (shown only when the backlog is at capacity *and* the next-up caption is held)
  make the leakage risk observable rather than something an operator could discover only
  by losing content.
- `src/live/output-buffer.ts` is pure and covered by `output-buffer.test.ts`
  (enqueue/tick/pause/edit/clear/fast-forward/review transitions, including draining down
  to a shrunk capacity and headroom before leakage); `caption-room.test.ts` covers the new
  `bufferReviewRequests` admission, ceiling and controller/pause checks. Real Beta-review
  model output quality is unverified — the ADR 0011/PRODUCT_SPEC caveat that prompting does
  not establish semantic faithfulness applies here identically.
