# Church Live Caption: gap analysis and improvement plan

Reviewed 14 September 2026 against merged PR #33 (`abae57b`). Plan 1 (`20597d8`) deployed
successfully after the Access proxy fix; later merges have no recorded deployment. Deployment identity and commands are in [Deployment](DEPLOYMENT.md).
Local checks pass; this is not a production, semantic-quality or accessibility certificate.

## Assessment

The implementation includes fast captions, separate latest-viewer/reader/remote surfaces,
opt-in seven-day private journals, manual summaries and rolling 30-day usage. The largest
remaining gaps concern language quality, actual account configuration, physical devices,
recovery and full-service measurement. Optional Workers AI remains default-off.

The first Indonesian→English [30-sample review](evaluation/ID_EN_REVIEW.md) remains
unscored. [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md) covers 217 tests, mocked browser checks
and real local Durable Objects. [Cleanup QA](CLEANUP_DEPLOY_QA.md) records the newer
build/deploy validation; the [older validation report](VALIDATION_REPORT.md) is historical.

## Ranked gaps

P0 must be resolved before a live pilot. P1 must be resolved or explicitly constrained in
the pilot. P2 follows measured demand and a scoped decision.

### G01 — P0: inference authorization — implemented; protected runtime verification pending

Both inference stages now require Access, current controller and a one-time reserved
attempt. Canonical routing, Pause/refresh invalidation and fail-closed accounting pass
local tests. The client sends both required headers. Verify these boundaries on the
deployed candidate without publishing credentials or spending quota to test a rejection.
See [Worker dispatch](../src/live/inference-request.ts).

### G02 — P0: complete deployed service rehearsal

The corrected build deployed `20597d8`; that does not prove its microphone, OBS, Access
routes, remote acknowledgement, reader lifecycle, alarms or 90-minute endurance.
Run [the stakeholder script](STAKEHOLDER_TEST_GUIDE.md) on intended hardware with approved
data and record the final Worker version. Recheck narrow public reader/static bypasses;
the 12 September account investigation is not current runtime evidence.

### G03 — P0: language and theological quality

Evaluate source and translation separately, including Saul/name ambiguity, negation,
numbers, references, accents and chunk boundaries. The operator must approve the 30-sample
set and ordinary-error threshold; no unresolved invented scripture, reversed meaning or
critical name/number error may be averaged away. Add reader/summary grounding and prompt
injection cases before enabling optional AI. No exact TB2 passage source is authorized.

### G04 — P1: queue and audience latency

The displayed processing metric starts after dequeue and excludes capture time, queue
wait, output buffer hold time, and audience rendering. Retain content-free timestamps if adding metrics, then
measure word-onset-to-display and utterance-end-to-display separately. Fixed 6- to 18-second
windows and 30-second reader alarms do not guarantee semantic boundaries or a latency SLA.
Set approved delay/drop thresholds before the duration test.

### G05 — P1: device and browser recovery

Audio-device enumeration and recorder errors exist; explicit audio-track ended/mute
handling, hot-swap and complete browser suspension/recovery need focused review and
physical tests. Test lost input, restored tab, network loss, Access expiry and cancellation
during provider work. Require deliberate reselection/Resume after recovery. The phone
remote cannot confirm microphone stopping without host acknowledgement.

### G06 — P1: multilingual filtering review

Native `Intl.Segmenter` boundaries for Han/Hiragana/Katakana and Unicode whole-word
rules elsewhere pass synthetic tests. Real term/false-positive review remains. Missing
segmentation blocks affected publication. Cross-caption, homophone and unusual spelling
coverage is not guaranteed. Reapply/review masking after optional reader phrasing.

### G07 — P1: output readability and completeness

Nonempty `stop` completions are required; incomplete output is skipped with usage kept.
This does not certify complete speech or correct meaning. Test long Latin/CJK output at
font/safe-margin extremes in OBS and both phone surfaces. A line-density policy, speaker
identification and meaningful non-speech cues remain open accessibility decisions.

### G08 — P1: actual provider capacity and data controls

The deployment now keeps numeric admissions/outcomes for 30 days across services.
Unknown consumption stays unknown and content deletion never resets usage. Optional AI
has conservative daily reservations and per-service call caps. These guards cannot see
other apps or establish billing/account allowance. Verify actual Free plans, Groq ZDR,
Cloudflare content settings and provider headroom before approved audio/AI tests.
Estimate full-service usage from observations, not a monthly multiplication alone.

### G09 — P1: human usability and accessibility

Synthetic browser/Axe checks pass at 1920, 1200, 390 and 320px for operator, tutorial,
remote, reader, archives and usage. Physical Safari/phones, actual browser zoom,
screen readers and volunteer comprehension remain unverified. Have representative
operators configure a service and explain the difference between Clear, Remove and Delete.
Verify that pending phone commands cannot be mistaken for physical microphone confirmation.

### G10 — P2: market feature gaps need demand and a scope decision

Local QR joining, saved terminology packs and live public-caption correction remain
proposals in [Pilot improvements](PILOT_IMPROVEMENTS.md). Private source correction,
passage removal, archives and manual summaries are already implemented under Plan 1.
Additional providers, exact Bible retrieval, workspace roles and simultaneous targets
need separate decisions. The [11 September benchmark](BENCHMARK_RESEARCH.md) is dated
research, not a description of current feature availability.

### G11 — P1: private-history and optional-AI production acceptance

Rehearse opt-in consent, source preservation, partial-history failures, independent
pagination, removal/exclusion, summary citations, interrupted jobs, deletion races,
seven-day content expiry and 30-day usage expiry. Application deletion cannot recall
exports or promise immediate physical erasure of provider recovery copies. Account
backups and participant notice need explicit operational review.

## Next sequence

1. Record the deployment of the latest merge (the deploy command is preserved in
   `package.json` since PR #28) and verify actual route boundaries/configuration
   without weakening Access.
2. Approve the first language corpus and provider/account settings.
3. Run a short protected rehearsal with the capture computer, separate OBS computer,
   paired operator phone, latest viewer and appending reader.
4. Test duration/recovery first with fixed synthetic channel output and optional AI off,
   then separately measure approved synthetic audio and optional inference.
5. Record an owner go/no-go decision with language, consent, latency, quality, budget and
   stop criteria. Feature expansion does not substitute for these gates.

The [roadmap](ROADMAP.md) carries deferred work. The preserved iOS experiment remains
outside web release gates under [ADR 0003](decisions/0003-defer-apple-distribution.md).
