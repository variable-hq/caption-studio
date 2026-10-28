# ADR 0024: record-only session metadata

Date: 28 October 2026. Status: Accepted and implemented; adds optional details to saved service archives.

## Decision

- Store optional Topic (120 characters), Speaker (120), Description (1,000), and session date/time as epoch milliseconds in a separate `metadata` key in the service's Sermon journal. Normalize and bound input on both client and server. The date/time is prefilled before Start; if untouched, store the service's `startedAt`.
- Metadata is available only when transcript history is saved. Any signed-in workspace operator may edit it under the existing Access boundary while the archive exists. It follows the archive's seven-day retention, does not extend it, and is erased with it.
- Metadata is record-keeping only. It is deliberately excluded from translation and summary prompts so operator descriptions cannot alter public captions or summary generation. Topic is the archive list label; there is no separate title or scripture-reference field.

## Tradeoffs and verification

- Saved-only details inherit the archive's established workspace access and deletion lifecycle without creating another retention class. With history saving off, the form explains why it is unavailable.
- A separate storage key keeps metadata out of journal sync snapshots and summary/source state. The archive endpoint returns it for display; the metadata write never modifies service expiry.
- Tests cover normalization, saved-history authorization, archive inclusion, deletion and expiry. Synthetic metadata only; no sermon text is used in fixtures.
