# ADR 0033: Generic vocabulary and identifiers

Date: 3 November 2026. Status: accepted; Phase 1 (user-visible wording) implemented, later phases pending.

## Context

The product began for one church and its sermons, so "sermon", "church" and the event sense of "service" reached the operator copy, the model prompts and some identifiers. Caption Studio is meant for any organization. Its copy, its model-facing text and its internal names should describe a captioned event and its saved record without assuming a religious or organizational setting.

## Decision

### Vocabulary

- **Session**: one live captioned event, from start to end. It replaces the event sense of "service". The backend sense of "service" stays: "caption service", "AI service", "translation service", "service unavailable" and HTTP service terms describe infrastructure, not an event.
- **Speaker**: the person talking.
- **Audience**: the people who watch the public captions or the shared reader and viewer links ("congregation" is replaced).
- **Attendees**: the people physically present in the room.
- **Transcripts**: the saved record of a session, with its summary and reader passages.
- "Translation session" keeps its existing meaning, the translation context of a live session, and is not renamed.

### Wording

- Operator copy, the Indonesian catalog, the ADR 0030 glossary row, the layout description and the exported file names follow this vocabulary. The Indonesian drafts use "sesi" for session, "audiens" for audience and "hadirin" for attendees; "layanan" stays only where it names the backend.
- The neutral wording is the general base. A later per-format preset layer may replace these phrases with terms of its own; preset ids are data values, not identifiers.
- The church-specific wording that this change replaces, in both languages, is listed in the pull request that introduced this ADR, so a preset can restore it.

### Identifiers and stored names

- Phase 1 changes no code identifiers, keys, routes, stored fields, wire fields, error codes or the Durable Object class. Those names are renamed in later phases, and each later phase appends a line below that records what changed.
- Old names stay readable and accepted after any rename. Old stored data and saved links keep working without a later phase.
- The counters disclosure label `live.serviceDetails` now reads "Technical details". When its key is renamed, the new key must not reuse `live.sessionDetails`, which names the session metadata card in the same panel.

## Tradeoffs and verification

- Assumption: "session" reads clearly in both its event sense and the existing "translation session" sense, because the context is different in each place. Flagged for review.
- The Indonesian terms "sesi", "audiens" and "hadirin" need native-speaker review. The review is a follow-up, not a merge requirement.
- The catalogs are checked by `src/i18n/i18n.test.ts`: no English value uses "service" in the event sense or "congregation", and the Indonesian catalog keeps "layanan" only for the backend keys.

## Phases

- Phase 5, Durable Object class and binding: `SermonJournal` became `TranscriptJournal` (`src/experience/transcript-journal.ts`), bound as `TRANSCRIPT_JOURNALS`, through a `v4` `renamed_classes` migration; `v1` to `v3` are unchanged. Docs check, Cloudflare's [Durable Objects migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/) reference: a rename "moves stored data from one class to another within the same Worker"; the rename "involves two updates that are not perfectly atomic at the runtime layer"; lifecycle changes "cannot be rolled out gradually". The page does not say `renamed_classes` is unsupported for `new_sqlite_classes`, so the rename stays on the `migrations` array (assumption, flagged in the pull request). The newer exports reference was not retrievable at the check, so it was not used. The rename is one-way: a build from before it cannot bind the renamed class, so it is deployed alone and rollback is not supported (`docs/DEPLOYMENT.md`).
- Phase 4, stored and wire names: the room configuration, usage records and the client-facing ids and error codes use sessionId, sessionEventCount, sessionCode and sessions; the earlier names are read on input and still sent in responses for pages loaded before the deploy. Routes, the ended headers and the WebSocket subprotocols (`caption-studio-v1` and `caption-studio-viewer-v1`) have the earlier names as aliases. Deploy rules and the rollback limit are in the deployment doc.
- Phase 3, non-persisted identifiers: message keys, the Transcripts screen and `#transcripts` address (with `#sermons` kept as an alias), the panel and CSS names, the recognition-variants module, and the event-sense code symbols and unrendered strings use the neutral names; `startService` and `endService` became `startLiveSession` and `endLiveSession` because `startSession` already names the translation session start. The client-only `service` names (`LiveState.service`, locals, parameters and the panel prop) became `liveSession`; names tied to a response or stored field (`services`, `serviceId`, `serviceEventCount`) wait for the stored-and-wire phase. Nothing stored or on the wire changed.
- Phase 2, model-facing wording: the transcription prefix, the address-term guidance and both sanitization rules use audience and spoken-recording wording; the summary envelope is source-neutral and new summary jobs write `promptVersion` `source-grounded-v2`; the summary and synthesis task text says transcript.
- Phase 1, user-visible wording: this ADR, the English and Indonesian catalogs, the layout description, the transcript and summary export names, the ADR 0030 glossary row, the feature-request issue template, and the audience wording.
