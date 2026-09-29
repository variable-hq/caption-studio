# Contributing

Last reviewed 14 September 2026 against merged PR #33 (`abae57b`).

Thank you for helping build Church Live Caption. The repository is private and has no
open-source license; access to collaborate does not grant permission to redistribute
the code or sermon data.

## Before you begin

- Read [README.md](README.md), [SECURITY.md](SECURITY.md), and the relevant document
  under `docs/`.
- Use an issue for significant features, bugs, product decisions, or provider changes.
- Use only synthetic audio or recordings and transcripts explicitly approved for this
  project.
- Follow [the stakeholder test guide](docs/STAKEHOLDER_TEST_GUIDE.md) for deployed
  rehearsals and keep the test evidence content-free.
- Never put credentials, active OBS/mobile-viewer URLs, private names, or sermon content
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

`npm run validate` runs tests, strict TypeScript, ESLint, both production builds, a
deployment dry run, and the diff check sequentially, with one test worker. Record
production and full audit results separately. Never use `npm audit fix --force` without
an explicit dependency-compatibility review.

This repository intentionally has no GitHub Actions workflow. Local validation is a
required contributor responsibility: include the commands and results in the pull
request. After merge, Cloudflare's connected Workers build—not GitHub—builds and deploys
`main`. Do not add a GitHub-hosted build or deployment workflow without an explicit owner
decision about duplicated compute, credentials, and cost.

Use the Worker runtime QA procedure when a change affects Cloudflare or audience routes.
`npm run preview` requests a remote Workers AI proxy and needs Wrangler credentials plus
Access service authentication for a protected preview domain. Deployment itself avoids
that proxy; see [Deployment](docs/DEPLOYMENT.md). An isolated local configuration omitting
the AI binding can run the custom Worker and Durable Objects without provider calls; see
[Plan 1 QA](docs/LIVE_SESSION_PLAN_1_QA.md). Production Access, cloud alarms, real-device
capture, WebSockets, service expiry, and controller takeover still need a protected
Cloudflare rehearsal. After changing bindings, run `npm run cf-typegen` and review the
generated diff before committing it.

For visible operator-console changes, use the tokens and shared control classes in the
[design system](docs/DESIGN_SYSTEM.md); do not add hard-coded colours or one-off button
styles. Test in both the light and dark themes at the primary 1920 × 1080 operator
viewport, then at a 1200px intermediate width and 390px and 320px mobile widths in a
real browser.
Confirm keyboard focus, reachable controls, no horizontal overflow, and continuous
preview updates while appearance ranges or colours are being changed. Test `/view` at
both mobile widths when latest-viewer behavior changes; run `npm run qa:experience`
for reader, remote, archive or usage UI changes. The `qa:*` scripts need
`CAPTION_QA_TOOLS_DIR` and a local server as described in [Plan 1 QA](docs/LIVE_SESSION_PLAN_1_QA.md). Use only synthetic caption text
in screenshots or recordings.

## Branch and commit workflow

Create a short-lived branch from the latest `main`:

- `feature/short-description`
- `fix/short-description`
- `docs/short-description`
- `chore/short-description`
- `agent/short-description`
- `codex/short-description`

Use the `agent/` or `codex/` prefixes for automated work. Keep commits focused and prefer
squash merging so `main` has a readable history. Do not rewrite another contributor's
branch without agreement.

## Pull requests

A pull request should explain:

- what changed and why;
- user and operator impact;
- privacy, security, biblical-context, quota, and OBS implications;
- tests and manual checks performed;
- screenshots or recordings for visible behavior, using synthetic data; and
- known limitations and follow-up work.

Keep a pull request small enough to review. Request review before merging whenever
repository settings allow it. A change to languages, biblical reference material,
retention, filtering, public URLs, roles, providers, models, or AI behavior must record
the decision and tradeoffs in the issue, pull request, or an ADR.

## Engineering rules

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
- Prefer deterministic post-processing for approved terms and public filtering.

## Code organization

A large file earns its size through genuine cohesion, not accumulation. Before adding to
one, check whether the addition belongs to that file's single responsibility or is a new
one that belongs beside it. Concrete precedent: `src/app/page.tsx` and
`src/live/use-live-caption-session.ts` were split this way — see their git history for
worked examples of every rule below.

- **Extract a component when a JSX region is self-contained and nameable**: it renders one
  clear thing with a bounded, typed prop interface. Group related props into a nested
  object (`outputBuffer: {...}`, `startBar: {...}`) instead of flattening 15+ props onto
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
  unless it's genuinely rendered from two or more mutually exclusive call sites (a
  collapsed vs. expanded panel, e.g. `masterControlsBar`). If a shared node is down to one
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

## Security reports

Do not open a public issue for a vulnerability or exposed credential. Follow the private
reporting process in [SECURITY.md](SECURITY.md).
