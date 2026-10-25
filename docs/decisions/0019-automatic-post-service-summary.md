# ADR 0019: automatic post-service summary and history-saving default

Date: 25 October 2026. Status: accepted, implemented in source.

## Decision

Operators asked for a summary to be ready without returning to press Generate summary
after the service, and for transcript saving not to depend on remembering a checkbox.

- **History-saving default.** `OperatorPreferences.saveHistoryDefault` pre-ticks *Save
  transcript history* at Start. It is per operator, saved only through an explicit *Make
  this my default* action, and the checkbox stays visible and changeable before Start.
  Consent remains the explicit, immutable pre-Start choice ADR 0011 requires; saving
  still cannot be enabled after Start.
- **Automatic summary opt-in.** `OperatorPreferences.autoSummary` (default off) asks for
  a summary draft after each saved service *that operator* ends, using their saved
  summary defaults.
- **Flow.** The room's End reports the ended service ID and saving flag to the Worker
  (internal headers, stripped before the browser response). If the operator opted in,
  optional Workers AI is enabled and saving was on, the Worker posts an
  `/auto-summary` request to the journal. The journal holds it until its own End sync
  arrives, then queues an ordinary summary job marked `automatic`, unless a summary
  already exists. A failure to queue never fails End.
- The draft appears in Sermon history like a manual one and still requires review before
  export. Delivery outside the app (email) was considered and deferred.

## Tradeoffs and verification

- An automatic run uses the existing Workers AI ledger and per-service caps, so it can
  use the day's summary budget like a manual one. Keeping it opt-in per operator stops
  every End from spending it.
- The summary uses the defaults saved to the account, not unsaved edits on the page.
- Covered by journal tests (deferred until End, existing summary kept, unsaved and
  malformed requests), queueing tests (opt-in, AI switch, saved defaults), the room's End
  hint, and preference normalization. Not yet verified on the deployed Worker.
