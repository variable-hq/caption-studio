# Roadmap

Last reviewed 23 August 2026.

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

## Phase 1A: free cloud live prototype — implemented, controlled testing pending

Implemented in the codebase:

- Next.js/OpenNext Cloudflare Workers deployment configuration;
- encrypted Groq secret and signed Cloudflare Access verification;
- selected microphone/audio-interface capture and a locked 6-, 9-, or 12-second buffer;
- multilingual Whisper transcription and one-target GPT-OSS 20B translation using a
  fixed idiomatic, non-invention system prompt;
- bounded biblical/church hints, preferred terms, and public masking;
- source/public previews, status, latency, queue, service-time, and request indicators;
- one encrypted, reusable Main OBS channel with a reconnecting read-only overlay;
- one separately tokenized, replaceable mobile viewer link per active service, exposing
  only the current moderated translation and service status;
- 10–72px display controls, per-line highlight/transparency, alignment, and saved
  browser preferences, with continuous design-preview updates;
- 0–20% OBS safe margins plus Setup/Live layouts, pause/resume, clear, idle/paused test,
  confirmed End, explicit URL rotation, and confirmed takeover controls;
- a minimal monochrome operator theme with independently configurable OBS caption output;
- no application audio or transcript storage.

Pending validation:

- full-service tests for every supported source/target language;
- approved biblical name, reference, accent, and mixed-language samples;
- latency, dropped chunks, provider quota, Worker CPU/request, and browser compatibility;
- device loss, internet loss, Access expiry, Groq `429`, timeout, and model outage;
- GPT-OSS 20B output quality, all three buffer/latency tradeoffs, and the lower daily token
  allowance across every approved source/target pair;
- overlay reconnect, End-with-URL-retention, controller replacement, takeover, explicit
  link rotation, mobile-viewer late join/replacement/revocation, and OBS
  production-machine behavior; and
- account-level confirmation that the pilot stays within both providers' Free plans.

Exit condition: representative approved tests meet the agreed accuracy, latency,
privacy, quota, and recovery thresholds in the deployed cloud environment.

## Baseline stabilization and legacy browser smoke evidence — completed

- Removed dead local-provider code and kept dependencies minimal.
- Kept GitHub as source review only and made the connected Cloudflare Workers build the
  sole automatic build/deployment path.
- Enforced request bounds from actual body content.
- Reconciled the maintained documentation with the implementation as recorded on
  1 August 2026; the 4 August cleanup corrected later-discovered cadence, quota, model,
  sequence, and reusable-credential wording.
- Audited imports, exports, files, and packages; removed unnecessary public type/export
  surface while retaining the convention-loaded OpenNext configuration and every
  dependency required by runtime, build, type checking, lint, tests, or deployment.
- Ran tests, type checking, lint, production/OpenNext builds, dependency audit, and diff
  checks.
- Validated the legacy disposable-room URL in a browser-level production smoke test using
  synthetic virtual audio.
- Recorded remaining pilot risks and produced a stakeholder test guide.

That smoke test predates the reusable Main channel and GPT-OSS migration. The current
deployed revision, actual reusable-channel lifecycle, and intended OBS streaming-computer
rehearsal remain part of the next gate.

## Deferred native feasibility experiment — local evidence only

Decision update, 10 August 2026: paid Apple distribution is not part of the current
phase. The native experiment is retained as reversible research, but it is removed from
the active roadmap, release gates, and stakeholder-test plan. Current work targets the
browser application, protected Cloudflare deployment, OBS integration, and the
service-scoped web mobile viewer only.

The repository now contains an internal iPhone/iPad SwiftUI and `WKWebView` shell for the
existing protected operator dashboard. It adds a native approved-audio preflight,
microphone permission handling with a view-only path, exact-origin WebKit microphone
permission, allowlisted navigation and native service-status framing, fail-safe
inactive/foreground reconciliation, a native microphone indicator, an app icon, and a
privacy manifest. It does not add a native caption engine, background recording, new
backend, archive, or public mobile-caption client. See
[`ios/README.md`](../ios/README.md).

