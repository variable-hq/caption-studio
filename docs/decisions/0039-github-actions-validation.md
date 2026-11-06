# ADR 0039: GitHub Actions validation of pull requests

Date: 7 November 2026. Status: accepted; it replaces the earlier rule that the repository has no GitHub Actions workflow, and keeps Cloudflare's connected Workers build as the only publisher.

## Decision

- One workflow, `.github/workflows/validate.yml`, runs `npm ci`, `npm run validate` and `npm audit --omit=dev` on pull requests whose base is `develop` or `main`. The job runs only in `variable-hq/caption-studio`; forks inherit the file and skip it.
- It is a check, not a replacement for local validation: contributors still run and list the commands in the pull request.
- It uses `pull_request` (never `pull_request_target`), read-only `contents` permission and no secrets, and a newer run on the same ref cancels an older one. It never builds for production, deploys or publishes.
- Browser QA (`npm run qa`, `npm run qa:runtime`) and the full `npm audit` stay local: the first needs Playwright tooling and a local Worker, the second reports development-dependency findings that are already known.
- Cloudflare Workers Builds still builds and deploys `main` only; per-branch preview builds stay off.

## Tradeoffs and verification

- Every pull request runs the two production builds a second time in GitHub-hosted compute (free for this public repository), in return for a result that does not depend on the contributor's machine or Node version.
- Making `validate` a required status check is a repository setting for the admin, not part of this change; until then it informs the review but does not block a merge.
- A workflow that needs credentials, deploys, or runs on other triggers needs its own decision.
- The first pull request that carries the workflow shows whether it runs and passes.
