# ADR 0003: defer Apple distribution

Date: 10 August 2026. Status: accepted for the current phase.

## Context

The Caption Studio product already runs as a protected browser application backed
by Cloudflare and Groq. A native iPhone/iPad feasibility shell was explored, but signing
and TestFlight distribution require paid Apple Developer Program participation plus a
separate privacy, device-testing, and release workflow.

The current priority is improving and validating the application itself without adding
that cost or parallel release surface.

## Decision

- The browser/Cloudflare application is the only active client and release path.
- App Store Connect, TestFlight, signing, provisioning, and Apple release work stop.
- The existing `ios/` experiment is retained as reversible research rather than deleted.
- Native build or test results do not block web application validation, deployment, or
  stakeholder testing.
- Reopening native distribution requires a new owner decision that explicitly accepts
  its cost, privacy, signing, device-test, and operational requirements.

## Consequences

- Product work returns to transcription and translation reliability, operator UX,
  Cloudflare deployment evidence, OBS integration, and controlled stakeholder testing.
- The repository keeps some inactive native files and scripts; they must not be mistaken
  for a current release target.
- No Apple signing credential, provisioning profile, paid membership, App Store record,
  or TestFlight group is required for the current phase.
