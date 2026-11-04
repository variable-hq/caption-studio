# Caption Studio

Cloud-hosted transcription and translation for live sessions such as church services,
with fast OBS captions, a latest-caption phone viewer, an appending reader, and a paired
operator remote.
Currently built on free-tier Groq and Cloudflare Workers AI quotas — see
[ADR 0002](docs/decisions/0002-free-cloud-first-ai.md).

- [Overview](#overview)
- [Get Started](#get-started)
- [Languages and quality](#languages-and-quality)
- [Core Features](#core-features)
- [Not yet implemented](#not-yet-implemented)
- [AI usage and limits](#ai-usage-and-limits)
- [Architecture](#architecture)
- [Development and QA](#development-and-qa)
- [Documentation](#documentation)
- [Project status](#project-status)

## Overview

- **Capture and transcription**: browser-based microphone selection with a level meter and
  test playback, a readiness checklist, and a 6-, 10- or 14-second caption wait time (or
  Dynamic) transcribed by
  Groq Whisper with bounded name and term hints, approved recognition aliases, and
  the end of the previous chunk's transcript as continuity context.
- **Translation**: GPT-OSS 20B translates through an immutable safety envelope and
  approved terminology. **Settings › Translation** sets **How closely to follow the
  words** (Close, Balanced or Free), **Sanitization** of filler (Off by default; Low,
  Balanced or High) and **Filter inappropriate language** (on by default). One **Terms**
  list teaches names, fixes mishearings, sets preferred translations, and hides or
  replaces words on screen. A **Live note** gives the translator situational guidance for
  the current passage from the next caption, without **Apply now**.
- **Live delivery**: moderated captions reach a reusable OBS Browser Source, a per-session
  mobile viewer, and an appending reader, with an instant quick block for unanticipated
  words, a typed message while paused, and an optional pre-publish output buffer
  (the wait setting in the captions card: 1–5 seconds; pause, edit, clear, or
  fast-forward the next-up caption).
- **Operator dashboard**: three screens, **Live**, **Transcripts** and **Settings**, plus
  **Help**, built for volunteers. Live opens before a session with a full-width Start bar
  (**Start captions**, **Show a test caption** and the next-step line); below it are two
  rows of equal-height paired cards: the
  captions card (**Heard** beside **Audience view**, with **Recent captions** folded
  below; in Dynamic mode Heard fills in at the speaker's first pause and the final
  replaces it, and the output buffer wait sits below the panes) beside the readiness
  checklist, then the Start settings card (**Quick fixes** during a
  session) beside **Share**. During a session a bar pinned to the bottom holds Pause,
  Clear screen, the minutes left and End session. Each screen has its own bookmarkable
  address (`#live`, `#transcripts`, `#settings=<section>`, `#help`).
  Full behavior and visuals: [Product specification](docs/PRODUCT_SPEC.md),
  [Brand guidelines](docs/BRAND_GUIDELINES.md) and [Design system](docs/DESIGN_SYSTEM.md).
- **One workspace setup**: languages and timing, words, translator settings and
  instructions, caption style, summary defaults and automatic summaries, the output
  buffer and the transcript-saving default are saved once for every operator:
  **Save for everyone** in Settings writes the full setup, and **Save selected settings
  as default** on Live saves the per-session choices shown there. Only the light/dark
  choice is personal ([ADR 0022](docs/decisions/0022-shared-church-setup-and-words-list.md)).
- **Workspace presets**: **Settings › Presets** chooses **General** (the default),
  **Sermon**, **Talkshow** or **Keynote**. **Apply preset** fills only the settings the
  workspace has not saved, and the format adds model context to transcription, translation
  and summaries. Each live session has its own **Session format** on the Live Start bar,
  and saved transcripts show it ([ADR 0035](docs/decisions/0035-workspace-presets.md)).
  **Share setup** exports the workspace's shared settings to a file and imports one; an import
  shows what it fills in before anything is saved. A workspace can also keep its own **custom
  presets** (a name, terms and starting settings), up to the limit its plan allows; the
  allowance is set by `WORKSPACE_PLAN` ([Deployment](docs/DEPLOYMENT.md)), and imported
  summary focus or starter Terms stay off until allowed for that preset
  ([ADR 0036](docs/decisions/0036-custom-presets-and-plan-limits.md)).
- **Interface language**: English or Bahasa Indonesia, chosen per operator in
  **Settings › Language**. The Indonesian interface copy is a draft pending native review
  ([ADR 0030](docs/decisions/0030-operator-interface-localization.md)).
- **Session history**: optional workspace-wide private archives with **Session details**
  (topic, speaker, description, date), corrections, exclusions, and AI-generated
  summaries, on request or automatically after End, retained seven days after End.

## Get Started

- **For operators** running a live session: sign-in and surface details are right
  below, followed by first-time setup.
- **For contributors** working on the codebase: skip to
  [Development and QA](#development-and-qa) for local setup and validation, and
  [Contributing](CONTRIBUTING.md) for the branch/PR workflow.

The app runs behind Cloudflare Access: ask whoever manages your team's Access policy to
add your account, then open the deployed URL (`/`) and sign in to reach the operator
dashboard. Audience-facing links (`/overlay`, `/view`, `/read`) are separate,
token-scoped URLs generated per session and shared directly — they don't need Access or
a sign-in.

| Surface | Purpose |
| --- | --- |
| `/` | Capture system: setup, live controls, archives, usage |
| `/operator/mobile` | Paired Pause/Resume/Clear remote (Access-protected) |
| `/overlay` | Reusable OBS Browser Source |
| `/view` | Per-session latest-caption viewer link |
| `/read` | Per-session appending reader link |

First-time setup follows the Live screen's checklist, whose **Fix** or **Set up** buttons
open the matching Settings section. The **Help** page (the **?** button in the top bar)
lists the steps of a session in order.

1. **Settings › OBS & links** — create the OBS link once and paste it into a 1920 × 1080
   OBS Browser Source on the separate OBS computer.
2. **Settings › System** — choose the microphone or audio interface, check the
   level, and play the test clip back.
3. **Settings › Presets** (optional) — choose the workspace format and press
   **Apply preset**, which fills only settings not yet saved, create a custom preset, or
   **Share setup** to import a setup file that does the same.
4. **Settings › Language**, **Translation** and **Terms** — choose the spoken and caption
   languages, set the caption wait time, and add names and terms, one at a time or by
   importing a list, or words never to show.
5. **Settings › Output** — style the captions.
6. **Live** — tick **Save the transcript for 7 days** if wanted (optionally fill in
   **Session details**), choose a **Session format** on the Start bar if it differs from
   the workspace format, press **Start captions**, check a test phrase reaches OBS, then
   use **Share** for the **Phone viewer** and **Transcript reader** links and **Pair phone**.
   Pause, Clear screen and End session stay at the bottom of the screen.

## Languages and quality

Selectable source/target languages: English, Indonesian, Japanese, Korean, Tagalog,
Simplified Chinese, Traditional Chinese, and Vietnamese (Chinese assumes Mandarin).
Availability is not quality certification — evaluation is ongoing; see the
[ID→EN review](docs/evaluation/ID_EN_REVIEW.md), [remaining gaps](docs/GAP_ANALYSIS.md),
and [rehearsal gates](docs/STAKEHOLDER_TEST_GUIDE.md).

## Core Features

**Live captioning.** Moderated captions publish to a reusable OBS Browser Source, a
per-session mobile viewer, and an appending reader, with an optional output buffer
holding the next caption for 1–5 seconds before it publishes. Pause, Clear screen,
**Apply now**, takeover and End discard the queue. See [ADR 0016](docs/decisions/0016-client-side-output-buffer.md) and
[ADR 0017](docs/decisions/0017-configurable-output-buffer-dwell.md).

**Appending reader.** Batches up to five moderated translation chunks about every 30
seconds. With optional AI enabled it can improve punctuation/phrasing before reapplying
glossary/filter rules; with it disabled, chunks join as-is. More phones don't create
more model calls. Manual captions shown while paused appear here too, as separate
operator notes alongside the translated paragraphs.

**Paired operator remote.** `/operator/mobile` offers a Pause/Resume/Clear remote; the
microphone always stays on the capture system, and actions report as confirmed only
after it acknowledges them. Server-side Pause blocks new inference immediately; Resume
requires the capture system to still be connected.

**Live settings and drafts.** Language, words, recording window, translator settings
and instruction edits stay drafts until **Apply now** in the banner on Live and the
affected Settings sections (or **Undo changes**). Applying preserves the session clock,
controller, links, and usage. The output buffer, caption style and **Live note** apply
immediately. OBS link rotation is a separate idle action.

**Live note and Recent captions.** During a session, **Quick fixes** holds a 500-character
**Live note** for names, sound words or who is speaking, kept only in that tab for the
current session. **Recent captions** shows the last three published captions with their
source text and changes nothing. See
[ADR 0023](docs/decisions/0023-live-note-and-recent-outputs.md).

**Workspace presets and session format.** Sermon, Talkshow and Keynote each add model
context (a transcription prefix, a translation rule and a summary framing) to requests,
after the server's own safeguards; General adds none. Choose the workspace format in
**Settings › Presets**. A session's format is fixed when it starts, and the
public reader and phone viewer show that session's wording. See the
[Product specification](docs/PRODUCT_SPEC.md#workspace-format).

**Dynamic caption wait.** **Technical details** shows how caption windows ended (at a
sentence end, a pause or the wait limit), the unfinished drafts held, and the typical and
longest-10% caption wait. These counters stay in the controlling tab and are never stored
or sent ([ADR 0034](docs/decisions/0034-dynamic-pause-adaptation.md)).

**Session history.** History saving is off by default, must be enabled before Start,
and can't change mid-session. When on, the private journal keeps recognized source,
corrections, reader paragraphs, and summary drafts for seven days after End, shared by
every signed-in operator. Optional **Session details** are record-only and never reach
a model ([ADR 0024](docs/decisions/0024-session-metadata.md)). After End, an operator can
correct source, remove passages, export the transcript as JSON, or **Generate summary**
(requires optional Workers AI; each point cites the transcript passages it is based on);
with **Make a summary draft automatically after each session** on, End queues one
([ADR 0019](docs/decisions/0019-automatic-post-service-summary.md)). Full behavior:
[Product specification](docs/PRODUCT_SPEC.md#after-the-session).

| Action | OBS and latest viewer | Appending reader | Private history and usage |
| --- | --- | --- | --- |
| Clear screen | Blank; capture continues | Keep committed paragraphs, discard pending work | Preserved |
| Quick block a word (**Hide captions with it**) | Hides any caption containing it immediately, without a settings refresh | Same caption hidden in the reader/archive too | Preserved |
| Pause | Blank; capture stops | Keep committed paragraphs, mark boundary | Preserved |
| Manual caption (**Show your own message**, while paused) | Show operator-typed text (240 characters max) in place of the hidden translation | Not appended to paragraphs; recorded as a separate operator note | Note saved if history saving is on |
| Resume | New capture after acknowledgement | Append new paragraphs | Same session |
| Refresh translation settings | Clear and reject old results; keep session/links | Preserve earlier text; separate later revisions/languages | Preserved |
| End or 90-minute expiry | Blank; latest-viewer link revoked; OBS URL retained | Bounded finalization, then 30-minute reading grace | Saved content expires seven days later; usage keeps its own expiry |
| Takeover | Replace controller and latest-viewer link | Revoke previous reader and remote | Prior saved session retained until expiry |
| Remove passage | Clear current caption if its source belongs to the removed passage | Remove selected paragraph on refresh/poll | Preserve original source, exclude its IDs from summaries, invalidate drafts |
| Delete transcript | Available after End | Revoke reader and remove history on its next successful poll | Delete transcript content; numeric usage retained |

Use **Live › Share** for the phone viewer, transcript reader and phone pairing during a
session; **Settings › OBS & links** for the OBS link and replacing the OBS or phone viewer
link; **Transcripts** for private archives and summaries; and **Settings › Usage** for
provider headroom and rolling usage history.

## Not yet implemented

Application audio storage, a paid AI fallback, simultaneous target languages, a live
correction of captions already shown, tenant roles,
an authorized source-text passage corpus, and a native app (the deferred iOS shell was removed in
[ADR 0020](docs/decisions/0020-remove-ios-shell.md)). See
[Roadmap](docs/ROADMAP.md) and [remaining gaps](docs/GAP_ANALYSIS.md) for planned work.

## AI usage and limits

Live's **Technical details** shows the active session's counters; **Settings › Usage**
shows provider headroom and **Last 30 days** usage across this deployment. Numeric rows record provider, model, stage, session, time, known
tokens/audio, and unknown outcomes; no transcript text or credentials. Each expires 30 days
after its original attempt. Clear, End, takeover and archive deletion do not reset usage
or provider quotas. This is a rolling window, not a calendar month or renewed allowance.

- Sessions last at most 90 minutes, including paused time, with 1,800 reserved
  transcription attempts and at most 1,800 fast translations. Silent/same-language chunks
  skip translation.
- Inference requires Access, the current controller, and a one-time reserved attempt per
  stage. Requests carry `x-caption-controller` and `x-caption-transcription-attempt`.
- Provider dispatch requires persisted usage admission. Duplicate/uncertain attempts are
  not automatically replayed. Unknown consumption remains unknown.
- Optional reader/summary work allows at most 200/60 calls per session. Conservative
  daily reservations cap this app at 9,000 estimated neurons, including a 6,000 reader cap.
- Capacity estimates use stated limits. Other apps may consume account quotas; provider
  dashboards remain authoritative. There is no automatic paid fallback.

`CAPTION_OPTIONAL_AI_ENABLED` must be exactly `true` to enable Workers AI. Keep it
off until account plan, content handling, models, and approved quality checks are verified.
See [ADR 0011](docs/decisions/0011-service-history-and-optional-inference.md).

## Architecture

```mermaid
flowchart LR
  Mic["Microphone / audio interface"] --> Host["Capture browser"]
  Host --> API["Access-protected Worker APIs"]
  API --> Groq["Groq transcription / translation"]
  Groq --> Host
  Host -->|"moderated caption"| Main["CaptionRoom"]
  Phone["Paired operator phone"] --> API
  Main --> OBS["OBS and latest viewer"]
  Main --> Journal["TranscriptJournal"]
  API -->|"opted-in source"| Journal
  Journal --> Reader["Appending reader"]
  Journal -->|"optional phrasing / summaries"| AI["Workers AI"]
  API --> Usage["AiUsageLedger: numeric, 30 days"]
  Journal --> Usage
```

`custom-worker.ts` dispatches live/experience routes before OpenNext and exports all
four SQLite Durable Objects. `wrangler.jsonc` declares `CAPTION_ROOMS`,
`TRANSCRIPT_JOURNALS`, `AI_USAGE`, `OPERATOR_PREFERENCES`, `AI`, and `ASSETS` plus v1 to v4
migrations.
GitHub provides source review; Cloudflare Workers Builds builds and deploys only `main`
to the `caption-studio` Worker (preview-branch builds are off). There is no GitHub
Actions workflow. See [Architecture](docs/ARCHITECTURE.md).

## Development and QA

Use Node.js 22.12 or newer and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Keep real values in ignored local files or encrypted Worker secrets. `.env.example`
lists every variable the application reads; `CAPTION_LOCAL_AUTH_BYPASS` is for local
runs only and must never be deployed. The QA scripts additionally read
`CAPTION_QA_TOOLS_DIR` and `CAPTION_QA_ORIGIN`. Next dev alone does not prove the Cloudflare lifecycle. For local Worker checks without remote AI, follow
[isolated runtime QA](docs/LIVE_SESSION_PLAN_1_QA.md#runtime-rehearsal).
Standard `npm run preview` uses OpenNext's remote AI proxy and needs Cloudflare
credentials plus Access service authentication when its preview domain is protected.

```sh
npm run validate
npm audit --omit=dev
npm audit
```

Validation checks for duplicate ADR numbers, then runs tests with one worker, strict
TypeScript, ESLint, both production builds, and a non-publishing deployment dry run,
finishing with a whitespace check, sequentially. Run
`npm run cf-typegen` after binding changes.

Browser and runtime QA scripts are separate from validation. The browser scripts load
Playwright and Axe from an isolated directory so that no test dependency enters the
product. Run `npm run qa` (or `npm run qa:all`) to install that isolated tooling and
Chromium when needed, start the local server, and run the two mocked browser suites
concurrently. Every API request is mocked. The server listens on `CAPTION_QA_PORT`
(default 3100); the run stops if that port is already in use. Next.js allows one `next dev` per project directory, so a second
run on another port must come from a separate checkout. Screenshots are written
to ignored `test-results/` only with `CAPTION_QA_SHOTS=1`. `CAPTION_QA_COLOR_SCHEME=dark`
runs every width in dark; by default the run adds a dark colour-contrast pass at 390 and
1200px:

```sh
CAPTION_QA_PORT=3200 npm run qa
# Individual scripts remain available when the server and tooling are already running.
CAPTION_QA_TOOLS_DIR=/tmp/caption-studio-ui-qa npm run qa:operator
CAPTION_QA_TOOLS_DIR=/tmp/caption-studio-ui-qa npm run qa:experience
```

If headless Chromium's fake microphone never resolves on your machine (the operator suite
then times out at **Start captions**), set `CAPTION_QA_STUB_MIC=1` to substitute a
synthetic tone for the microphone in the operator suite. It is off by default.

`npm run qa:runtime` exercises the real local Durable Objects against an isolated
Wrangler preview on port 8787 with AI disabled; follow
[Plan 1 QA](docs/LIVE_SESSION_PLAN_1_QA.md#runtime-rehearsal). Script output under
`test-results/` is ignored local evidence; commit only the synthetic captures a review
needs, under `docs/review-assets/`.

Use the [deployment runbook](docs/DEPLOYMENT.md) for commands, exact Access paths, secrets,
the proxy failure, and post-merge verification. Keep credentials and session content out
of logs, screenshots, chat and issues.

## Documentation

[Documentation index](docs/README.md) separates current specifications, decisions,
pending evaluation, and dated evidence. Start with:

- [Product specification](docs/PRODUCT_SPEC.md), [Roadmap](docs/ROADMAP.md), and
  [remaining gaps](docs/GAP_ANALYSIS.md).
- [Security](SECURITY.md) and [Contributing](CONTRIBUTING.md).
- [Plan 1 design](docs/LIVE_SESSION_FEEDBACK_PLAN_1.md) and
  [Plan 1 QA](docs/LIVE_SESSION_PLAN_1_QA.md).
- [Cleanup and deployment QA](docs/CLEANUP_DEPLOY_QA.md) and
  [export hygiene QA](docs/EXPORT_HYGIENE_QA.md).

## Project status

The 13 September 2026 deployment of PR #26 was verified, and Workers Builds production
deployments of `main` are recorded through PR #75 (28 October 2026). Build and Worker
version IDs are not recorded after PR #26, and later merges have no recorded deployment
yet. See the [deployment runbook](docs/DEPLOYMENT.md) for the fix that unblocked the first
deploy and the remaining rehearsal gates.

This document reviewed 4 November 2026 against merged [PR #112](https://github.com/variable-hq/caption-studio/pull/112) (`87b37dd`).

The repository is private and has no open-source license. Third-party adaptations retain
their [notices](THIRD_PARTY_NOTICES.md).
