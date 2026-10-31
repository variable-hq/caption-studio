# Agent instructions for Caption Studio

Reviewed 31 October 2026 against merged PR #81 (`ff97386`).

Machine-oriented index. Humans: see `docs/README.md`. This file mostly routes
and avoids restating facts that live elsewhere, so it doesn't go stale when they
change; "Easy-to-miss traps" records only what lint and tests don't catch. Read
only the file(s) a row below points to for your current task; don't read the
full `docs/` tree unless the task is genuinely repo-wide.

## Working in a fork

If `git remote -v` shows an `upstream` remote, this checkout is a fork. Branch
from a freshly fetched `upstream/main`, not the fork's `main`:

```sh
git fetch upstream && git switch -c <type>/<name> upstream/main
```

Fork-only commits on the fork's `main` (planning notes, local config) must not
appear in, or be cited by, a feature branch's commits, PR text, code, or docs.

## Where to look

| Task | Read |
|---|---|
| Live caption / transcription / translation / moderation behavior | `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md` |
| Credentials, tokens, Access, retention, data handling | `SECURITY.md` |
| Build, deploy, bindings, secrets, DB migrations, Cloudflare build checks on PRs | `docs/DEPLOYMENT.md` |
| UI visuals, copy, tokens, theming, shared controls | `docs/BRAND_GUIDELINES.md` (the rules every UI change follows), then `docs/DESIGN_SYSTEM.md` for token values and classes; run a UI change past `.agents/skills/web-design-guidelines/SKILL.md` |
| Adding or changing operator-facing UI text | `src/i18n/messages/en.ts` and `id.ts`; ADR 0030 |
| Why a past decision was made | `docs/decisions/*.md` — check each file's own status, several are superseded |
| What's already proposed, deferred, or a known gap | `docs/PILOT_IMPROVEMENTS.md`, `docs/ROADMAP.md`, `docs/GAP_ANALYSIS.md` |
| Contribution / PR / validation workflow | `CONTRIBUTING.md` |
| A file/component/hook is growing large, or you're deciding whether to split one | `CONTRIBUTING.md`'s "Code organization" section |
| Anything not above | `docs/README.md` — the full human-facing index |

## Doc taxonomy — respect this when reading or writing

- **Maintained guides** (`docs/README.md`'s "Maintained guides" table): current
  truth. Update the relevant one, including its `Reviewed <date> against merged
  PR #<n> (<sha>)` stamp, in the *same commit* as any code change it
  describes — this repo's history shows that's the actual practice, not a
  follow-up task.
- **Decisions** (`docs/decisions/*.md`, ADRs): why, not what. May be
  superseded — the file says so if it is.
- **Dated evidence** (`docs/README.md`'s "Dated evidence and research" table,
  e.g. `*_QA.md`, `VALIDATION_REPORT.md`): a frozen snapshot as of the date in
  its own header. Never treat as current, never edit its claims — if
  something in it is now wrong, correct it in a maintained doc, don't rewrite
  history.

## Recording a decision (ADR)

1. `ls docs/decisions/` and use the next integer after the **highest** number
   present — don't assume from memory. (Two unrelated, independently-merged
   PRs once both claimed `0012`; nothing caught it until someone checked by
   hand.) `npm run check:adrs` fails the build if two files ever collide
   again.
2. Shape: `# ADR NNNN: <title>`, then a one-line `Date: ... Status: ...`
   sentence — every existing ADR now follows this. Body sections: use
   `## Decision` + `## Tradeoffs and verification` for a single, simple
   decision (the common case). A decision with genuinely distinct sub-topics
   or a history of amendments (see `0002`, `0011`) may use `## Context` plus
   additional headings instead — that's an accepted alternative shape for
   that kind of decision, not drift to fix.
3. Add it to `docs/README.md`'s "Decisions and evaluation" list — an ADR
   missing from that index was the second bug found alongside the numbering
   collision.

## Easy-to-miss traps

- New or changed operator-facing UI text goes through `useT()` with a key in
  both `src/i18n/messages/en.ts` and `id.ts`; keep sentences whole. The
  `react/jsx-no-literals` lint rule covers only a few files, so lint won't flag
  missed text. Screens not yet migrated are ADR 0030 follow-up phases; don't
  migrate them unless asked.
- Vitest collects only `src/**/*.test.ts`; a `.test.tsx` file silently never
  runs. Put testable logic in `.ts` modules.
- `custom-worker.ts`, not the Next app, is the deployed entry and serves several
  routes itself. Check `docs/ARCHITECTURE.md` before adding a Next route, and
  `docs/DEPLOYMENT.md` before adding a Durable Object or binding.
  `cloudflare-env.d.ts` is generated and tracked — regenerate it with
  `npm run cf-typegen`, never hand-edit.
- `npm run dev` serves the Next routes only and never exercises
  `custom-worker.ts` or the Durable Objects. Use `npm run qa:runtime` for that
  (see `CONTRIBUTING.md`).

## Validation

`npm run typecheck` (`:strict` adds unused-symbol checks) · `npm run lint` ·
`npm run check:adrs` (fails on duplicate ADR numbers) · `npm test` · `npm run
build` · `npm run build:cloudflare` · `npm run deploy:check` (dry run) ·
`npm run validate` runs the full chain.

`deploy:check` needs Node ≥22.12 (Wrangler's requirement, from `package.json`
`engines`). If it fails only on that, report it — don't change the
environment's Node/nvm version to force it through unless explicitly asked.

`npm run qa` starts a dev server on port 3100 and runs `qa:operator` and
`qa:experience`: browser UI, responsive-overflow and Axe checks against mocked
APIs, with screenshots in ignored `test-results/`. It bootstraps its own
Playwright/Axe tooling under `CAPTION_QA_TOOLS_DIR` (see `CONTRIBUTING.md`). If
headless Chromium's fake microphone never resolves on your machine, set
`CAPTION_QA_STUB_MIC=1` and say so in the PR. Run it for any UI change; it is
not part of the required validation chain above. Committed evidence goes under
`docs/review-assets/<date>/` only when deliberately recorded.

## Non-goals — don't add these unprompted

- CI (GitHub Actions or otherwise). `CONTRIBUTING.md` states this is
  intentional: Cloudflare's connected Workers build deploys `main` directly,
  and local validation is the contributor's responsibility.
- Per-branch Cloudflare preview builds. They are switched off on purpose; see
  `docs/DEPLOYMENT.md` before proposing to re-enable them.
- Automated doc/KB regeneration. Every maintained doc is hand-updated, in the
  same commit, by whoever makes the change it describes — see "Doc taxonomy"
  above.
