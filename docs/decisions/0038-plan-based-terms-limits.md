# ADR 0038: Plan-based Terms limits

Date: 7 November 2026. Status: accepted; it extends [ADR 0036](0036-custom-presets-and-plan-limits.md) with plan limits for saved Terms.

## Decision

- `WORKSPACE_PLAN` is the source of Terms limits, like custom preset limits. The default (unset or unrecognized plan) permits 40 names-and-terms entries and 40 hidden-term entries; `free` permits 10 of each and does not include list import. The editor will expose those limits in a separate phase.
- The preferences Durable Object enforces saved `translationDefaults` on both personal preferences and the shared workspace setup. Each list may remain above its current cap when unchanged or reduced, but may not grow beyond the cap. A refused patch writes no fields.
- The server counts entries using the same comma and newline separators as the caption pipeline. It retains stored values unchanged; the existing pipeline ceiling remains 40.
- The Worker supplies the cap through an internal `termsMax` query parameter and exposes the current limits through an Access-protected read-only route. Neither the cap nor the plan is accepted from client input.
- Missing or invalid internal limits and exceptions in the limit check fail open. A check defect can allow an over-limit save, but cannot block preference saving. The Worker always sends a validated cap.

## Tradeoffs and verification

- Existing deployments and records retain today's behavior by default, with no migration or new stored fields. A later plan reduction does not delete terms; it prevents adding until each list is reduced below its cap.
- The operator editor is a separate change. Until it lands, a refused save is handled by the existing save error path.
- Verify plan lookup, counting, normalized and atomic Durable Object writes, concurrent saves, fail-open behavior, route authorization and plan pass-through with synthetic tests; run `npm run validate` and `npm run qa:runtime`.
