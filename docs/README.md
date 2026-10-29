# Documentation index

Reviewed 28 October 2026 against merged PR #75 (`080e6ca`). Maintained specifications
describe merged source, not an assurance that Cloudflare has deployed it. Use the deployment runbook and dated QA
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
| [Brand guidelines](BRAND_GUIDELINES.md) | The design baseline: voice and glossary, colour roles, typography, spacing, components, accessibility |
| [Design system](DESIGN_SYSTEM.md) | Tokens, light/dark themes, shared controls and the operator screen layouts |
| [Agent instructions](../AGENTS.md) | Machine-oriented routing index for AI agents; points here rather than duplicating it |

## Decisions and evaluation

- [Plan 1](LIVE_SESSION_FEEDBACK_PLAN_1.md) preserves the approved live-session design.
  Its implementation matrix and [ADR 0011](decisions/0011-service-history-and-optional-inference.md)
  identify delivered choices and remaining extensions.
- [ADR 0002](decisions/0002-free-cloud-first-ai.md) records the cloud-first live pipeline.
  [ADR 0001](decisions/0001-free-local-first-ai.md) is superseded historical context.
- [ADR 0003](decisions/0003-defer-apple-distribution.md) deferred Apple distribution;
  [ADR 0020](decisions/0020-remove-ios-shell.md) then removed the unused iOS shell.
- [ADR 0004](decisions/0004-first-visit-operator-tutorial.md) described the first-visit
  operator guide; [ADR 0021](decisions/0021-live-sermons-settings-operator-layout.md)
  superseded it with the Live, Sermons and Settings layout.
- [ADR 0022](decisions/0022-shared-church-setup-and-words-list.md) records one church setup
  shared by all operators, the Words list, one summary model and one buffer wait choice.
- [ADR 0023](decisions/0023-live-note-and-recent-outputs.md) records the immediate, bounded
  Live note prompt and the controlling tab's display-only Recent outputs strip.
- [ADR 0024](decisions/0024-session-metadata.md) records optional saved-sermon details and
  why they remain outside all model prompts.
- [ADR 0025](decisions/0025-worker-driven-background-timers.md) records worker-driven
  capture timers and continued sessions while the operator tab is backgrounded.
- [ADR 0012](decisions/0012-model-delegated-profanity-omission.md) records why profanity/slur
  handling was delegated to the translator, and the default-on operator control for faithful
  rendering when that omission rule is disabled.
- [ADR 0013](decisions/0013-manual-caption-archived-as-operator-notes.md) records why a
  paused manual caption is archived as a separate operator note instead of a transcript
  paragraph, and why the synthetic show-test caption is not archived at all.
- [ADR 0014](decisions/0014-operator-preferences-by-access-identity.md) records why
  operator configuration is bound to the Cloudflare Access identity in an
  `OperatorPreferences` Durable Object, with `localStorage` kept only as a fallback.
- [ADR 0015](decisions/0015-named-workspace-sized-for-its-operators.md) records why the
  Access tenant is named *BEST Church workspace* in the operator UI, why the saved-sermon
  copy states that every operator shares the archive, and why the watcher and paired-phone
  identity cap rose from 8 to 32.
- [ADR 0016](decisions/0016-client-side-output-buffer.md) records why the new output
  buffer (a pre-publish delay queue, distinct from the recording window) lives
  client-side in the controlling operator's tab.
- [ADR 0017](decisions/0017-configurable-output-buffer-dwell.md) records why the output
  buffer's dwell duration became a configurable, saved-default setting, superseding the
  fixed-3-second-dwell decision in ADR 0016.
- [ADR 0018](decisions/0018-inference-level-as-server-envelope-parameter.md) records why
  Inference and Sanitization are immutable translation-envelope parameters, including the
  boundary between meaning and cleanup and the rule against retrieving scripture from memory.
- [ADR 0019](decisions/0019-automatic-post-service-summary.md) records the per-operator
  history-saving default and the opt-in summary generated automatically when that
  operator ends a saved service.
- [ADR 0020](decisions/0020-remove-ios-shell.md) records the removal of the deferred iOS
  shell that ADR 0003 had retained.
- [Caption policy](evaluation/CAPTION_POLICY_DECISION.md) describes completion and filtering.
- [Indonesian→English review](evaluation/ID_EN_REVIEW.md) and its
  [synthetic fixtures](evaluation/id-en-synthetic.json) remain unscored.
- [Pilot improvements](PILOT_IMPROVEMENTS.md) contains deferred QR, saved-pack and live
  correction proposals; it is not the implemented archive correction workflow.

## Dated evidence and research

| Record | Scope |
| --- | --- |
| [Operator UI pass QA](OPERATOR_UI_PASS_QA.md) and [screenshots](review-assets/2026-09-20/README.md) | 20 September operator dashboard interaction and visual review |
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
