# Validation report — updated 12 September 2026

## Decision

The latest web candidate passes local automated, build, real local-room, and mocked
browser checks for the new inference safeguards. Both-stage one-time claims,
script-aware filtering, and incomplete-output skipping are implemented and verified
locally. The [gap analysis](GAP_ANALYSIS.md) retains deployment, hardware, duration,
quality, and recovery gates. Isolated deployment awaits concrete
[plan/access/test-secret prerequisites](DEPLOYMENT_REHEARSAL_READINESS.md).
Indonesian→English is selected; Operator review of all 30 prepared samples is pending.
This report does not approve an unattended live service or production rollout.

The new internal iPhone/iPad feasibility shell has pre-hardening local unsigned build,
three-test simulator, and generic-device archive evidence only. The hardened sources
compile, but a complete current build, four-test run, and archive remain pending. It has
not been signed, uploaded, processed by TestFlight, installed on physical hardware, or
validated against the protected backend, and therefore does not change this release
decision.

Project-direction update, 10 August 2026: Apple distribution is deferred because paid
developer-program participation is outside the current phase. The evidence below is
retained as historical local feasibility evidence only. It is not an active blocker,
release gate, or next step; the web application and Cloudflare/OBS path are the sole
current focus.

## UI optimisation — 12 September 2026

The [UI/UX review](UI_UX_REVIEW.md) maps the changes to W3C accessibility guidance,
progressive disclosure, and Vercel's Web Interface Guidelines. The reviewed Vercel skill
is installed under `.agents/skills/web-design-guidelines`, pinned to recorded revisions.
No runtime dependency or external application connection was added.

- Tutorial: all six steps pass at 1920, 1200, 390, and 320 CSS px. Checks cover compact
  step selection, 44px control targets, panel shortcuts, destination focus, same-topic
  replay, Back/Next, Skip/Escape, dismissal across reload, and unchanged language drafts.
- All six tutorial steps also pass at 390px with computed font sizes doubled and WCAG
  text-spacing overrides. Visual inspection caught and fixed clipped list markers;
  header and footer controls now wrap when needed. This is not actual browser zoom.
- The 568 × 320 landscape, blocked storage, and existing live/paused-channel checks pass.
  The tutorial requested no audio and sent no service mutations.
- The operator regression passes at all four widths: expandable starting configuration,
  setup sections, live tutorial handoff to Mobile viewer, unobscured destination heading,
  appearance preview, concealed OBS credential, draft isolation, and Start/Pause/Clear/End.
- No page errors, horizontal page/dialog overflow, or Axe WCAG A/AA violations occurred
  in the exercised states. Browser checks use Chromium, synthetic API responses, and fake
  audio for the operator journey; no provider or deployed service was called.
- The same idle setup fixture is 278px shorter at 390px and 227px shorter at 320px.
  This measures rendered page height, not task completion time.
- Final `npm run validate` passes: 176 Vitest tests in 18 files, strict TypeScript,
  ESLint, Next.js and OpenNext production builds, and the diff check. A fresh full
  dependency audit reports zero known vulnerabilities.

Reproduce the browser checks with `CAPTION_QA_TOOLS_DIR` pointing to an isolated
Playwright and Axe installation, alongside the local server shown in the next section:

```sh
CAPTION_QA_TOOLS_DIR=/tmp/church-caption-ui-qa node scripts/tutorial-qa.mjs
CAPTION_QA_TOOLS_DIR=/tmp/church-caption-ui-qa node scripts/operator-ui-qa.mjs
```

Evidence: [tutorial results](../test-results/tutorial/results.json),
[operator results](../test-results/ui-optimisation/operator-results.json),
[mobile dashboard](../test-results/ui-optimisation/operator-setup-390.png), and
[enlarged-text guide](../test-results/tutorial/enlarged-text-390.png),
[final validation log](../test-results/ui-optimisation/validate-ui-optimisation.log), and
[dependency audit](../test-results/ui-optimisation/audit-ui-optimisation.json).
Physical audio/OBS, production behavior, actual browser zoom, screen-reader use, and
operator usability remain unverified. This is a local UI improvement, not a deployment
or WCAG conformance certification.

## First-visit operator tutorial — 12 September 2026

Added a six-step native modal guide and an always-visible **How to use** button.
The guide covers the confirmed AUX/USB audio interface, Indonesian-to-English example,
separate OBS computer, mobile sharing, and live controls. Dismissal is browser-local;
the [decision record](decisions/0004-first-visit-operator-tutorial.md) defines the single
stored flag and its limits. This is an educational overlay, not an automatic setup action.

- `npm run validate` passes: 176 Vitest tests in 18 files, strict TypeScript, ESLint,
  Next.js and OpenNext production builds, and the diff check. These existing Vitest tests
  are supplemented by the tutorial's independent browser check below.
- The [tutorial browser check](../scripts/tutorial-qa.mjs) passes at 1920px, 1200px, 390px,
  and 320px. Every step, Back/Next, direct navigation, completion, Skip, Escape, replay,
  focus return, dismissal across reload, and unchanged language selections were checked.
  No page errors, horizontal overflow, or Axe violations occurred in the exercised states.
- A 568 × 320 landscape check keeps exit/navigation reachable. Blocked storage leaves
  the guide usable and allows it to reappear after reload. Existing live and paused
  channels suppress automatic opening; manual replay explains that the service continues.
