# Roadmap

Reviewed 14 September 2026 against merged PR #33 (`abae57b`). Status describes source
implementation; deployment and
church-approved quality require separate evidence.

## Implemented baseline

- Browser capture, selected audio interface, six-step guide, multilingual Whisper/GPT-OSS
  pipeline, one target at a time, 6/9/12/15/18-second buffers and bounded context.
- Reviewed terminology, script-aware public masking, incomplete-output skipping,
  one-time controller/attempt claims and acknowledged usage.
- Reusable OBS channel, latest-caption viewer, shared styles, safe margins, explicit
  refresh, Pause/Resume/Clear/End, a paused manual-caption override archived as a
  separate reader/archive note, takeover, recovery and link rotation.
- Overview-first dashboard with grouped sidebar navigation, hash-addressable sections,
  a phone drawer, and a collapsible right service panel with a compact live bar.
- Repository deploy guard (`OPEN_NEXT_DEPLOY=true`), deployment dry run in validation,
  file- and export-level hygiene audits, and `npm run qa:*` wrappers.

## Plan 1 — merged and deployed, runtime and semantic acceptance pending

[PR #26](https://github.com/lukaskawira/church-live-caption/pull/26) merged on
13 September at `20597d8`. The initial deploy failed after a successful build; the
corrected deploy command completed at 08:05 UTC. [Deployment](DEPLOYMENT.md) records the fix.

Delivered under [ADR 0011](decisions/0011-service-history-and-optional-inference.md):

- Indonesian TB2 name vocabulary and explicitly approved recognition aliases.
- Paired phone remote controlling the capture computer.
- Separate appending reader with shared 30-second paragraph processing.
- Immutable pre-service opt-in, private seven-day source history, corrections/exclusions,
  deletion and JSON export.
- Manual bounded summaries, editable guidance, source references and review-gated export.
- Numeric usage across services for a rolling 30 days, unknown outcomes and capacity
  estimates; optional AI budgets independent of content deletion.
- Shared operator/remote/reader/viewer UI conventions and local synthetic QA.

Workers AI remains disabled unless explicitly configured. Fallback reader text works
without it; summaries then report unavailable. Models require quality evaluation before
real sermon processing. Exact TB2 text retrieval is not implemented.

## Next release gates

1. Record the build ID and Worker version for the latest merge, verify deployed runtime
   behavior, and narrow reader/static Access bypasses. The deploy guard and documentation
   cleanup merged in PR #28.
2. Verify actual provider plans, limits and data controls. Keep optional AI off until
   its availability/privacy/quality checks pass.
3. Complete [Indonesian→English review](evaluation/ID_EN_REVIEW.md): all 30 samples are
   still unscored. Add approved audio for Saul/name ambiguity and chunk boundaries.
4. Rehearse the capture computer, separate OBS computer, paired operator phone and both
   audience surfaces with synthetic or consented speech.
5. Exercise Clear/Pause/refresh races, host acknowledgement, reader expiry/replacement,
   summary grounding, deletion during work, and seven-/30-day retention.
6. Measure a complete service, queue/audience delay, recovery, provider usage and actual
   expiry. Obtain operator usability and assistive-technology feedback.
7. Record the owner's limited-pilot decision with approved languages, operators, limits,
   stop criteria and rollback procedure.

Use [Gap analysis](GAP_ANALYSIS.md) and the [stakeholder script](STAKEHOLDER_TEST_GUIDE.md).
Local tests and screenshots do not constitute these deployment, hardware or quality gates.

## Deferred improvements

- Audio-track loss and browser lifecycle recovery, measured queue/audience latency.
- Live public-caption correction or review before publication; current source corrections
  change private summary input and do not edit an already displayed OBS caption.
- Local QR joining and reusable terminology packs, subject to the measured needs in
  [Pilot improvements](PILOT_IMPROVEMENTS.md).
- Display density/line policy, speaker identification and meaningful non-speech cues.
- Authorized TB2 passage retrieval, provenance and licensing; additional summary providers
  only after a separate data/cost decision.
- Multi-church workspaces, roles, persistent shared profiles, simultaneous target languages,
  library search, human interpreter handoff and Cantonese input.
- Paid/realtime providers only after comparable approved tests and explicit spending controls.

## Deferred native experiment

The browser is the only active client/release path. [ADR 0003](decisions/0003-defer-apple-distribution.md)
retains the [iOS shell](../ios/README.md) as research and excludes Apple signing,
TestFlight and native builds from current gates. Reopening needs a new owner decision.
Historical unsigned evidence remains in the [validation record](VALIDATION_REPORT.md);
it does not establish current backend compatibility.
