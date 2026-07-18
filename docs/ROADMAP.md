# Roadmap

## Phase 0: product decisions and safeguards

- Resolve the decisions listed in the product specification.
- Record the confirmed source and target languages and Chinese script behavior.
- Confirm Bible versions, licensing, and theological-profile ownership.
- Define consent, retention, export, deletion, and archive-filter policy.
- Agree on latency, cost, scale, and manual-correction requirements.
- Record decisions in issues and pull requests.

Exit condition: the MVP acceptance criteria are approved and no unresolved decision can materially change the architecture.

## Phase 1A: free/local-first technical prototype

- Scaffold the operator web app, local AI companion contract, and automated checks.
- Capture a selected browser microphone or audio-interface input.
- Run multilingual Whisper through `whisper.cpp`, starting with the `small` model.
- Run MADLAD-400-3B-MT for one selected translation target per session.
- Accept English, Indonesian, Japanese, Korean, Tagalog, Chinese, or Vietnamese audio.
- Offer explicit source selection plus automatic detection; prefer explicit selection in production.
- Render Chinese output as Simplified or Traditional while treating spoken Mandarin as Chinese.
- Apply approved biblical names, church terminology, keyword hints, and preferred translations.
- Apply public word filtering after translation without changing the protected source text.
- Measure end-to-end latency, accuracy, memory use, stability, and effective operating cost.
- Do not store sermon content beyond what the prototype test explicitly requires.

Exit condition: representative sermon recordings pass the agreed language, biblical-term,
latency, and reliability thresholds on the church's actual operator computer.

## Phase 1B: optional paid-model upgrade

- Add paid transcription and translation adapters behind the existing provider interfaces.
- Evaluate paid providers against the Phase 1A recordings and metrics.
- Upgrade only where quality, latency, hardware limitations, or support needs justify the cost.
- Keep local Whisper as an offline or provider-outage fallback.
- Add usage limits, visible estimates, and a clean fallback when a paid quota is reached.

Exit condition: the owner has an evidence-based local, paid, or hybrid provider choice
with a documented hourly cost and fallback behavior.

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
- Cantonese as a distinct spoken Chinese input
- Multiple local-worker computers or managed church appliances
