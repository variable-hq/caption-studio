# Agent instructions for church-live-caption

Reviewed 21 September 2026 against merged PR #49 (`d7a3db4`).

Machine-oriented index. Humans: see `docs/README.md`. This file only routes —
it never restates facts that live elsewhere, so it doesn't go stale when they
change. Read only the file(s) a row below points to for your current task;
don't read the full `docs/` tree unless the task is genuinely repo-wide.

## Where to look

| Task | Read |
|---|---|
| Live caption / transcription / translation / moderation behavior | `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md` |
| Credentials, tokens, Access, retention, data handling | `SECURITY.md` |
| Build, deploy, bindings, secrets, DB migrations | `docs/DEPLOYMENT.md` |
| UI visuals, tokens, theming, shared controls | `docs/DESIGN_SYSTEM.md`; run a UI change past `.agents/skills/web-design-guidelines/SKILL.md` |
| Why a past decision was made | `docs/decisions/*.md` — check each file's own status, several are superseded |
| What's already proposed, deferred, or a known gap | `docs/PILOT_IMPROVEMENTS.md`, `docs/ROADMAP.md`, `docs/GAP_ANALYSIS.md` |
| Contribution / PR / validation workflow | `CONTRIBUTING.md` |
| A file/component/hook is growing large, or you're deciding whether to split one | `CONTRIBUTING.md`'s "Code organization" section |
| Anything not above | `docs/README.md` — the full human-facing index |

## Doc taxonomy — respect this when reading or writing

- **Maintained guides** (`docs/README.md`'s "Maintained guides" table): current
  truth. Update the relevant one in the *same commit* as any code change it
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

## Validation

`npm run typecheck` (`:strict` adds unused-symbol checks) · `npm run lint` ·
`npm run check:adrs` (fails on duplicate ADR numbers) · `npm test` · `npm run
build` · `npm run build:cloudflare` · `npm run deploy:check` (dry run) ·
`npm run validate` runs the full chain.

`deploy:check` needs Node ≥22.12 (Wrangler's requirement, from `package.json`
`engines`). If it fails only on that, report it — don't change the
environment's Node/nvm version to force it through unless explicitly asked.

`npm run qa:*` scripts drive browser-based UI/accessibility checks and write
evidence under `docs/review-assets/<date>/`; not part of the required
validation chain above.

## Non-goals — don't add these unprompted

- CI (GitHub Actions or otherwise). `CONTRIBUTING.md` states this is
  intentional: Cloudflare's connected Workers build deploys `main` directly,
  and local validation is the contributor's responsibility.
- Automated doc/KB regeneration. Every maintained doc is hand-updated, in the
  same commit, by whoever makes the change it describes — see "Doc taxonomy"
  above.
