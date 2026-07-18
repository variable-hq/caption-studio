# Roadmap

## Phase 0: product decisions and safeguards

- Resolve the decisions listed in the product specification.
- Confirm source and target languages, including Chinese script.
- Confirm Bible versions, licensing, and theological-profile ownership.
- Define consent, retention, export, deletion, and archive-filter policy.
- Agree on latency, cost, scale, and manual-correction requirements.
- Record decisions in issues and pull requests.

Exit condition: the MVP acceptance criteria are approved and no unresolved decision can materially change the architecture.

## Phase 1: technical prototype

- Scaffold the web app and automated checks.
- Capture selected browser audio input.
- Test live transcription and translation with representative church audio.
- Prototype glossary hints for biblical names and local church terms.
- Measure latency, quality, and cost.
- Do not store sermon content beyond what the prototype test explicitly requires.

Exit condition: the team has evidence that the chosen approach can meet the agreed quality, latency, and cost targets.

## Phase 2: live captions and OBS

- Build authenticated operator sessions.
- Build the read-only OBS overlay.
- Add display controls and reusable display profiles.
- Add reconnect, ordering, deduplication, and failure states.
- Add source-caption fallback when translation is unavailable.

Exit condition: an operator can run a test service and recover safely from common audio and network failures.

## Phase 3: church context and moderation

- Build workspace glossary and keyword management.
- Add approved Bible-reference profiles.
- Add public-display moderation rules.
- Add live manual correction and revision history.
- Evaluate mixed-language and biblical terminology accuracy.

Exit condition: approved terms are handled consistently and moderation does not corrupt the protected transcript.

## Phase 4: archive and summaries

- Add explicit recording and retention controls.
- Store authorized transcript forms with row-level security.
- Generate grounded draft sermon summaries.
- Add reviewer approval, export, and deletion.
- Add uncertainty and citation checks for scripture references.

Exit condition: authorized users can review a traceable summary, and retention and deletion behave as documented.

## Phase 5: production readiness

- Threat model and privacy review
- Load, duration, browser, and audio-device testing
- Monitoring, audit, usage, and cost controls
- Backup and deletion verification
- Accessibility review
- Deployment and incident runbooks

Exit condition: the project owner approves a controlled pilot with a rollback plan.

## Later possibilities

- Multiple simultaneous target languages
- In-room display and mobile caption clients
- Speaker diarization
- Translation memory shared across approved church workspaces
- Human interpreter handoff
- Search across an approved sermon library
- Optional local or hybrid processing for stricter privacy requirements