Local evidence on 4 August 2026:

- XcodeGen 2.46.0 generated the project, and Xcode 26.6 built the pre-hardening target
  unsigned for the simulator;
- three pre-hardening configuration tests passed on an iPhone 17 simulator running iOS
  26.5;
- Xcode produced a pre-hardening unsigned arm64 archive for version 0.1.0 build 1, with
  no Team or Signing Identity; and
- the hardened sources and new fourth test were generated, and the Swift sources compiled
  during a follow-up build attempt, but sandboxed CoreSimulator asset packaging prevented
  a complete current build or test result.

Only if the owner explicitly reopens native distribution:

- confirm the legal publisher, Apple team, final bundle identifier, signing assets,
  privacy answers, export-compliance determination, and internal tester group;
- replace or explicitly approve the default Worker URL with an isolated,
  Access-protected demo deployment whose exact revision and provider configuration are
  verified;
- create a signed archive, validate it in Organizer, upload it to App Store Connect, and
  confirm TestFlight processing, invitation, installation, and launch; and
- test on physical iPhone and iPad hardware: microphone and `audio/mp4` capture, Access
  sign-in, cookies, protected APIs, WebSockets, OBS, layout/orientation, backgrounding,
  device lock, interruption, and network recovery.

There is no current native exit condition or Apple release target. Any future reopening
requires a new recorded decision and would not replace the web pilot gates.

## Current step: controlled stakeholder test

PR #18 merged the GPT-OSS migration into `main` at `e680576` on 2 August 2026. No current
evidence yet proves that exact revision in Cloudflare, a real GPT-OSS response, the
deployed selectable-buffer behavior and ceiling of 900 reserved transcription attempts,
or the full reusable Durable Object/OBS/mobile-viewer journey.

- Follow [Stakeholder test guide](STAKEHOLDER_TEST_GUIDE.md) with consented or synthetic
  audio.
- Rehearse on the intended microphone/audio interface and OBS streaming computer.
- Create the Main channel once, install it in OBS, and verify idle test/clear before
  starting microphone capture.
- Confirm the Setup grouping at the primary 1920 × 1080 operator viewport and a 1200px
  intermediate width, then confirm the single-column mobile flow and verify every
  appearance control updates the dashboard preview continuously before saving.
- Confirm the monochrome hierarchy, focus visibility, status legibility without colour,
  and sufficient control contrast on the intended operator displays.
- Verify pause/resume, clear, idle/paused tests, confirmed End, URL reuse across two
  services, confirmed takeover, explicit rotation on synthetic setup, and safe margins.
- Verify the mobile viewer at 320px and 390px, including copy/open, late join, Pause,
  replacement, End, expiry, and takeover behavior.
- Record results without sermon content, credentials, or active OBS/viewer URLs.
- Test agreed language pairs, church terminology, filter behavior, operator usability,
  processing latency, and dropped chunks.
- Confirm Groq and Cloudflare account usage remains inside the intended Free plans.
- Triage failures and agree explicit quality, latency, recovery, and go/no-go thresholds.

Exit condition: stakeholders record an evidence-based result for each agreed acceptance
criterion and the owner decides whether Phase 1B work or a limited pilot is appropriate.

## Phase 1B: reliability and optional provider upgrade

- Add deliberate source-caption fallback only after operator behavior is approved.
- Improve audio-device disconnect and browser lifecycle recovery.
- Add optional manual correction with clear revision and audit semantics.
- Decide whether voice-activity or semantic-boundary flushing is needed beyond the fixed
  6/9/12-second windows.
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
- in-room displays and multi-language audience clients beyond the current single-caption
  mobile viewer, all separate from the internal iOS operator-shell feasibility work;
- speaker diarization;
- translation memory across approved church workspaces;
- human interpreter handoff;
- search across an approved sermon library;
- Cantonese as a distinct spoken input; and
- offline or managed-appliance continuity only if the cloud-first constraint changes.
