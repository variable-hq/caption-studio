# Roadmap

Reviewed 1 November 2026 against merged PR #85 (`863bf10`). Status describes source
implementation; deployment and church-approved quality require separate evidence.

## Implemented baseline

- Browser capture, selected audio interface, readiness checklist and Help page
  (replacing the six-step guide), multilingual Whisper/GPT-OSS pipeline with
  previous-chunk continuity context, one target at a time, 6s/10s/14s or Dynamic 6–14s
  recording windows (Dynamic pause cuts can be confirmed by Live draft punctuation),
  bounded context, Inference and Sanitization levels
  ([ADR 0018](decisions/0018-inference-level-as-server-envelope-parameter.md)) and the
  default-on Filter inappropriate language toggle.
- Reviewed terminology, script-aware public masking, incomplete-output skipping,
  one-time controller/attempt claims and acknowledged usage.
- Reusable OBS channel, latest-caption viewer (long captions shrink to fit the phone),
  shared styles, safe margins, explicit refresh, Pause/Resume/Clear screen/End, automatic
  pause when the tab closes, worker-driven timers while backgrounded, takeover, recovery and link
  rotation.
- Live overrides: Quick override for spelling, translation, recognition, or whole-caption
  hiding ([ADR 0028](decisions/0028-live-quick-overrides.md)); a paused Manual caption
  archived as a separate operator
  note ([ADR 0013](decisions/0013-manual-caption-archived-as-operator-notes.md)), an
  optional output buffer whose next caption can be paused, edited, cleared or
  fast-forwarded ([ADR 0016](decisions/0016-client-side-output-buffer.md),
  [ADR 0017](decisions/0017-configurable-output-buffer-dwell.md)), and Live note plus
  Recent captions ([ADR 0023](decisions/0023-live-note-and-recent-outputs.md)).
- One *BEST Church workspace* per Access tenant
  ([ADR 0015](decisions/0015-named-workspace-sized-for-its-operators.md)): every signed-in
  operator can watch the running service and take it over, reads the shared Sermons
  archive, and uses one church setup with the Settings › Words list
  ([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)); only the theme stays
  per operator ([ADR 0014](decisions/0014-operator-preferences-by-access-identity.md)).
  Optional automatic summary drafts at End
  ([ADR 0019](decisions/0019-automatic-post-service-summary.md)) and record-only session
  details ([ADR 0024](decisions/0024-session-metadata.md)).
- Optional operator-only Live drafts re-transcribe the current audio window within the
  existing reserved-attempt ceiling ([ADR 0027](decisions/0027-operator-only-live-drafts.md)).
- Live, Sermons and Settings dashboard for volunteer operators, with a readiness
  checklist, a pinned live control bar and bookmarkable screens
  ([ADR 0021](decisions/0021-live-sermons-settings-operator-layout.md)), following
  [Brand guidelines](BRAND_GUIDELINES.md) with light and dark themes.
- Repository deploy guard (`OPEN_NEXT_DEPLOY=true`), deployment dry run in validation,
  duplicate-ADR check, file- and export-level hygiene audits, and automated local browser/Axe
  QA through `npm run qa:*`.

## Plan 1 — merged and deployed, runtime and semantic acceptance pending

[PR #26](https://github.com/variable-hq/caption-studio/pull/26) merged on
13 September at `20597d8`. The initial deploy failed after a successful build; the
corrected deploy command completed at 08:05 UTC. [Deployment](DEPLOYMENT.md) records the fix.

Delivered under [ADR 0011](decisions/0011-service-history-and-optional-inference.md):

- Indonesian TB2 name vocabulary and explicitly approved recognition aliases.
- Paired phone remote controlling the capture system.
- Separate appending reader with shared 30-second paragraph processing.
- Immutable pre-service opt-in, private seven-day source history, corrections/exclusions,
  deletion and JSON export.
- Manual bounded summaries, editable guidance, source references and review-gated export.
- Numeric usage across services for a rolling 30 days, unknown outcomes and capacity
  estimates (the capacity planner was later removed by ADR 0022); optional AI budgets
  independent of content deletion.
- Shared operator/remote/reader/viewer UI conventions and local synthetic QA.

Workers AI remains disabled unless explicitly configured. Fallback reader text works
without it; summaries then report unavailable. Models require quality evaluation before
real sermon processing. Exact TB2 text retrieval is not implemented.

## Next release gates

1. Verify deployed runtime behavior of the latest `main` deployment (merges through
   `080e6ca` deployed via Workers Builds on 26–28 October; see [Deployment](DEPLOYMENT.md))
   and narrow reader/static Access bypasses. Access was moved to the renamed
   `caption-studio` hostname on 26 October and operator sign-in works; recheck each
   bypass path there. Only `main` builds: preview-branch builds were turned off on
   28 October because `wrangler preview` is not set up for Durable Objects.
2. Verify actual provider plans, limits and data controls. Keep optional AI off until
   its availability/privacy/quality checks pass.
3. Complete [Indonesian→English review](evaluation/ID_EN_REVIEW.md): all 30 samples are
   still unscored. Add approved audio for Saul/name ambiguity and chunk boundaries, plus
   the Inference, Sanitization, filter and Live note checks in
   [G03](GAP_ANALYSIS.md#g03--p0-language-and-theological-quality).
4. Rehearse the capture system, separate OBS computer, paired operator phone, a second
   watching operator and both audience surfaces with synthetic or consented speech.
5. Exercise Clear/Pause/refresh and output-buffer races, takeover from a watcher, host
   acknowledgement, reader expiry/replacement, summary grounding (manual and automatic),
   deletion during work, and seven-/30-day retention.
6. Measure a complete service, queue/output-buffer/audience delay, recovery, provider
   usage and actual expiry. Obtain operator usability and assistive-technology feedback.
7. Record the owner's limited-pilot decision with approved languages, operators, limits,
   stop criteria and rollback procedure.

Use [Gap analysis](GAP_ANALYSIS.md) and the [stakeholder script](STAKEHOLDER_TEST_GUIDE.md).
Local tests and screenshots do not constitute these deployment, hardware or quality gates.

## Deferred improvements

- Audio-track loss (ended/mute), device hot-swap and fuller browser lifecycle recovery
  beyond the automatic tab pause; measured queue/audience latency.
- Correcting a caption already on screen, or review before every publication. Today the
  output buffer lets an operator edit or clear the next caption before it shows, Quick
  block hides captions containing a word, a paused Manual caption replaces the output,
  and Live note guides upcoming translations; none edits a displayed OBS caption, and
  archive source corrections change only private summary input.
- Local QR joining, subject to the measured need in [Pilot improvements](PILOT_IMPROVEMENTS.md).
  (Reusable terminology is now the shared Settings › Words list.)
- Display density/line policy, speaker identification and meaningful non-speech cues.
- Authorized TB2 passage retrieval, provenance and licensing; additional summary providers
  only after a separate data/cost decision.
- Multi-church workspaces, administrator roles, simultaneous target languages, library
  search, human interpreter handoff and Cantonese input.
- Paid/realtime providers only after comparable approved tests and explicit spending controls.

## Native app

The browser is the only client/release path. [ADR 0003](decisions/0003-defer-apple-distribution.md)
deferred Apple distribution and [ADR 0020](decisions/0020-remove-ios-shell.md) removed the iOS shell; it remains
recoverable from git history. Building a native app needs a new owner decision.
Historical unsigned evidence remains in the [validation record](VALIDATION_REPORT.md).
