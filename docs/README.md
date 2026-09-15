# Documentation index

Reviewed 14 September 2026 against merged PR #33 (`abae57b`). Maintained specifications
describe merged source, not an
assurance that Cloudflare has deployed it. Use the deployment runbook and dated QA
records to establish release evidence.

## Maintained guides

| Document | Purpose |
| --- | --- |
| [Project README](../README.md) | Features, surfaces, lifecycle, limits and setup |
| [Product specification](PRODUCT_SPEC.md) | Current behavior and acceptance |
| [Architecture](ARCHITECTURE.md) | Components, APIs, storage and failure boundaries |
| [Deployment](DEPLOYMENT.md) | Build/deploy commands, bindings, secrets and Access paths |
| [Security](../SECURITY.md) | Data handling, credentials and incident response |
| [Contributing](../CONTRIBUTING.md) | Branch/PR workflow and required QA |
| [Stakeholder test guide](STAKEHOLDER_TEST_GUIDE.md) | Protected rehearsal and content-free evidence |
| [Roadmap](ROADMAP.md) / [Gap analysis](GAP_ANALYSIS.md) | Outstanding work and release gates |
| [Design system](DESIGN_SYSTEM.md) | Tokens, light/dark themes, shared controls and the resizable navigation |

## Decisions and evaluation

- [Plan 1](LIVE_SESSION_FEEDBACK_PLAN_1.md) preserves the approved live-session design.
  Its implementation matrix and [ADR 0011](decisions/0011-service-history-and-optional-inference.md)
  identify delivered choices and remaining extensions.
- [ADR 0002](decisions/0002-free-cloud-first-ai.md) records the cloud-first live pipeline.
  [ADR 0001](decisions/0001-free-local-first-ai.md) is superseded historical context.
- [ADR 0003](decisions/0003-defer-apple-distribution.md) retains the
  [iOS experiment](../ios/README.md) as deferred research.
- [ADR 0004](decisions/0004-first-visit-operator-tutorial.md) describes the operator guide.
- [ADR 0012](decisions/0012-model-delegated-profanity-omission.md) records why profanity/slur
  handling was delegated to the translator instead of the deterministic filter alone.
- [ADR 0013](decisions/0013-manual-caption-archived-as-operator-notes.md) records why a
  paused manual caption is archived as a separate operator note instead of a transcript
  paragraph, and why the synthetic show-test caption is not archived at all.
- [Caption policy](evaluation/CAPTION_POLICY_DECISION.md) describes completion and filtering.
- [Indonesian→English review](evaluation/ID_EN_REVIEW.md) and its
  [synthetic fixtures](evaluation/id-en-synthetic.json) remain unscored.
- [Pilot improvements](PILOT_IMPROVEMENTS.md) contains deferred QR, saved-pack and live
  correction proposals; it is not the implemented archive correction workflow.

## Dated evidence and research

| Record | Scope |
| --- | --- |
| [Docked status bar QA](DOCK_STATUS_BAR_QA.md) | 15 September dark theme, keyboard, zoom, real-runtime audience surfaces; fixes for bar overlap, theme flash and copy |
| [Service-panel UI and QA](SERVICE_PANEL_UX_QA.md) and [screenshots](review-assets/2026-09-13-service-panel/README.md) | 13 September collapsible right controls, focused workspace pages and responsive validation |
| [Dashboard UI and QA](DASHBOARD_UI_QA.md) and [screenshots](review-assets/2026-09-13/README.md) | 13 September dashboard navigation, market references and responsive validation |
| [Export hygiene QA](EXPORT_HYGIENE_QA.md) | 14 September export-level dead-code audit, env template and QA script wrappers |
| [Cleanup/deployment QA](CLEANUP_DEPLOY_QA.md) | 13 September documentation/file audit and deploy fix |
| [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md) | 13 September unit/build, mocked UI and real local Durable Object checks |
| [Earlier validation](VALIDATION_REPORT.md) | July–12 September results for earlier candidates |
| [Earlier deployment investigation](DEPLOYMENT_REHEARSAL_READINESS.md) | 12 September account/setup snapshot; not a current deployment runbook |
| [UI review](UI_UX_REVIEW.md) and [screenshots](review-assets/2026-09-12/README.md) | 12 September operator/tutorial evidence |
| [Benchmark research](BENCHMARK_RESEARCH.md) | 11 September external workflow comparison and then-current baseline |

Ignored `test-results/` paths in historical prose identify local artifacts, not files
available in a fresh clone. Committed synthetic screenshots are linked separately.
Third-party [notices](../THIRD_PARTY_NOTICES.md), skill
[provenance](../.agents/skills/web-design-guidelines/PROVENANCE.md), and its pinned reference
are retained unchanged because they document attribution and contributor tooling.
