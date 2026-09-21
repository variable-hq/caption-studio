# ADR 0013: archive manual captions as separate operator notes, not transcript paragraphs

Date: 15 September 2026. Status: implemented, merged. Only prompt-free unit/integration
coverage is verified; see Tradeoffs below.

## Decision

While paused, an operator can show typed text (an announcement, a hymn line) to OBS and the latest viewer through a new `manual` control action, reusing the existing latest-caption broadcast and epoch-invalidation path `show-test` already relies on rather than adding a parallel one. A successful manual caption is also forwarded, best-effort, to the sermon journal as a new, independent kind of record: an operator note, distinct from the batched, moderation-reapplied translation paragraphs the reader and archive already show.

Two scope decisions were made deliberately narrow:

- Only `manual` captions are archived. `show-test`'s synthetic per-language
sample text is not, since it exists purely to verify OBS connectivity before a service starts and archiving it would inject placeholder text into a real sermon's historical record.
- Notes are stored and rendered as their own stream, shown alongside — not merged into the scrolling paragraph transcript. The reader page interleaves them by timestamp for display only; no shared identifier space exists between notes and paragraphs.

## Tradeoffs and verification

The existing reader paragraph id is a transcription-attempt number, capped at 900 for the life of a service, and the reader page sorts strictly by that id. A manual caption has no such number. Inventing one that both never collides with a real paragraph id and still sorts into true chronological position turns out to require moving real paragraphs off
transcription-attempt-based ids entirely — a materially larger, riskier change to
existing, tested, shipped batching logic for a feature expected to fire rarely per service. A separate small collection, keyed by its own counter and merged into view only by timestamp, avoids that risk entirely at the cost of exact interleaving: a note's position among paragraphs is approximate (by wall-clock time), not exact.

That approximation has one concrete failure mode: a paragraph's timestamp is taken when its batch commits (up to the ~30-second reader interval after the speech it contains), while a note's timestamp is taken immediately. Pausing and typing a note right after speech that hadn't yet been committed could otherwise show the note above words spoken before it. `/note` closes this specific gap by flushing any already-buffered, uncommitted reader text as its own fallback paragraph before taking the note's own timestamp, so nothing skips ahead of speech that happened first. Skew between unrelated, later paragraphs and
notes is unaffected and remains approximate by design.

An operator note collection has no natural ceiling the way a paragraph's transcription-attempt id does, so `/note` caps stored notes per service at `MAX_JOURNAL_NOTES` (50) and rejects further ones (surfacing `historyIncomplete`) rather than growing without bound or silently dropping notes past whatever a fixed read page size happened to return.

Manual captions bypass the deterministic public filter and glossary/terminology
correction, since they are already-reviewed operator text rather than transcribed
speech; the target language broadcast is always the session's active language
(`activeTranslationSettingsRef`), not an unapplied settings draft, so it cannot silently show as the wrong language if a language change is pending but not yet applied.

Archiving is best-effort and never blocks the live broadcast: a journal failure surfaces `historyIncomplete` the same way an interrupted paragraph append already does, rather than retrying inline or discarding the manual caption already shown to the audience.

An independent adversarial review of this branch (15 September 2026) found the manual control action's fields (`targetLanguage`, `style`, `manualText`) were never copied from the public request body into the internal Durable Object request by the Worker-level `controlChannel` gateway in `src/live/api.ts` — every manual caption would have failed in the deployed app despite passing every Durable-Object-level test, because those tests call the room directly and never exercise that gateway. Fixed, and `src/live/api.test.ts` now asserts the forwarded request body directly so this class of gap fails loudly again.

`src/live/caption-room.test.ts`, `src/live/api.test.ts` and `src/experience/experience.test.ts` cover this today: validation and boundary length, dedupe, ended-service rejection, the note cap, the pending-flush ordering guarantee, saved vs. ephemeral exposure, one end-to-end forwarding test through the real HTTP gateway, and confirmation that `show-test` never creates a note. Real-device rehearsal of the paused-announcement workflow, and confirmation
that operators find the separate notes list legible during a live service, remain open per this project's existing rehearsal gates.
