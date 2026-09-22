# ADR 0015: the workspace is named BEST Church workspace and sized for its operators

22 September 2026. Status: accepted, implemented in source.

## Context

One Cloudflare Access tenant has always been one workspace: every signed-in operator
shares the Main channel, the usage ledger and, per
[ADR 0011](0011-service-history-and-optional-inference.md), every saved transcript and
sermon archive. The operator UI never said so. The sidebar read "Operator workspace" and
"Private workspace", the breadcrumb read "Workspace", and the Sermon history copy called
archives "private" — wording that an operator can reasonably read as "private to me",
which is the opposite of how the archive behaves.

The room also capped watcher and paired-phone credentials at 8 Access identities per
service while accepting 32 watcher sockets. The ninth identity silently evicted the
oldest: that operator kept its open socket but failed authorization on the next reconnect,
with no error explaining why. A church team larger than eight could not all follow one
service.

## Decision

- Name the workspace once, in `WORKSPACE_NAME` (`src/domain/workspace.ts`), and render it
  in the sidebar brand, the sidebar landmark label, the sidebar footer, the dashboard
  breadcrumb and the transcript-saving copy. The name is a source constant, not
  deployment configuration: this repository serves one church, and the Access audience and
  team domain already carry the machine-readable tenant identity.
- State the sharing rule where the operator acts on it. The Sermon history page and the
  transcript-saving consent both say that every signed-in operator of the workspace sees
  the saved transcript, and that the audience never does.
- Raise `MAX_SERVICE_OBSERVERS` from 8 to 32, so the identity cap matches the 32 watcher
  sockets the room already accepts. Eviction order is unchanged: the oldest identity is
  dropped first, and re-registering moves an identity to the end of the queue.
- Leave `/operator/mobile` scoped to Pause, Resume and Clear. The phone is a live remote;
  saved sermons are reviewed on the dashboard, which any operator may open on any device.

## Tradeoffs and verification

Naming in source means another church cannot rebrand by changing an environment variable;
that is accepted while this deployment serves one tenant, and the constant is the single
place a future change would touch. Raising the cap to 32 grows per-service Durable Object
state by at most 24 further identity/hash pairs, which is bounded and far below the
storage the caption history already uses; the socket ceiling, not the identity map, now
limits a service first.

`src/experience/workspace-archive.test.ts` proves the sharing rule end to end: a second
Access identity reads, corrects and deletes an archive a different identity produced,
lists saved sermons with no service of its own, and an unauthenticated request is still
refused. `src/live/caption-room.test.ts` asserts the eviction behaviour against
`MAX_SERVICE_OBSERVERS` rather than a literal 8. `npm run validate` covers the rest.
