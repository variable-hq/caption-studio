# Roadmap

Status labels describe the current repository, not proof that a live church pilot has
passed.

## Phase 0: core decisions and safeguards — partly complete

Completed:

- confirmed Phase 1 languages and Chinese script behavior;
- selected cloud-first hosting and free-tier Groq models;
- required Cloudflare Access, server-side secrets, Groq ZDR, and no paid fallback; and
- separated ephemeral live captions from future archive/summary consent.

Still required:

- approve Bible versions, licensing, and terminology ownership;
- define acceptable latency, language quality, and failure thresholds;
- agree on source-caption fallback and manual-correction requirements; and
- define archive consent, retention, export, deletion, and transcript-form policy.

## Phase 1A: free cloud live prototype — implemented, validation pending

Implemented in the codebase:

- Next.js/OpenNext deployment on Cloudflare Workers;
- encrypted Groq secret and signed Cloudflare Access verification;
- selected microphone/audio-interface capture and four-second chunks;
- multilingual Whisper transcription and one-target Llama translation;
- bounded biblical/church hints, preferred terms, and public masking;
- source/public previews, status, latency, queue, session-time, and request indicators;
- expiring Durable Object sessions and a reconnecting, tokenized OBS overlay;
- 10–72px display controls, per-line highlight/transparency, alignment, and saved
  browser preferences; and
- no application audio or transcript storage.

Pending validation:

- full-service tests for every supported source/target language;
- approved biblical name, reference, accent, and mixed-language samples;
- latency, dropped chunks, provider quota, Worker CPU/request, and browser compatibility;
- device loss, internet loss, Access expiry, Groq `429`, timeout, and model outage;
- overlay reconnect, token expiry/revocation, and OBS production-machine behavior; and
- account-level confirmation that the pilot stays within both providers' Free plans.

Exit condition: representative approved tests meet the agreed accuracy, latency,
privacy, quota, and recovery thresholds in the deployed cloud environment.

## Current step: stabilization and OBS handoff

- Remove dead local-provider code and keep dependencies minimal.
- Enforce request bounds from actual body content.
- Reconcile README, architecture, product, roadmap, contribution, security, and ADRs
  with implemented behavior.
- Run tests, type checking, lint, production build, dependency audit, and diff checks.
- Produce a concise OBS operator runbook and validate the generated URL on the actual
  streaming computer with synthetic audio.
- Record remaining live-pilot risks and an operator fallback procedure.

Exit condition: the branch is reviewable, documentation matches the system, and an
operator can complete a synthetic OBS rehearsal without developer intervention.

## Phase 1B: reliability and optional provider upgrade

- Add deliberate source-caption fallback only after operator behavior is approved.
- Improve audio-device disconnect and browser lifecycle recovery.
- Add pause/clear and optional manual correction with clear sequence semantics.
- Decide whether true streaming is needed to reduce four-second chunk latency.
- Compare paid or realtime providers using the same approved recordings.
- Add account-aware usage monitoring and hard spending controls before enabling any
  paid path.

Exit condition: the owner has evidence-based reliability and provider decisions with
documented data handling, costs, limits, and outage behavior.

## Phase 2: church profiles and moderation

- Add authenticated workspaces and roles if server-side configuration is needed.
- Add persistent glossary management, phonetic variants, categories, and scoping.
- Add approved Bible-reference profiles with licence metadata.
- Expand moderation to replace/hide modes and reviewed rule scopes.
- Add correction/revision history without corrupting protected transcript forms.

Exit condition: authorized reviewers control terminology and moderation, and public
rules never leak or rewrite protected data unexpectedly.

## Phase 3: archive and summaries

- Implement explicit recording consent and retention controls.
- Store only authorized transcript forms with row-level access control.
- Generate transcript-grounded draft sermon summaries.
- Distinguish quotations, paraphrases, inferred references, and retrieved Bible text.
- Add human review, approval, export, deletion, and audit behavior.

Exit condition: an authorized reviewer can trace, correct, approve, export, and delete a
summary, and retention behavior matches the documented policy.

## Phase 4: controlled production pilot

- Complete privacy and threat-model reviews.
- Run duration, load, browser, device, language, and OBS compatibility tests.
- Add content-safe operational metrics and provider/account alerts.
- Verify backup and deletion only if persistent storage exists.
- Complete accessibility and operator usability reviews.
- Publish deployment, service, fallback, and incident runbooks.

Exit condition: the project owner approves a limited pilot with named operators,
approved test/service data, monitored limits, and a rollback plan.

## Later possibilities

- multiple simultaneous target languages;
- in-room display and mobile caption clients;
- speaker diarization;
- translation memory across approved church workspaces;
- human interpreter handoff;
- search across an approved sermon library;
- Cantonese as a distinct spoken input; and
- offline or managed-appliance continuity only if the cloud-first constraint changes.
