# Documentation cleanup and deployment QA

13 September 2026. Related issue: #27. Source baseline: merged Plan 1,
`20597d8840f6ae5a88414ef124c85579118c4774` (PR #26).

## Deployment failure and recovery

The original connected build `41f0f3b4-1bd0-41fe-999a-14b5eb9b5483` completed Next.js
and OpenNext compilation. Its deploy failed because OpenNext's environment helper opened
a remote proxy for the AI binding against the Access-protected Worker domain.

The installed Wrangler 4.125.0 and OpenNext 1.20.1 source both use `OPEN_NEXT_DEPLOY=true`
to prevent delegation back into OpenNext. The repository now uses that guard for direct
deployment of its already-built custom Worker and includes `deploy:check` in validation.
The default OpenNext config has no cache preload or skew-protection mapping to populate.
Those features or adapter upgrades require revisiting this deployment path.

After the local dry run passed with all bindings, the connected Cloudflare deploy command
was changed from `npx wrangler deploy` to `OPEN_NEXT_DEPLOY=true npx wrangler deploy`.
The build command, Access policies and runtime configuration were preserved.

The retried build `89991f51-3a53-4d1e-a96f-4faad55de6aa` reports success for `20597d8`.
Its deploy completed at 08:05 UTC (16:05 SGT). The deployments API independently confirmed
version `fd21393f-be16-4a63-a2ff-8933b2641474` at 100% traffic. Logs list CaptionRoom,
SermonJournal, AiUsageLedger, AI and assets. No microphone, service-control action or AI
inference was used to verify deployment. See [the runbook](DEPLOYMENT.md) for reproduction
and post-merge checks.

## Validation

| Check | Result |
| --- | --- |
| `npm run validate` | Pass: 217 tests in 19 files, strict TypeScript, ESLint, Next.js build, OpenNext build, deployment dry run and whitespace check |
| `npm audit --omit=dev` | Zero known vulnerabilities |
| Full `npm audit` | Zero known vulnerabilities |
| Wrangler deployment dry run | All three Durable Objects, AI and assets present; no remote Access proxy or upload |
| Connected Cloudflare retry | Successful build and deploy of merged `20597d8` |
| Markdown file/heading links | Pass: 32 Markdown files, 189 local file/heading links; local-only historical artifacts are prose paths instead of broken links |
| Runtime file reachability | All 57 non-test source/type/CSS files reachable from runtime or convention-loaded entry points |
| Vendored guideline integrity | SHA-256 matches the pinned provenance record; license and source unchanged |

Validation ran sequentially with one Vitest worker on Node 22.12.0. Cloudflare's successful
build used Node 24.18.0. No dependency or product UI change was made; the prior
[Plan 1 browser/runtime results](LIVE_SESSION_PLAN_1_QA.md) were not rerun or relabelled
as new evidence. Native builds are deferred and were not run for removal of an empty file.

## Markdown audit

Reviewed the 29 pre-existing project Markdown files and added the documentation index,
deployment runbook and this QA record. Current README, architecture, product, security,
roadmap, gap and stakeholder guidance now include reader/remote behavior, default-off
history consent, seven-day content retention, source corrections/exclusions, manual
summaries, separate rolling usage, provider gating and deployed versus rehearsed status.

The original Plan 1 proposal retains its design alternatives beneath a first-release
implementation matrix. Historical validation, deployment investigation, benchmark and UI
evidence are explicitly dated and linked to current guides. Their past test results and
research are preserved. The 30 Indonesian→English samples remain unscored.

Contributor/PR instructions, decision records, native notes, screenshot indexes,
third-party notices and vendored skill/provenance/reference Markdown were also reviewed.
Vendor/license text, accepted native deferral and the still-pending evaluation sheet did
not need content changes. No old QA result is presented as proof of a new physical test.

## File and dependency audit

The audit starts from `git ls-files`, then resolves TypeScript imports/re-exports and CSS
imports through the installed TypeScript compiler. Roots include Next.js pages/layout/
routes, custom-worker, configuration/type entry points and the four standalone QA scripts.
Tests are separate roots for validation rather than evidence that production code is used.
Strict unused-local/parameter checks supplement file reachability. Dynamic/conventional
loading, npm scripts, native project inputs, asset references and documentation uses
were checked manually before any removal.

| Files | Disposition and reason |
| --- | --- |
| Empty Xcode `WorkspaceSettings.xcsettings` | Removed; contained only an empty plist dictionary. Ignore its regenerated copy; project settings remain in `ios/project.yml` and the generated project |
| Web source and React Bits CSS/components | Retained; no orphaned runtime file found |
| `custom-worker.ts`, OpenNext/Next/Wrangler configs and binding declarations | Retained; convention-loaded build/runtime/type inputs |
| Four QA scripts and synthetic evaluation JSON | Retained; documented manual QA and pending human evaluation |
| Native sources, assets, tests, project and npm scripts | Retained as expressly deferred research under [ADR 0003](decisions/0003-defer-apple-distribution.md) |
| Synthetic screenshots and dated records | Retained as linked review evidence |
| GitHub templates/CODEOWNERS, skills, provenance and licenses | Retained for contribution workflow, tooling and attribution |
| Runtime and development dependencies | Retained; each supports runtime, build, type checking, lint, tests or deployment; no package added |

This establishes file-level reachability and documented purpose, not proof that every
export is minimal. Build output, local credentials, ignored QA artifacts and dependencies
are excluded from the tracked-file cleanup.

## Remaining evidence

The successful upload does not establish application Access behavior, real microphone/OBS
delivery, physical phones, cloud-alarm timing, full-service endurance, account-wide Free
capacity, provider data settings, or semantic reader/summary quality. Optional Workers AI
stays gated. Use the [stakeholder guide](STAKEHOLDER_TEST_GUIDE.md) for those checks;
exact TB2 passage access still needs an authorized source.
