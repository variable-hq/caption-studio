# Roadmap

## Phase 0: product decisions and safeguards

- Record the confirmed source and target languages and Chinese script behavior.
- Confirm Bible versions, licensing, and theological-profile ownership.
- Define consent, retention, export, deletion, and archive-filter policy.
- Agree on latency, quota, scale, and manual-correction requirements.
- Record decisions in issues, ADRs, and pull requests.

Exit condition: no unresolved decision can materially change the pilot architecture.

## Phase 1A: free cloud technical prototype

- Host the Next.js app and server API on Cloudflare Workers Free.
- Keep the Groq key in an encrypted Worker secret.
- Protect the Worker with Cloudflare Access and verify its JWT in inference routes.
- Enable Groq Zero Data Retention before approved sermon testing.
- Capture a selected browser microphone or audio-interface input.
- Send four-second audio chunks to Groq `whisper-large-v3-turbo`.
- Translate one selected target with Groq `llama-3.1-8b-instant`.
- Accept English, Indonesian, Japanese, Korean, Tagalog, Chinese, or Vietnamese audio.
- Offer explicit source selection plus automatic detection; prefer explicit selection live.
- Render Chinese output as Simplified or Traditional while treating spoken Mandarin as Chinese.
- Apply approved biblical names, church terms, keyword hints, and preferred translations.
- Apply public filtering after translation without changing protected source text.
- Surface latency, quota use, `Retry-After`, and internet failures to the operator.
- Do not store audio or sermon content during the inference prototype.
- Test every language with synthetic or explicitly approved recordings.

Exit condition: representative approved recordings meet agreed language, biblical-term,
latency, quota, and reliability thresholds in the deployed cloud environment.

## Phase 1B: optional paid or realtime upgrade

- Compare the free prototype with paid transcription and translation providers.
- Prioritize true streaming if four-second chunk latency is unacceptable.
- Upgrade only where quality, limits, latency, or support justify cost.
- Keep the existing provider contracts and deterministic glossary/moderation pipeline.
- Add per-session cost estimates, a hard spending cap, and clean fallback behavior.

Exit condition: the owner has an evidence-based provider choice with documented limits,
hourly cost, data handling, and outage behavior.

## Phase 2: live captions and OBS

- Build authenticated operator sessions.
- Build the read-only OBS overlay.
- Create a narrowly scoped public Access path only after overlay-token validation exists.
- Add display controls and reusable display profiles.
- Add reconnect, ordering, deduplication, and failure states.
- Add source-caption fallback when translation is unavailable.

Exit condition: an operator can run a test service and recover safely from common audio,
network, provider, and overlay failures.

## Phase 3: church context and moderation

- Build workspace glossary and keyword management.
- Add approved Bible-reference profiles.
- Add public-display moderation rules.
- Add live manual correction and revision history.
- Evaluate mixed-language and biblical terminology accuracy.

Exit condition: approved terms are handled consistently and moderation does not corrupt
the protected transcript.

## Phase 4: archive and summaries

- Add explicit recording and retention controls.
- Store authorized transcript forms with row-level security.
- Generate grounded draft sermon summaries.
- Add reviewer approval, export, and deletion.
- Add uncertainty and citation checks for scripture references.

Exit condition: authorized users can review a traceable summary, and retention and
deletion behave as documented.

## Phase 5: production readiness

- Threat model and privacy review
- Load, duration, browser, and audio-device testing
- Monitoring, audit, usage, cost, and quota controls
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
- Offline or managed-appliance continuity only if the project owner later requests it
