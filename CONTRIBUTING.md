# Contributing

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
- Never put credentials, active overlay URLs, private names, or sermon content in Git,
  issues, pull requests, test fixtures, screenshots, logs, or chat.

## Set up the project

Requirements: Node.js 20.9 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Local secrets belong only in ignored environment files. Ask an owner for access to the
deployment environment; do not ask anyone to paste a secret into an issue or message.

Run these checks before requesting review:

```bash
npm test
npm run typecheck
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
npm run lint
npm run build
npx opennextjs-cloudflare build
npm audit
git diff --check
```

This repository intentionally has no GitHub Actions workflow. Local validation is a
required contributor responsibility: include the commands and results in the pull
request. After merge, Cloudflare's connected Workers build—not GitHub—builds and deploys
`main`. Do not add a GitHub-hosted build or deployment workflow without an explicit owner
decision about duplicated compute, credentials, and cost.

Use `npm run preview` when a change affects the Cloudflare runtime or the self-contained
OBS route. It verifies the bundle and non-Durable-Object routes, but the current OpenNext
local preview cannot run this internal Durable Object; test channel creation, WebSockets,
service expiry, controller takeover, and OBS-link rotation in a protected Cloudflare test
deployment. After changing bindings, run `npm run cf-typegen` and review the generated
diff before committing it.

For visible operator-console changes, test at 1200px desktop and 390px mobile widths in
a real browser. Confirm keyboard focus, reachable controls, no horizontal overflow, and
continuous preview updates while appearance ranges or colours are being changed. Use
only synthetic caption text in screenshots or recordings.

## Branch and commit workflow

Create a short-lived branch from the latest `main`:

- `feature/short-description`
- `fix/short-description`
- `docs/short-description`
- `chore/short-description`

Automated work may use `agent/short-description`. Keep commits focused and prefer squash
merging so `main` has a readable history. Do not rewrite another contributor's branch
without agreement.

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
- Do not make `/api/ai/*` or `/api/live/channel*` publicly accessible.
- Treat `/overlay*` and `/api/live/overlay*` as public network paths protected by an
  explicitly rotatable reusable channel token.
- Bound user input, audio, prompt context, queues, session duration, and provider calls.
- Enforce request limits against bytes actually received before parsing JSON or multipart
  bodies; do not trust `Content-Length` alone.
- Do not add paid fallback, billing-enabled services, or persistent sermon storage
  without an explicit owner decision.
- Do not log raw audio, caption text, glossary content, Access JWTs, or overlay tokens.
- Add failure and recovery tests for changes to live behavior.
- Prefer deterministic post-processing for approved terms and public filtering.

## Review checklist

- The change matches the documented scope or updates that scope explicitly.
- No dead code, unused dependency, generated build output, or secret is introduced.
- Convention-loaded entry files such as `open-next.config.ts` are retained even when a
  static unused-file scanner cannot observe the tool that loads them.
- All external inputs have type, size, and allowed-value validation.
- Source, translated, and public forms are not accidentally mixed.
- Operator-only endpoints still require Cloudflare Access.
- Overlay clients cannot reach inference, operator controls, or historical content.
- The OBS token remains read-only, encrypted for protected recovery, explicitly
  rotatable, and absent from logs; controller credentials remain tab-scoped and short-lived.
- Free-plan behavior fails visibly without silently switching to paid usage.
- Documentation matches the implemented behavior.
- Relevant automated and manual checks pass.

## Security reports

Do not open a public issue for a vulnerability or exposed credential. Follow the private
reporting process in [SECURITY.md](SECURITY.md).