- All tutorial API routes were mocked. No microphone access or service mutation occurred.
  The existing operator setup, appearance preview, draft isolation, and Start/Pause/Clear/End
  browser journey also passes at all four widths after dismissing the guide.
- Fresh production and full dependency audits each report zero known vulnerabilities.
  No product dependency was added. Playwright and Axe remain in the isolated QA directory.

Reproduce with a local dev server and the isolated browser tools:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3100
# In another terminal; the directory must contain Playwright and @axe-core/playwright.
CAPTION_QA_TOOLS_DIR=/tmp/church-caption-ui-qa node scripts/tutorial-qa.mjs
```

Local evidence: [results](../test-results/tutorial/results.json),
[desktop guide](../test-results/tutorial/step-1-1920.png),
[mobile audio step](../test-results/tutorial/step-2-320.png),
[operator regression](../test-results/tutorial/regression/operator-results.json), and
[validation log](../test-results/tutorial/validate-tutorial-final.log).
These are local synthetic checks. Human usability, screen-reader behavior, actual browser
zoom, physical audio/OBS performance, and deployed behavior remain unverified. The earlier
inference-candidate manifest below predates this tutorial and is not the current tree.

## Inference safeguards and local rehearsal — 12 September 2026

Implemented locally:

- Access verification before separate atomic transcription/translation claims, with a
  900-reservation ceiling and rejection of duplicate, stale, paused, expired, and
  unreserved attempts. Pause, confirmed refresh, and legacy-state loading invalidate old
  reservations without resetting service usage or expiry.
- Canonical inference POST routing and rejection of unsupported `/_next/data/*` URLs
  before OpenNext can rewrite them around the claim boundary.
- Native target-language word boundaries for Han/Hiragana/Katakana filter terms, retaining
  harmless Latin substrings and protected source text. Unsupported segmentation prevents
  affected publication with an actionable error.
- Non-`stop`, empty, and non-text provider completions are skipped. Available normalized
  usage is acknowledged before `422 translation_incomplete`; the browser counts usage
  and the skipped chunk, publishes no partial/source fallback, and can process the next
  valid chunk. Missing or failed usage acknowledgement remains terminal.

| Gate | Result and scope |
| --- | --- |
| Final `npm run validate` | 176 tests in 18 files, strict TypeScript, warning-free ESLint, Next.js production build, OpenNext Cloudflare bundle, and diff check completed with exit 0. [Final log](../test-results/ux-review/validate-id-en-final.log). |
| Final Worker packaging | `wrangler deploy --dry-run` bundles the custom Worker without cloud mutation; [final log](../test-results/ux-review/bundle-id-en-final.log). |
| Real local Worker/room | Direct `wrangler dev` on port 3102, local-only Access bypass, test-only encryption key, a real Durable Object, and a real viewer WebSocket passed 21 synthetic requests: English publication, Pause/Resume, refresh and stale-revision rejection, viewer replacement/replay, and End/reset. First transcription claim reached an unconfigured Next route (503); replay returned 409; paused returned 410; resumed/refreshed old attempts returned 400. No Groq call occurred. |
| Browser incomplete-output recovery | Mocked APIs and fake microphone at 1200px and 320px, Indonesian→English: incomplete output skipped, then one valid English caption published. Both attempts sent the controller/attempt pair; two acknowledged calls totaled 476 tokens, with one skipped chunk. No raw-source fallback, page error, Axe violation, or horizontal overflow occurred. |
| Fresh dependency audits | Production and full audits each report 0 known vulnerabilities on 12 September. |

Content-free local evidence: [Worker/claim results](../test-results/ux-review/worker-claims-results.json)
and [browser recovery results](../test-results/ux-review/incomplete-recovery-results.json).
The [candidate manifest](../test-results/ux-review/id-en-candidate-manifest.json) records
the base commit and SHA-256 hashes of 70 source/configuration/test inputs and three final
bundle files. It identifies the earlier uncommitted inference candidate before the
tutorial change, not the current tree or a deployed version.
These ignored test artifacts are not production records. The direct Wrangler runtime
establishes a short local room/socket lifecycle; the earlier Next.js development-proxy
Durable Object warning does not invalidate this separate check. Local Access bypass
provides no evidence of deployed Access policy, and was not applied to cloud resources.

The [filter/completion decision](evaluation/CAPTION_POLICY_DECISION.md) records technical
policy and tradeoffs. The [30-sample Indonesian→English review](evaluation/ID_EN_REVIEW.md)
is preparation only: Operator is selected, but no human semantic score, terminology
approval, or audio evaluation is complete. [Pilot improvement designs](PILOT_IMPROVEMENTS.md)
are gated proposals, not implemented QR/profile/correction features.

Read-only Cloudflare investigation found only production version
`0998e416-60e5-4878-b639-d938ed5249bd`, without a Git SHA; no isolated test Worker exists.
Unauthenticated channel/readiness probes returned edge HTTP 403, not application-auth
proof. Plan verification, Access ownership/operator access, and fresh test credentials
remain prerequisites in the [readiness record](DEPLOYMENT_REHEARSAL_READINESS.md).
No production deployment/configuration mutation, real provider inference, physical
microphone/OBS rehearsal, or full 90-minute test occurred. Local synthetic checks do not
establish semantic quality, audience latency, or WCAG conformance.

## Benchmark and UI review — 11 September 2026

Branch: `codex/ux-benchmark-review`, based on `aa3ddf2`. The
[gap analysis](GAP_ANALYSIS.md) traces current implementation and acceptance criteria;
the [benchmark report](BENCHMARK_RESEARCH.md) compares published Wordly, spf.io,
LiveVoice, OBS, and W3C guidance. Vendor workflows are research evidence, not measured
performance or a conformance certificate for this application.

Implemented locally:

- audio/language/OBS preflight, task-ordered setup navigation, a 1600px desktop ceiling,
  active/draft language and buffer context, and a labelled local output monitor;
- configuration and room-state labels that do not claim observed OBS connectivity,
  explicit input levels, copy feedback, hidden-by-default manual OBS URL disclosure,
  and shared-style save acknowledgement only when the channel confirms the style;
- a skip link, workspace focus handling, mobile reflow, direct End control with native
  confirmation, Escape and focus return, and clear descriptions of public-output effects;
- audience-local text sizing, separate caption language semantics, connection-loss
  feedback when the browser reports socket closure, bounded open/drop retries, and
  manual reconnect after exhaustion;
- compatible dependency patches, disabled Next.js generation of agent instruction files,
  and an ESLint exclusion for Wrangler's generated preview directory.

Final local checks on 11 September 2026:

| Gate | Result and scope |
| --- | --- |
| `npm run validate` | Pass: 131 tests in 17 files, strict TypeScript, ESLint without warnings, Next.js production build, OpenNext Cloudflare bundle, and diff check. |
| New viewer regression checks | Three runnable Vitest cases cover language/text sizing, closure feedback and bounded retries, and invalid/revoked links. |
| Production / full dependency audits | Both report 0 known vulnerabilities after compatible patches. Initial audits reported 3 / 10 respectively; an old clean audit did not establish the current dependency state. |
| Operator browser flow | Chromium at 1920, 1200, 390, and 320px: all six setup sections, continuous appearance preview, concealed manual OBS URL, section focus, synthetic Start/Pause/Clear/End, draft isolation, dialog Escape and focus return. No page errors or horizontal document overflow. |
| Shared style failure | Mocked failed save remains unconfirmed; successful retry receives an acknowledgement. Browser-only persistence does not imply a shared save. |
| Audience browser flow | Same four widths: long synthetic Indonesian caption, local text sizing, English control language, feedback after simulated socket closure, revoked-link state, and no horizontal overflow or page errors. |
| Automated accessibility scan | Axe with WCAG 2 A/AA, 2.1 AA, and 2.2 AA tags reports 0 violations in the exercised setup, paused, End-dialog, save-feedback, and viewer states. Reduced-motion preference was enabled. |
| Local Worker smoke | Dashboard, `/overlay`, `/view`, and health return 200; malformed overlay/viewer channels return 400; protected channel read fails closed at 503 without local Access configuration. `/view` contains the new controls and retains CSP, no-referrer, and no-store headers. |

The final tree uses Next.js/eslint-config-next 16.3.3, Vitest 4.1.11, Sharp 0.35.4,
OpenNext Cloudflare 1.20.1, and Wrangler 4.125.0. Playwright 1.63.0 and Axe 4.13.0
were installed only in an isolated temporary QA directory, with Chromium headless
153.0.8010.12; no browser-testing or UI runtime dependency was added to the product.
The first validation rerun after preview creation caught ESLint traversing generated
Wrangler files. Excluding `.wrangler/**` fixed that tooling failure; the final complete
validation passed while the preview was still running.

Local, ignored evidence is retained in `test-results/ux-review/`: operator/viewer JSON
results, shared-save and Worker-smoke results, and screenshots. Examples:
[desktop setup](../test-results/ux-review/operator-setup-1920.png),
[mobile setup](../test-results/ux-review/operator-setup-390.png), and
[mobile viewer](../test-results/ux-review/viewer-390.png). These are synthetic local
artifacts, not committed production evidence. Viewer checks exercise the self-contained
document with a mocked socket. Operator checks intercept every API request and use a
synthetic microphone; they make no Groq calls. Worker preview separately verifies the
generated bundle's HTTP routes. Its documented internal-Durable-Object warning remains,
so it does not establish a working local channel/socket lifecycle.

No cloud settings, deployment, real audio, or provider traffic were used. Automated
accessibility checks and selected keyboard interactions do not establish WCAG conformance.
Keyboard-only refresh/takeover/error recovery, actual browser zoom, screen-reader users,
volunteer usability, physical devices, OBS scene changes, real translation quality, and a complete
90-minute service remain rehearsal gates. Long-caption sizing does not resolve model
truncation or the OBS reading-time policy in G07.

### Follow-up usability review — 12 September 2026

A second pass corrected unreachable live clipboard-failure guidance. The operator can
now reveal the OBS URL inside More during a service, or in Live outputs before one.
The mobile link has its own concealed manual-copy disclosure in Mobile viewer. More
closes with Escape and restores focus; on mobile it expands inline without covering
later actions. Revealing a credential remains an explicit operator action.

Keyboard testing also exposed a rapid Escape/reopen race in End confirmation. The
dialog now uses native `showModal()` and `close()` directly, removing redundant React
open/close synchronization. It still closes when the service disappears. A caption's
language metadata is retained with its displayed text, so a paused synthetic test uses
its actual language even when the operator changes the draft afterward. Clearing public
text clears that metadata. This is local display state, not a new public wire field.

The synthetic keyboard journey passed at 1920, 1200, 390, and 320px: skip link, section
navigation, range-driven appearance preview, Start, Pause, Resume, Clear, and confirmed
End, including rapid Escape/reopen and unobscured action targets. Clipboard-denial tests
passed at the same widths for both links, explicit reveal/selection, and More Escape
focus return. Those clipboard states had no horizontal overflow, page errors, or Axe
violations under the same WCAG tags as the earlier review. Local results are saved in
`test-results/ux-review/keyboard-results.json` and `clipboard-results.json`.

The focused caption-language check also passed at all four widths: an active Indonesian
service showed a paused Japanese test; editing the draft to Korean retained the Japanese
text and language; the next test changed both to Korean; Clear removed both. No page
errors or Axe violations were recorded. See `caption-language-results.json` in the same
local evidence directory. Every browser API request remained mocked.

After all follow-up changes, `npm run validate` passed again on 12 September: 131 tests
in 17 files, strict TypeScript, ESLint without warnings, Next.js and OpenNext builds,
and the diff check. Its log is retained locally as
`test-results/ux-review/validate-followup-final.log`. Dependency audit results above are
the separately recorded 11 September scans; this follow-up added no dependencies.

The benchmark recheck clarified LiveVoice's separate transcription/translation features
and per-language charging, and removed an unsupported implication about Wordly audience
link permanence. The implementation report now distinguishes immediate feedback after
a browser-reported socket closure from unmeasured physical network-loss detection time.
These checks do not establish deployment, provider quality, or WCAG conformance.

## Historical deployment scope and environment

The production Worker at <https://church-live-caption.lukas-ka.workers.dev/> was tested
through its deployed UI and public OBS overlay paths on 20 July 2026. The test exercised
English source to Indonesian output with virtual synthetic audio. The exact deployed Git
revision could not be independently read from Cloudflare during this check, so this
report does not claim revision provenance.

## Historical 20 July disposable-room production smoke test

| Check | Result | Evidence or qualification |
| --- | --- | --- |
| Cloud readiness | Pass | Dashboard reported Cloud AI configured. |
| Session creation | Pass | A new authenticated 90-minute session was created. |
| Audio-to-caption loop | Pass | 47 public captions were produced in 3m 12s with 0 skipped chunks. |
| Translation path | Pass | English source reached Indonesian public output. |
| Biblical prompting | Observed only | Biblical terms appeared, but virtual input quality was unsuitable for acceptance scoring. |
| Processing latency | Observed | Dashboard values were approximately 550–890 ms after each four-second chunk. |
| Style propagation | Pass | 72px serif, right/top alignment, and fully transparent highlight reached the overlay. |
| Reconnect/state restore | Pass | Reload restored the latest public caption and current style. |
| Session revocation | Pass | Ending cleared the room and made the prior URL unusable after retry handling. |
| Dashboard/API Access | Pass | Unauthenticated dashboard and protected POST routes redirected to Access. |
| OBS route boundary | Pass | Overlay document remained public; malformed session request returned 400. |
| Browser errors | Pass | No page console errors were observed in the exercised flow. |

Only the latest moderated public caption was exposed to the overlay. The source preview
remained in the operator UI. No production configuration was changed by the test.

This was the legacy four-second, per-service disposable-room design. It predates the
reusable Main channel and GPT-OSS migration and must not be treated as evidence for either.

## Historical code and build QA

The stakeholder-readiness branch added deterministic audio-device selection tests and
clarified the processing-latency metric. Final QA on 20 July 2026 produced:

| Gate | Result |
| --- | --- |
| Unit tests | Pass — 7 files, 26 tests |
| TypeScript | Pass, including unused local/parameter checks |
| ESLint | Pass |
| Next.js production build | Pass |
| OpenNext Cloudflare bundle | Pass |
| Local preview smoke | Pass — dashboard 200, overlay 200, malformed overlay session 400 |
| Dependency audit | Pass — 0 known vulnerabilities |
| Whitespace/error diff check | Pass |

The local preview emitted the documented warning that the internal Durable Object could not
run in the same local Worker configuration. Durable Object behavior was therefore
validated against the deployed environment, not the local preview.

### Live-control and safe-margin extension

The subsequent control extension added atomic Pause/Resume/Clear/test behavior, confirmed
End, and 0–20% OBS safe margins. The feature-branch validation completed on 20 July 2026
included:

- 41 passing Vitest tests, including Access enforcement, control validation, paused-room
  rejection, caption-versus-Pause ordering, sequence preservation, margin normalization,
  and AI-request cancellation propagation;
- strict TypeScript checks, ESLint, `git diff --check`, Next.js production build, and
  OpenNext Cloudflare bundle generation;
- zero reported npm audit vulnerabilities;
- desktop and 390px mobile dashboard inspection with no horizontal overflow, a clean
  browser console, and measured 4%/6% preview guide insets; and
- local Worker route smoke results: dashboard `200`, overlay document `200`, malformed
  socket request `400`, and a valid-shaped operator control request failing closed at
  `503` when local Access configuration is absent.

The internal Durable Object remains unavailable in the local OpenNext preview by design,
so deployed control behavior and a real 1920 × 1080 OBS Browser Source rehearsal remain
post-merge gates. This original production smoke report remains evidence for the earlier
baseline and does not retroactively claim the new controls were deployed or live-tested.

### Post-control sanitization

The subsequent sanitization pass removed unused provider response fields and redundant
room-initialization values, consolidated the live-control allowlist, and moved JSON and
multipart parsing behind one received-byte limiter. It also removed GitHub Actions as a
build path in the preceding workflow cleanup; this pass documents the connected
Cloudflare Workers build as the sole automatic publisher. Local validation on 20 July
2026 produced:

- 10 passing Vitest files with 49 tests, including received-byte, multipart, JSON-value,
  content-type, audio-type, and AI-route boundary coverage;
- TypeScript, strict unused local/parameter checks, ESLint, and `git diff --check` passes;
- successful Next.js production and OpenNext Cloudflare builds;
- zero known vulnerabilities reported by `npm audit`; and
- local Worker route results of dashboard `200`, overlay `200`, malformed overlay
  session `400`, and protected readiness `503` without local Access configuration.

This sanitization result is local branch evidence only. It does not replace the required
post-merge Cloudflare deployment check or the outstanding Durable Object and real OBS
rehearsal.

### Reusable Main channel and operator-console branch

The pre-merge reusable-channel branch replaced per-service URLs with one encrypted,
reusable Main channel and separated guided Setup from the streamlined Live console. Local
automated validation covered idempotent channel creation, AES-GCM token recovery, Access and body
bounds, server-assigned sequence order, idle/paused tests, End-with-URL-retention,
service expiry, controller conflicts, confirmed takeover, stale-controller rejection,
explicit rotation, and the self-contained overlay contract.

Recorded pre-merge branch evidence on 1 August 2026:

- 11 passing Vitest files with 60 tests, including atomic request-ceiling enforcement
  and paused-state reservation rejection;
- strict TypeScript, explicit unused-local/parameter checks, ESLint, Cloudflare type
  generation, Next.js production build, and OpenNext bundle/preview pass;
- the 1200px desktop and 390px mobile Setup layouts were rendered in a real browser with
  no horizontal overflow; the mobile accordion reduced the initial page length while
  preserving reachable Start and OBS actions;
- follow-up browser validation confirmed the requested Setup grouping and immediate
  preview changes for 48–72px text sizing, right alignment, and 70% transparency;
- local Worker smoke checks returned `200` for the dashboard, self-contained overlay,
  and AI health route, failed the protected channel route closed without Access, and
  rejected a non-WebSocket overlay request with `426`; and
- the patched dependency tree uses Next.js 16.2.12, Wrangler 4.118.0, and Sharp 0.35.2
  and reports zero vulnerabilities through `npm audit`.

There is no claim yet for deployed Durable Object behavior, real OBS reuse, collaborator
takeover, Cloudflare secret configuration, or post-merge production routes.

Those outstanding items remain rollout gates. This section does not retroactively alter
the 20 July production baseline, which exercised the previous temporary-link design.

### Documentation and code-hygiene QA — 1 August 2026

The live-preview and Setup-layout branch received a final documentation, dependency,
export-surface, build, and responsive-browser review before stakeholder handoff:

- the documentation in that branch's scope was reconciled at the time with the two-column
  Setup layout, continuous appearance preview, reusable-link lifecycle, local validation
  commands, Cloudflare-only deployment path, and remaining rollout gates; historical ADR
  0001 remained explicitly superseded and ADR 0002 marked the disposable-room note as
  historical;
- the dependency audit found no removable package: each runtime and development package
  is used by application code, type checking, tests, lint, OpenNext, Wrangler, or build;
- six unnecessary public type/constant exports were removed or made module-private;
- the unused dependency/export/type audit passed after excluding file discovery for
  `open-next.config.ts`, a convention-loaded entry point whose use is confirmed by the
  successful OpenNext build;
- all 11 Vitest files and 60 tests passed, together with strict unused-local/parameter
  TypeScript checks, ESLint, Cloudflare type generation, Next.js production build,
  OpenNext Cloudflare bundle generation, `npm audit` with zero vulnerabilities, and
  `git diff --check`;
- real-browser QA at 1200px confirmed the left column contains Audio and languages,
  Church terminology and filtering, and Service details, while the right contains
  Caption preview, Caption appearance, and OBS Browser Source;
- appearance QA confirmed a live 72px preview, right alignment, and 70% transparency
  (`rgba(16, 24, 39, 0.3)`), with no browser warnings or errors; and
- the 390 × 844 mobile check preserved the same logical order in one column with a 390px
  document width and no horizontal overflow.

The local Next.js server cannot serve the custom Worker-owned `/api/live/channel` route;
its local `404` remains an expected environment limitation, not a deployed channel test.
The production gates listed below therefore remain unchanged.

### Monochrome operator UI QA — 1 August 2026

The subsequent UI-only branch replaced the coloured dashboard treatment with a flat,
minimal light monochrome system while preserving independently configurable OBS caption
colours. Validation produced:

- computed dashboard colours of off-white `rgb(245, 245, 242)`, white cards, and
  `rgb(17, 17, 17)` text and primary controls;
- the expected left/right Setup grouping at 1200px with document width equal to viewport
  width and no horizontal overflow;
- the same logical section order at 390 × 844 in one column, again with no horizontal
  overflow;
- a successful 48px-to-72px live preview update after the CSS redesign;
- no browser warnings or errors in the exercised Setup flow;
- 11 passing Vitest files with 60 tests, strict unused-local/parameter TypeScript checks,
  ESLint, `git diff --check`, Next.js production build, and OpenNext Cloudflare bundle
  generation.

This is local UI and build evidence only. It does not claim a deployed revision or retest
the authenticated Durable Object and OBS service journey.

### GPT-OSS 20B migration QA — 2 August 2026

The migration merged through PR #18 at `e680576` on 2 August 2026 and replaced Groq's
retiring Free-tier `llama-3.1-8b-instant` translation default with `openai/gpt-oss-20b`.
It also ignored a stale Llama dashboard override, used low reasoning effort with a
256-token completion ceiling, omitted irrelevant glossary mappings from the model prompt,
and changed capture to six-second chunks with a ceiling of 900 reserved transcription
attempts.

Local validation produced:

- 11 passing Vitest files with 64 tests, including replacement-model readiness, stale
  environment override migration, GPT-OSS request controls, non-GPT override behavior,
  relevant glossary selection, and derivation of 900 reserved transcription attempts from
  the six-second cadence;
- TypeScript, strict unused-local/parameter checks, ESLint, Cloudflare type generation,
  and `git diff --check` passes;
- successful Next.js 16.2.12 and OpenNext Cloudflare 1.20.1 production builds; and
- no dependency changes in the migration itself.

This section is merged-code/local migration evidence only. It does not claim a real Groq
`openai/gpt-oss-20b` response, deployed readiness, translation quality for any supported
language, six-second end-to-end latency, or a complete service within the model's lower
daily token allowance. Deployed-revision and real-provider verification remain
stakeholder gates.

### Documentation and code cleanup QA — 4 August 2026

Starting from merged commit `e680576`, the local cleanup branch:

- made the Vitest alias portable to filesystem paths containing spaces;
- derived speech-code detection from the supported-language catalogue and limited
  glossary relevance checks to the current caption plus up to four recent captions sent
  to translation;
- renamed the quota-consuming controller check as a transcription-attempt reservation;
- fixed the style-update expiry path so it clears stale public output and broadcasts the
  idle transition promised by the security and product contracts;
- displayed configured model identifiers from the health response and labelled the
  channel-wide overlay sequence and reserved transcription-attempt count accurately;
- removed four unnecessary public type exports and added one canonical local validation
  command; and
- set the Node.js 22.12 floor in package metadata and documentation and patched PostCSS
  from 8.5.19 to 8.5.23.

Local validation on Node.js 26.5.0 produced:

- 11 passing Vitest files with 67 tests;
- strict TypeScript, ESLint, Cloudflare type generation, and `git diff --check` passes;
- successful Next.js 16.2.12 and OpenNext Cloudflare 1.20.1 builds;
- `npm audit --omit=dev`: zero production vulnerabilities; and
- full `npm audit`: four remaining development-only vulnerabilities, three moderate and
  one high, in the Wrangler 4.118.0, Miniflare, and Undici 7.28.0 chain.

The current Wrangler release still pins the affected Undici version. `npm audit fix --force`
proposes incompatible Wrangler/OpenNext downgrades and was not applied. These
results are local working-tree evidence only: no deployment, real provider request,
physical microphone, or OBS production-machine test was performed.

### Operator layout standardization QA — 4 August 2026

The subsequent local UI pass retained the monochrome direction while standardizing the
operator layout and interaction hierarchy:

- aligned the four setup labels with the numbered panels and added a task-oriented setup
  introduction;
- introduced a consistent spacing, radius, control-height, surface, and shadow scale;
- raised form labels to 13px, desktop controls to 14px, mobile inputs to 16px, action
  targets to at least 44px, and disclosure summaries to 56px;
- replaced decorative disclosure plus/minus text with a visual chevron while adding
  level-three headings to the disclosure summaries;
- made the mobile header, setup stages, sticky Start action, and Live control menus reflow
  safely, including compact but visible blocking and takeover context;
- exposed the microphone level as a meter, expanded the live usage value text, labelled
  both settings asides, and made stopped-capture error state explicit; and
- mapped internal channel states to operator language such as **OBS ready** and renamed
  the live clear action **Clear OBS**.

Real-browser local validation covered 320, 390, 680, 681, 980, 981, and 1200px widths.
At every width, document width equalled viewport width. The 390px check kept all four
disclosures open without overflow; right/top alignment updated the preview to
`text-align: right` and `align-items: flex-start`; and the browser console reported no
warnings or errors. Local Next.js cannot exercise the custom Worker-owned channel route,
so the expected setup error was used to verify truthful blocking copy. The authenticated
Live/paused/takeover layouts still require a protected test deployment, and real OBS
remains a separate rollout gate.

### Deferred iOS feasibility shell QA — historical evidence from 4 August 2026

The local working tree adds an internal iOS 17-or-newer SwiftUI shell that hosts the
existing operator dashboard in `WKWebView`. It includes a native approved-audio preflight
with microphone and view-only paths, HTTPS configuration validation, exact-origin WebKit
main-frame microphone permission, allowlisted navigation, a bounded exact-origin native
status bridge, inactive/foreground capture reconciliation, a native microphone indicator,
an app icon, and a privacy manifest for the shell's app-local preference access. It does
not include a native caption engine, background-audio mode, backend credential, or new
data store. See [`ios/README.md`](../ios/README.md).

Local Apple-toolchain evidence:

| Gate | Result |
| --- | --- |
| Project generation | Pass — XcodeGen 2.46.0 generated `ChurchLiveCaption.xcodeproj` from `ios/project.yml` |
| Pre-hardening simulator build | Pass — Xcode 26.6, unsigned with `CODE_SIGNING_ALLOWED=NO` |
| Pre-hardening simulator unit tests | Pass — 3 tests on iPhone 17 simulator, iOS 26.5 |
| Current hardened simulator build/tests | Blocked — updated Swift sources compiled, then sandboxed CoreSimulator access stopped asset packaging; the four-test suite did not run |
| Pre-hardening generic-device archive | Pass only as a stale unsigned compile/archive check — arm64, version 0.1.0 build 1 |
| Code signing | Not performed — archive `Team` and `SigningIdentity` are empty and the app bundle is not signed |

The current four unit tests cover loading an HTTPS dashboard URL, rejecting an insecure
URL, normalizing default-port and exact-origin media trust, and allowing navigation only
to the dashboard or Cloudflare Access. Only the first three pre-hardening tests have a
completed simulator result. The earlier unsigned archive shows that the baseline Release
sources and resources could be assembled for generic iOS hardware; it predates the final
hardening, is not installable TestFlight evidence, and was not validated or uploaded
through Xcode Organizer.

No Apple Developer team, certificate, provisioning profile, App Store Connect app record,
privacy/export submission, internal tester group, upload, TestFlight processing, invite,
or installation was exercised. No physical iPhone or iPad test covered microphone
permission, WebKit `MediaRecorder` and `audio/mp4`, Cloudflare Access redirects/cookies,
protected APIs, WebSockets, OBS, portrait/landscape layout, backgrounding, device lock,
audio interruption, or network recovery. The default `APP_BASE_URL` still names the
existing Worker and does not prove that Worker contains this working revision.

### Mobile viewer, initial selectable buffer, and fixed-prompt QA — 23 August 2026

The web-focused branch adds one replaceable mobile link per service, a selectable
6-/9-/12-second speech buffer, and a fixed idiomatic translation system prompt. The mobile
capability is separate from both the reusable OBS token and the service controller. The
viewer receives only the latest moderated target caption and service status; it receives
no source text, history, style, OBS/controller credential, inference access, or mutation
route. End, expiry, takeover, and explicit viewer-link replacement revoke it.

Automated validation covered:

- separate viewer/controller/OBS tokens and hashes, fragment-only link construction,
  same-origin WebSocket routing, cross-protocol rejection, Access-protected replacement,
  source/style exclusion, idle-versus-paused synthetic tests, the 250-socket ceiling, and
  revocation on replacement, End, expiry, and takeover;
- normalization and quota invariants for exactly 6, 9, and 12 seconds, with the 900-attempt
  ceiling derived from the fastest option;
- prompt rules for idiomatic output, intentional repetition, quotation boundaries,
  incomplete speech, bounded recent context, relevant approved terms, Chinese script,
  and transcript-based prompt injection; and
- all existing channel, pipeline, request-boundary, provider, and layout support tests.

Final local gates on Node.js 26.5.0 produced:

| Gate | Result |
| --- | --- |
| Full unit suite | Pass — 11 files, 83 tests |
| Strict TypeScript | Pass, including unused local/parameter checks |
| ESLint | Pass |
| Next.js production build | Pass — Next.js 16.2.12 |
| OpenNext Cloudflare bundle | Pass — OpenNext Cloudflare 1.20.1, Wrangler 4.125.0 |
| Production and full dependency audits | Pass — 0 known vulnerabilities after compatible transitive patches |
| Whitespace/error diff check | Pass |

Real-browser local checks covered the Setup dashboard at the primary 1920 × 1080 operator
viewport, a 1200px intermediate width, 390px, and the declared 320px minimum. At 1920px,
the dashboard used its readable 1440px ceiling with 240px side gutters. The 9-second
Balanced option could be selected, retained its value while the view reflowed, and every
tested width had document width equal to viewport width. The self-contained Worker
`/view` page returned `200`, rendered at 390px and 320px without horizontal overflow, and
produced no browser console warnings or errors. Its synthetic token correctly failed to
open a stream because no local live service owned that token.

This is local source/build/UI evidence, not deployed proof. The local OpenNext preview
continues to warn that the internal Durable Object cannot be fully exercised in that
configuration. No real microphone cadence, Groq translation, active authenticated viewer
stream, Cloudflare Access bypass, multiple physical viewer devices, OBS machine, or
90-minute service was tested. Prompt tests validate request construction and policy, not
translation quality for an intended language pair.

### Live-editable translation settings and custom-prompt scope — 23 August 2026

A subsequent working-branch change makes source/target language, terminology, public
filters, speech buffer, and operator translation prompt editable during live or paused
operation. Edits remain drafts until the operator confirms a translation-session refresh.
The refresh design advances a server-owned revision, clears unfinished/queued audio,
recent translation context, previews, and latest public output, and rejects late captions
from an earlier revision. It is designed to preserve service identity, live/paused state,
original timer/expiry and usage, controller ownership, mobile-viewer link, and reusable
OBS link.

The prompt design replaces fixed operator guidance with a reviewed default or bounded
custom value beneath an immutable server safety/output envelope. Custom values are
trimmed, limited to 4,000 characters, and rejected for invalid type, unsupported control
characters, or overlength input rather than truncated. Caption, recent context, and terms
remain JSON-encoded untrusted data. Unsaved drafts stay in page memory. A custom prompt
uses unencrypted browser `localStorage` only after explicit save, while the full applied
translation snapshot uses unencrypted tab `sessionStorage` solely for same-tab
active-service recovery and is removed on End, takeover, or idle cleanup. The active
prompt crosses the protected translation/Groq boundary, but no translation setting enters
the Durable Object, viewer stream, or OBS.

The refreshed operator interface uses locally adapted React Bits navigation, spotlight,
and pending-state components without adding a runtime dependency. Upstream attribution
and licence conditions are recorded in `THIRD_PARTY_NOTICES.md`.

On 23 August 2026, `npm run validate` passed on the working branch: 103 tests across 12
files, strict TypeScript, ESLint, the optimized Next.js build, the OpenNext Cloudflare
bundle, and `git diff --check`. The Durable Object tests cover live and paused refresh,
preserved status/timestamps/counters/credentials/sockets, stale-publication rejection, and
request-ID-based idempotent retry. API/prompt tests cover bounded custom guidance and the
immutable request envelope.

Real-browser UI QA covered section navigation and explicit prompt save/reset/reload at a
1280 × 720 viewport. Rendered checks at 1920 × 1080 and 1200 × 900 preserved the intended
desktop layout. Exact 390 × 844 and 320 × 720 iframe viewports reported body
`scrollWidth === clientWidth`; translation and prompt controls remained readable and
reachable, and browser logs contained no application errors. Reduced-motion rules and
keyboard semantics were source-reviewed, but still need stakeholder assistive-technology
rehearsal. The local Next server has no Durable Object binding and Groq was unconfigured,
so the browser pass did not exercise a real live/paused refresh or microphone/provider
journey.

This remains local source/build/UI evidence. It makes no claim of Cloudflare deployment,
production configuration, real Groq quality, microphone/OBS hardware behavior, or a
completed live service.

### Live AI consumption dashboard scope — 23 August 2026

The operator workspace now reports service-local AI consumption without exposing usage
to the public mobile viewer or OBS channel. It separates the 90-minute service window,
the 900 reserved transcription-attempt ceiling, successful translation calls, and
translation prompt/completion/total tokens. A latest-response Groq snapshot reports only
the provider request-per-day and token-per-minute limit, remaining value, and reset value
returned in response headers. Missing or malformed provider fields render as unknown.
The snapshot is explicitly not described as account billing, spend, or complete
organization-wide consumption.

Automated coverage includes safe provider-usage normalization, dynamic rate-limit header
parsing, generic error handling, private controller/attempt forwarding, the pre-inference
one-time claim, an acknowledged Worker-to-room usage write, out-of-order snapshot
protection, Access authentication before the claim, terminal fail-closed error-code
propagation, Durable Object persistence and idempotency, refresh preservation, End and
takeover reset, expiry cleanup, stale-controller and unreserved-attempt rejection, and
protected API forwarding. Source review confirms that same-language and silent branches
bypass the translation call; those branches still lack a dedicated hook-level test.

On 23 August 2026, `npm run validate` passed on the working branch: 125 tests across 15
files, strict TypeScript, ESLint, the optimized Next.js build, the OpenNext Cloudflare
bundle, and `git diff --check`.

Real-browser UI QA opened the AI usage workspace at the primary 1920 × 1080 operator
viewport and confirmed the intended 1440px content ceiling with 240px side gutters. It
also checked 680px, 390px, and the declared 320px minimum. Every tested width kept the
document width equal to the viewport width, the dashboard remained reachable, and the
browser recorded no application errors. The local production Next.js server has no
Durable Object binding or real Groq response, so this pass exercised zero/unknown states
rather than live persistence, another-operator recovery, or genuine provider headroom.

This remains local source/build/UI evidence. It does not prove Cloudflare deployment,
real Groq token accounting, provider-account totals, billing, concurrent-service totals,
or a completed 90-minute production service.

## Not validated

- human review of the first Indonesian→English pair: all 30 prepared samples are pending;
- current isolated deployment setup, actual Free-plan evidence, Groq headroom/ZDR, and
  authenticated operator/public-path behavior identified in the readiness record;
- Cloudflare deployment of a reviewed revision containing these web changes;
- a real `openai/gpt-oss-20b` response from the deployed environment;
- deployed 6-/9-/12-second capture and the ceiling of 900 reserved transcription attempts;
- deployed live/paused translation refresh, stale-revision rejection, custom-prompt
  behavior, and preservation of service/controller/viewer/OBS identity;
- the current reusable Main-channel Durable Object, OBS, and active mobile-viewer journey;
- exact Cloudflare Access bypasses for `/view*` and `/api/live/viewer*`, late join with a
  real caption, concurrent physical viewers, link replacement, End/expiry, and takeover;
- legal ownership of the proposed Apple bundle identifier, Apple team enrollment,
  signing/provisioning, Organizer validation, App Store Connect upload, or TestFlight;
- installation and runtime behavior on a physical iPhone or iPad, including microphone,
  WebKit audio format, Access, API, WebSocket, background, lock, interruption, and network
  behavior;
- an isolated iOS demo Worker containing the exact reviewed revision and compatible
  Access, Groq, Durable Object, and OBS configuration;
- quality for every supported source/target language, accent, or Chinese script;
- theological correctness or representative biblical-name/reference accuracy;
- a complete 90-minute wall-clock session or session-expiry alarm;
- the intended physical microphone/audio interface and actual OBS streaming computer;
- device loss, long network loss, Access expiry, Groq quota/model outage, or Worker
  exhaustion;
- account-wide Cloudflare/Groq usage under concurrent applications; or
- archives and AI summaries, which are not implemented.

Follow [the stakeholder test guide](STAKEHOLDER_TEST_GUIDE.md) for the next controlled
test. A pilot go/no-go decision still needs owner-approved accuracy, latency, recovery,
privacy, and Free-plan thresholds.
