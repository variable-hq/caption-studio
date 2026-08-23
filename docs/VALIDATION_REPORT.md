# Validation report — updated 23 August 2026

## Decision

The web working tree is ready for a controlled stakeholder test using synthetic or
explicitly approved audio. The currently deployed revision and runtime are not yet
verified against the mobile-viewer, configurable-buffer, prompt, reusable-channel, and
cleanup changes, so the deployed environment is not independently approved for an
unattended live service or production rollout.

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

## Scope and environment

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

### Mobile viewer, speech buffer, and translation prompt QA — 23 August 2026

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

Real-browser local checks covered the Setup dashboard at 1200px, 390px, and the declared
320px minimum. The 9-second Balanced option could be selected, retained its value while
the view reflowed, and every tested width had document width equal to viewport width. The
self-contained Worker `/view` page returned `200`, rendered at 390px and 320px without
horizontal overflow, and produced no browser console warnings or errors. Its synthetic
token correctly failed to open a stream because no local live service owned that token.

This is local source/build/UI evidence, not deployed proof. The local OpenNext preview
continues to warn that the internal Durable Object cannot be fully exercised in that
configuration. No real microphone cadence, Groq translation, active authenticated viewer
stream, Cloudflare Access bypass, multiple physical viewer devices, OBS machine, or
90-minute service was tested. Prompt tests validate request construction and policy, not
translation quality for an intended language pair.

## Not validated

- Cloudflare deployment of a reviewed revision containing these web changes;
- a real `openai/gpt-oss-20b` response from the deployed environment;
- deployed 6-/9-/12-second capture and the ceiling of 900 reserved transcription attempts;
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
