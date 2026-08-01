# Validation report — updated 1 August 2026

## Decision

The prototype is ready for a controlled stakeholder test using synthetic or explicitly
approved audio. It is not approved for an unattended live service or production rollout.

## Scope and environment

The production Worker at <https://church-live-caption.lukas-ka.workers.dev/> was tested
through its deployed UI and public OBS overlay paths on 20 July 2026. The test exercised
English source to Indonesian output with virtual synthetic audio. The exact deployed Git
revision could not be independently read from Cloudflare during this check, so this
report does not claim revision provenance.

## Live smoke-test results

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

## Code and build QA

The stakeholder-readiness branch adds deterministic audio-device selection tests and
clarifies the processing-latency metric. Final QA on 20 July 2026 produced:

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

The local preview emits the documented warning that the internal Durable Object cannot
run in the same local Worker configuration. Durable Object behavior was therefore
validated against the deployed environment, not the local preview.

### Live-control and safe-margin extension

The subsequent control extension adds atomic Pause/Resume/Clear/test behavior, confirmed
End, and 0–20% OBS safe margins. The feature-branch validation completed on 20 July 2026
includes:

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

The current feature branch replaces per-service URLs with one encrypted, reusable Main
channel and separates guided Setup from the streamlined Live console. Local automated
validation covers idempotent channel creation, AES-GCM token recovery, Access and body
bounds, server-assigned sequence order, idle/paused tests, End-with-URL-retention,
service expiry, controller conflicts, confirmed takeover, stale-controller rejection,
explicit rotation, and the self-contained overlay contract.

Current branch evidence on 1 August 2026:

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

- all maintained current documentation was reconciled with the two-column Setup layout,
  continuous appearance preview, reusable-link lifecycle, local validation commands,
  Cloudflare-only deployment path, and remaining rollout gates; historical ADR 0001 stays
  explicitly superseded and ADR 0002 now marks the disposable-room note as historical;
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

## Not validated

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
