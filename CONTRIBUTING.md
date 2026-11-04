# Contributing

Last reviewed 5 November 2026 against merged PR #115 (`f11e649`).

Thank you for helping build Caption Studio. The repository is private and has no
open-source license; access to collaborate does not grant permission to redistribute
the code or service data.

## Before you begin

- Read [README.md](README.md), [SECURITY.md](SECURITY.md), and the relevant document
  under `docs/`. [AGENTS.md](AGENTS.md) routes each kind of task to the guide to read.
- Use an issue for significant features, bugs, product decisions, or provider changes.
- Use only synthetic audio or recordings and transcripts explicitly approved for this
  project.
- Follow [the stakeholder test guide](docs/STAKEHOLDER_TEST_GUIDE.md) for deployed
  rehearsals and keep the test evidence content-free.
- Never put credentials, active OBS/mobile-viewer URLs, private names, or service content
  in Git, issues, pull requests, test fixtures, screenshots, logs, or chat.

## Set up the project

Requirements: Node.js 22.12 or newer and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Local secrets belong only in ignored environment files. Ask an owner for access to the
deployment environment; do not ask anyone to paste a secret into an issue or message.

Run these checks before requesting review:

```bash
npm run validate
npm audit --omit=dev
npm audit
```

`npm run validate` runs the duplicate-ADR-number check (`npm run check:adrs`), tests with
one worker, strict TypeScript, ESLint, both production builds, a deployment dry run, and
the diff check, sequentially. `deploy:check` needs Node 22.12 or newer (Wrangler's
requirement, in `package.json` `engines`); if only that step fails on an older Node,
report it rather than skipping it. A documentation-only pull request may run just
`git diff --check`, plus `npm run check:adrs` when `docs/decisions/` changes. Record
production and full audit results separately. Never use `npm audit fix --force` without
an explicit dependency-compatibility review.

