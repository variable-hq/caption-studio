# ADR 0040: `develop` as the integration branch, `main` as the release branch

Date: 8 November 2026. Status: accepted; it replaces the earlier practice of branching from and merging feature pull requests straight into `main`.

## Decision

- `develop` is GitHub's default branch. Every feature, fix, docs and chore branch starts from the latest `develop`, and its pull request targets `develop`.
- `main` stays the Cloudflare Workers Builds production branch, so every merge into it builds and deploys. It receives only release pull requests from `develop`, opened once every feature merged since the last release is confirmed (`npm run validate` and `npm run qa` on `develop`, plus `npm run qa:runtime` when the batch touches Cloudflare or audience routes).
- Release pull requests merge with a merge commit, never squash or rebase, so `main` stays an ancestor of `develop` and the next release replays nothing.
- Production fixes take the same path: into `develop`, then a release. There is no direct-to-`main` hotfix lane.
- The Cloudflare build of `main` is the release gate: each one marks a new deployed version, and nothing else produces one. `develop` is never built by Cloudflare, and per-branch preview builds stay off ([ADR 0039](0039-github-actions-validation.md), `docs/DEPLOYMENT.md`).

## Tradeoffs and verification

- One deploy per confirmed batch instead of one per merged pull request: fewer production builds and no half-finished feature set going live, at the cost of slower delivery for a single urgent fix and a release step someone has to perform.
- Because `develop` has no Cloudflare build, the Worker runtime (Durable Objects, Access, Workers AI) is first exercised in production unless `npm run qa:runtime` is run locally on `develop` before the release.
- Branch protection on `develop` and `main` (set by the repository admins on 8 November 2026) requires a pull request, one approval and the `validate` check, and blocks direct pushes. Only admins can merge, and they can bypass the rules; GitHub does not check that a pull request into `main` comes from `develop`, so the release approver does.
- Pull requests #118–#120 were the first to target `develop`; `git rev-list origin/develop..origin/main` being empty after each release confirms the histories stayed aligned.
