# ADR 0016: client-side output buffer, and a Beta continuity review call

27 September 2026. Status: accepted, implemented in source.

## Context

Every previous merge published a translated caption to the Main room the moment
moderation finished; there was no way for an operator to catch a bad transcription or
translation before the audience saw it. A staging queue between translation and
publication was requested: a bounded number of upcoming captions held briefly, each
individually pausable, editable, clearable, or fast-forwardable, plus an optional model
call to smooth continuity across the queue and the caption already on Live.

Two names collided during design: the feature request called this new delay queue a
"buffer", and this repository already uses "buffer" for the existing 6/9/12/15/18-second
audio recording window (`RecordingWindowMs` in `src/live/contracts.ts`). Both names were
individually accurate, but an operator picking between two same-named "buffer" durations
in the same Translation-adjacent UI would be confused regardless. Rather than overload the
new feature onto the ambiguous name, the audio-window setting was renamed to "recording
window" throughout code, tests and the maintained docs so the two concepts stay
unambiguous next to each other; the new feature took "output buffer".

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
- **Queue semantics.** 0–2 slots (default 1). A fixed delay (2/4/6s) sets a uniform dwell
  per slot; Auto has no fixed dwell — the first item after a fresh/empty Live output still
  waits (2s by default, standing in for "the selected duration" the feature request
  described for that case) but every later item in a continuous run paces at a flat 2s
  regardless of mode, so captions do not fall increasingly far behind speech. Regardless of
  mode, if the queue is completely full and a new translation arrives, the front slot is
  force-advanced to make room unless it is paused, in which case the arriving translation
  is dropped (the requested "leakage" behavior) rather than growing the queue or silently
  discarding a *held* caption. An edited slot auto-pauses only once it reaches the front,
  and auto-resumes on Submit; the same hold-then-release applies queue-wide during a Beta
  review call, independent of any slot the operator has separately paused by hand.
- **Beta review is scoped, not a general revision loop.** A single, immutable,
  non-operator-editable prompt (`src/ai/buffer-review-prompt.ts`) may revise the *queued*
  entries' already-translated text for continuity with the current Live caption; it never
  retranslates from source and never touches Live. It is a new inference stage
  (`"buffer-review"`) admitted through the existing `meteredGroq` usage-ledger path, but
  bounded independently of the 900-request transcription ceiling: it is operator-triggered
  on demand, not one call per audio chunk, so `CaptionRoom` gates it with its own
  `bufferReviewRequests` counter capped at `MAX_BUFFER_REVIEW_REQUESTS` (30) per service,
  reset only when a service (re)starts. Revised text is re-run through the same
  glossary/moderation pipeline as any other public caption before it replaces a slot's
  text, and an entry the operator is actively hand-editing is never overwritten by a
  review result.

## Tradeoffs and verification

- The queue is not persisted or synced to a second operator; only the controlling tab can
  see or steer buffered content, matching every other draft/translation-session behavior
  in this codebase. A future decision could move it server-side if multi-operator
  visibility into pre-publish staging is ever required — that would need new room state,
  protocol and API surface, deliberately deferred here.
- Output buffer count/delay apply live, without the translation-refresh gate that
  language/terminology/filter/recording-window/prompt changes require, because they do not
  affect the model call — only client-side pacing before an already-produced translation
  reaches Live. They are not yet persisted to `OperatorPreferences`; an operator's chosen
  buffer count/delay reset to the default (1 slot, Auto) on next visit. This is a known,
  documented first-pass gap, not an oversight.
- `src/live/output-buffer.ts` is pure and covered by `output-buffer.test.ts`
  (enqueue/tick/pause/edit/clear/fast-forward/review transitions); `caption-room.test.ts`
  covers the new `bufferReviewRequests` admission, ceiling and controller/pause checks.
  Real Beta-review model output quality is unverified — the ADR 0011/PRODUCT_SPEC caveat
  that prompting does not establish semantic faithfulness applies here identically.