This repository intentionally has no GitHub Actions workflow. Local validation is a
required contributor responsibility: include the commands and results in the pull
request. After merge, Cloudflare's connected Workers build—not GitHub—builds and deploys
`main`; per-branch preview builds are off because previews omit Durable Objects (see
[Deployment](docs/DEPLOYMENT.md#connected-cloudflare-build)). Do not add a GitHub-hosted
build or deployment workflow without an explicit owner decision about duplicated compute,
credentials, and cost.

Use the Worker runtime QA procedure when a change affects Cloudflare or audience routes.
`npm run preview` requests a remote Workers AI proxy and needs Wrangler credentials plus
Access service authentication for a protected preview domain. Deployment itself avoids
that proxy; see [Deployment](docs/DEPLOYMENT.md). An isolated local configuration omitting
the AI binding can run the custom Worker and Durable Objects without provider calls; see
[Plan 1 QA](docs/LIVE_SESSION_PLAN_1_QA.md). Production Access, cloud alarms, real-device
capture, WebSockets, service expiry, and controller takeover still need a protected
Cloudflare rehearsal. After changing bindings, run `npm run cf-typegen` and review the
generated diff before committing it.

For visible operator-console changes, follow the [brand guidelines](docs/BRAND_GUIDELINES.md)
for copy, layout and controls, and use the tokens and shared control classes in the
[design system](docs/DESIGN_SYSTEM.md); do not add hard-coded colours or one-off button
styles. Check the change against `.agents/skills/web-design-guidelines/SKILL.md`. Test in both the light and dark themes at the primary 1920 × 1080 operator
viewport, then at a 1200px intermediate width and 390px and 320px mobile widths in a
real browser. `npm run qa` automates all four widths: 1920, 1200, 390 and 320px, and adds a dark colour-contrast pass at 390 and 1200px.
Confirm keyboard focus, reachable controls, no horizontal overflow, and continuous
preview updates while appearance ranges or colours are being changed. Test `/view` at
both mobile widths when latest-viewer behavior changes; run `npm run qa:experience`
for reader, remote, archive or usage UI changes. `npm run qa` (alias for `npm run qa:all`)
installs the isolated Playwright/Axe tooling under `CAPTION_QA_TOOLS_DIR` (default: a
temporary directory), starts a local dev server on `CAPTION_QA_PORT` (default 3100; the run
stops if that port is already in use), and runs the mocked operator areas
(`qa:operator:live`, `qa:operator:settings`, `qa:operator:presets`, `qa:operator:transcripts`; `qa:operator` runs them in turn) and
`qa:experience` concurrently, each width in its own browser context (at most four at a time). Axe scans run at 1200px and 320px; the other widths keep the overflow and
wording checks. Screenshots are written only with `CAPTION_QA_SHOTS=1`; each operator area
writes `failure-<area>-<pass>-<width>.png` for each failing width, and the experience suite writes no failure
screenshot. `CAPTION_QA_COLOR_SCHEME=dark` runs every width in dark with
all checks; without it, the default run adds a dark pass that checks colour contrast only, on the screens a plain address opens (the Live address, the Settings sections except Presets, the Presets address, and the Transcripts and Help addresses in the operator areas; and the reader, viewer, remote, transcripts and usage addresses in the experience suite).
Browser suites assert what only a browser can prove: reachability, overflow, Axe, focus, and state held across screens or a running session. Wording that depends only on a preset's terms or message overrides is asserted per format in vitest (`src/i18n/format-wording.test.ts`). A new operator check goes in the area whose screen it asserts (`scripts/qa/operator-live.mjs`, `operator-settings.mjs`, `operator-presets.mjs` or `operator-transcripts.mjs`); shared mocks and the width loop live in `scripts/qa/operator-harness.mjs`.
Run those two suites individually only when the server and tooling are already up, with
`CAPTION_QA_TOOLS_DIR` set (and `CAPTION_QA_PORT` if it is not 3100). Next.js allows one `next dev` per project directory, so a second run on another
port must come from a separate checkout of the repo; running both from one checkout fails at server start. If headless Chromium's fake
microphone hangs at **Start captions**, set `CAPTION_QA_STUB_MIC=1`. `npm run qa:runtime`
remains a separate local Wrangler rehearsal on port 8787; see
[Plan 1 QA](docs/LIVE_SESSION_PLAN_1_QA.md#runtime-rehearsal). Use only synthetic caption
text in screenshots or recordings.

## Branch and commit workflow

Create a short-lived branch from the latest `main`:

- `feat/short-description`
- `fix/short-description`
- `refactor/short-description`
- `docs/short-description`
- `chore/short-description`

AI agents use the same prefixes. Keep commits focused, with a
matching conventional subject (`feat: …`, `fix: …`, `docs: …`), and leave `npm run
typecheck:strict`, `npm run lint` and `npm test` passing at every commit, so each one can
be reviewed and reverted on its own. Update the maintained guide
that describes a change in the same commit as the code. Before opening the pull request,
search every maintained guide in [the index](docs/README.md#maintained-guides), including
`README.md` and `SECURITY.md`, for the feature's names and identifiers, and correct any
claim the change makes false, not only the guide you set out to update. Do not rewrite another
contributor's branch without agreement. Merge pull requests with a merge commit (GitHub's
default), as every PR since #33 has, so each merge on `main` names its PR.

## Pull requests

A pull request should explain:

- what changed and why;
- user and operator impact;
- privacy, security, biblical-context, quota, and OBS implications;
- tests and manual checks performed: the commands run and their results for the head
  commit (a documentation-only pull request may list just `git diff --check`, plus
  `npm run check:adrs` when `docs/decisions/` changes);
- assumptions made, and any deviation from the agreed scope (issue or ADR);
- screenshots or recordings for visible behavior, using synthetic data; and
- known limitations and follow-up work.

Keep a pull request small enough to review in one sitting, with one outcome. Work found
to be needed outside it is proposed as a follow-up, not added to it. Prefer the design
with the lower risk level when both meet the goal, and put a critical or high part in its
own pull request.

Start the template's **Risk review** section with the change's risk level. When two
levels both seem to fit, choose the higher one.

- **Critical**: cannot easily be undone, such as a one-way migration or rename of stored
  data, wire names or a Durable Object; or touches a trust boundary (Access, tokens,
  retention, logged content); or removes or loosens a live safety limit (the recording
  window cap, attempt ceilings, rate-limit backoff). State why it is needed now, the
  rollback plan (or "forward only" and why), and the deploy precondition, such as no
  live session running.
- **High**: changes a contract or the live path with a compatibility or rollback path:
  a stored shape that still reads old data, a Worker route or binding, live capture, cut
  or draft behavior, model prompts, parsing untrusted input, or quota, metering and
  entitlements. State what old data and already-open pages see, and what reverting
  leaves behind.
- **Moderate**: a new or reworked operator or audience capability within existing
  contracts, or functionality other code depends on.
- **Low**: contained, revertible on its own, and nothing depends on it.
- **None**: no runtime effect (documentation, comments), or tests and QA scripts only.

From moderate up, add two or three lines on what could break, what it affects, and how
it is contained. The repository owner may waive any of these on a pull request by saying
so on it.

Request review before merging whenever repository settings allow it. A change to languages, biblical reference material,
retention, filtering, public URLs, roles, providers, models, or AI behavior must record
the decision and tradeoffs in the issue, pull request, or an ADR. For an ADR, take the
next number after the highest in `docs/decisions/`, follow the shape in
[AGENTS.md](AGENTS.md#recording-a-decision-adr), and add it to the
[documentation index](docs/README.md); `npm run check:adrs` rejects duplicate numbers.

## Engineering rules

- New operator-facing UI text belongs in `src/i18n/messages/en.ts` with a matching
  Indonesian entry in `src/i18n/messages/id.ts`; use typed, component-namespaced keys
  and named placeholders. Keep messages whole instead of concatenating translated
  fragments. Indonesian copy remains pending native-speaker review until a fluent
  reviewer approves it.

- Keep provider credentials and Cloudflare Access verification server-side.
- Fail closed in production when Access configuration is missing.
- Preserve the separation between protected source text and moderated public text.
- Do not make `/api/ai/*`, `/api/live/channel*`, `/api/live/experience/*`, or
  `/operator/mobile` publicly accessible. Reader/static bypasses are listed in
  [Deployment](docs/DEPLOYMENT.md#access-paths).
- Treat `/overlay*` and `/api/live/overlay*` as public network paths protected by an
  explicitly rotatable reusable channel token.
- Treat `/view*` and `/api/live/viewer*` as public network paths protected by a different,
  replaceable per-service viewer token. Never accept OBS and viewer tokens interchangeably.
- Bound user input, audio, prompt context, queues, session duration, and provider calls.
- Enforce request limits against bytes actually received before parsing JSON or multipart
  bodies; do not trust `Content-Length` alone.
- Preserve approved default-off pre-service history consent, seven-day content retention
  and independent rolling 30-day numeric usage. Additional retention, providers or paid
  fallback require a separate owner decision.
- Do not log raw audio, caption text, glossary content, Access JWTs, OBS tokens, or mobile
  viewer links.
- Add failure and recovery tests for changes to live behavior.
- A fix includes a test that fails without it. Do not edit a passing test to make a change
  fit unless the behavior it covers is meant to change, and say so in the pull request.
- Prefer deterministic post-processing for approved terms and public filtering.

## Code organization

A large file earns its size through genuine cohesion, not accumulation. Before adding to
one, check whether the addition belongs to that file's single responsibility or is a new
one that belongs beside it. Concrete precedent: `src/app/page.tsx` and
`src/live/use-live-caption-session.ts` were split this way — see their git history for
worked examples of every rule below.

- **Extract a component when a JSX region is self-contained and nameable**: it renders one
  clear thing with a bounded, typed prop interface. Group related props into a nested
  object (`outputBuffer: {...}`, `obs: {...}`) instead of flattening 15+ props onto
  one component.
- **Extract a hook only if the sub-concern doesn't need circular access back into its
  caller.** If it does, resolve it with a ref the caller keeps current every render
  (`publishBufferedEntryRef` in `use-output-buffer-queue.ts` is the worked example) —
  don't pull more of the caller's state into the hook just to avoid the cycle. If the
  coupling is fundamental (the concern can't act without calling back into several
  caller-owned functions), it isn't actually separable; leave it inline rather than
  forcing a seam that doesn't reduce real coupling.
- **Never extract to hit a line-count target.** A 10-20 line cluster (a bit of state plus
  one or two callbacks) is appropriately-sized inline code, not debt. A new file is a
  lookup indirection every future reader pays for; that cost needs a real payoff — reuse,
  independent testability, or a genuinely overloaded surrounding file — to be worth it.
- **Build a node where it's rendered.** Don't thread a pre-built `ReactNode` through props
  unless it's genuinely rendered from two or more mutually exclusive call sites (the Start
  card vs. Quick fixes, e.g. `outputBufferPanel` in `page.tsx`). If a shared node is down to one
  caller after a refactor, inline it there instead of leaving the indirection behind.
- **A structural refactor changes no behavior, full stop.** Never bundle a logic change
  into a "move" commit. Verify every extraction with `typecheck:strict`, `lint`, the full
  test suite, and `build`: a pure move typechecks clean and touches no test assertions.
- Rough signal, not a gate: a component or hook past ~150-200 lines, or one file visibly
  doing more than one nameable job, is worth a second look before growing it further —
  not automatically worth splitting today.

## Review checklist

- The change matches the documented scope or updates that scope explicitly.
- No dead code, unused dependency, generated build output, or secret is introduced.
- Convention-loaded entry files such as `open-next.config.ts` are retained even when a
  static unused-file scanner cannot observe the tool that loads them.
- All external inputs have type, size, and allowed-value validation.
- Source, translated, and public forms are not accidentally mixed.
- Operator-only endpoints still require Cloudflare Access.
- OBS/latest-viewer credentials cannot reach inference, controls or history. The reader
  can access only its service's published paragraphs; remote credentials scope commands
  and never grant inference/source access. No audience surface receives private source.
- The OBS token remains read-only, encrypted for protected recovery, explicitly
  rotatable, and absent from logs; controller credentials remain tab-scoped and short-lived.
- Free-plan behavior fails visibly without silently switching to paid usage.
- Documentation matches implemented behavior and distinguishes merged/deployed/rehearsed
  status. Preserve dated evidence as history; link current guides from [the index](docs/README.md).
- New or grown files follow [Code organization](#code-organization) above; a large,
  multi-responsibility file added or extended without comment is a finding, not a style nit.
- Relevant automated and manual checks pass.

Group review findings as **Blocking** (a bug, regression, scope deviation, or missing
test or documentation), **Minor** (a small maintainability or consistency gap) and
**Nits** (wording and formatting), each with its file and symbol. Every finding is
addressed before merge unless the repository owner waives it on the pull request.

## Security reports

Do not open a public issue for a vulnerability or exposed credential. Follow the private
reporting process in [SECURITY.md](SECURITY.md).
