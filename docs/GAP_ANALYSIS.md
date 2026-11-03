# Caption Studio: gap analysis and improvement plan

Reviewed 3 November 2026 against merged PR #96 (`f74a25f`). Plan 1 (`20597d8`) deployed
successfully after the Access proxy fix; merges through `080e6ca`, including the rename
to the `caption-studio` Worker, deployed via Workers Builds on 26–28 October, but none has
a recorded session rehearsal. Only `main` builds; preview-branch
builds were turned off on 28 October. Deployment identity and commands are in [Deployment](DEPLOYMENT.md).
Local checks pass; this is not a production, semantic-quality or accessibility certificate.

## Assessment

The implementation includes fast captions, separate latest-viewer/reader/remote surfaces,
opt-in seven-day private journals, manual and optional automatic summaries, rolling 30-day
usage, a shared church setup and Transcripts archive, watching/takeover by any workspace
operator, and live overrides (Quick override, paused Manual caption, output buffer, Live
note). The largest remaining gaps concern language quality, actual account configuration,
physical devices, recovery and full-session measurement. Optional Workers AI remains
default-off.

The first Indonesian→English [30-sample review](evaluation/ID_EN_REVIEW.md) remains
unscored. [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md) covers 217 tests, mocked browser checks
and real local Durable Objects. [Cleanup QA](CLEANUP_DEPLOY_QA.md) records the newer
build/deploy validation; the [older validation report](VALIDATION_REPORT.md) is historical.
`npm run qa:*` now drives local browser/Axe checks; it is not physical-device evidence.

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

Deployments through `080e6ca` succeeded; that does not prove microphone, OBS, Access
routes, remote acknowledgement, reader lifecycle, alarms or 90-minute endurance.
Run [the stakeholder script](STAKEHOLDER_TEST_GUIDE.md) on intended hardware with approved
data and record the final Worker version. Recheck narrow public reader/static bypasses
on the renamed `caption-studio` hostname (Access moved there on 26 October); the
12 September account investigation is not current runtime evidence. Include a second
operator watching and taking over, and the Manual caption, output buffer and Live note
controls in use.

### G03 — P0: language and theological quality

Evaluate source and translation separately, including Saul/name ambiguity, negation,
numbers, references, accents and chunk boundaries. The operator must approve the 30-sample
set and ordinary-error threshold; no unresolved invented scripture, reversed meaning or
critical name/number error may be averaged away. Add reader/summary grounding and prompt
injection cases before enabling optional AI. No exact TB2 passage source is authorized.
Also include Inference Level's compounding edge cases, not just its common case: multiple
unclear words in one caption, an unclear word that is also profane, and the
single-indecipherable-word-caption fallback landing at each of Low/Balanced/High — the
unclear-word handling is now a multi-step cascade running at `reasoning_effort: "low"`
on a 20B model (`src/ai/server/groq.ts`), and these are the scenarios most likely to
silently drop a step rather than fail loudly. Review Sanitization's combined case (fillers,
explicit and quoted self-correction, emphatic repetition, call-and-response, an unclear word,
and profanity) at each Sanitization level with Balanced Inference, plus High Sanitization at
Low and High Inference. Also review a quiet-spoken synthetic sample at High and record the
content-free filtered-segment count. These model-quality checks are manual; constructed-prompt
tests do not replace them.
The default-on Filter inappropriate language toggle also needs real-model checks for a slur,
strong profanity, mild crude language, a vulgar euphemism, profanity as the only word, and
quoted profanity; with the toggle Off, confirm faithful rendering and that `outputLooksUnsafe`
does not reject the result. This Filter validation remains manual and pending.
Live note is trusted operator guidance inside the server envelope; check with real models
that a note cannot change the language direction or justify invented or completed content.

### G04 — P1: queue and audience latency

The displayed processing metric starts after dequeue and excludes capture time, queue
wait, the output buffer's optional 1–5 second wait, and audience rendering. Retain content-free timestamps if adding metrics, then
measure word-onset-to-display and utterance-end-to-display separately. The 6–14-second cap
options, Dynamic's pause heuristic and 30-second reader alarms do not guarantee semantic
boundaries or a latency SLA.
Set approved delay/drop thresholds before the duration test. Separately, and not a pilot
gate: the output buffer's advancement polls every 200ms on a fixed `setInterval` rather
than a single timer scheduled to the next entry's due time; low-priority, deferred.

### G05 — P1: device and browser recovery

Audio-device enumeration and recorder errors exist, and the operator tab pauses itself on
close/navigation. Explicit audio-track ended/mute handling, hot-swap and complete browser
suspension/recovery still need focused review and physical tests. Test lost input, restored
tab, network loss, Access expiry and cancellation during provider work. Require deliberate
reselection/Resume after recovery. The phone remote cannot confirm microphone stopping
without host acknowledgement.

### G06 — P1: multilingual filtering review

Native `Intl.Segmenter` boundaries for Han/Hiragana/Katakana and Unicode whole-word
rules elsewhere pass synthetic tests. Real term/false-positive review remains. Missing
segmentation blocks affected publication. Cross-caption, homophone and unusual spelling
coverage is not guaranteed. Reapply/review masking after optional reader phrasing.

### G07 — P1: output readability and completeness

Nonempty `stop` completions are required; incomplete output is skipped with usage kept.
This does not certify complete speech or correct meaning. The phone viewer now shrinks a
long caption down to 18 px to fit one screen; still test long Latin/CJK output at
font/safe-margin extremes in OBS and both phone surfaces. A line-density policy, speaker
identification and meaningful non-speech cues remain open accessibility decisions.

### G08 — P1: actual provider capacity and data controls

The deployment now keeps numeric admissions/outcomes for 30 days across sessions.
Unknown consumption stays unknown and content deletion never resets usage. Optional AI
has conservative daily reservations and per-session call caps. These guards cannot see
other apps or establish billing/account allowance. Verify actual Free plans, Groq ZDR,
Cloudflare content settings and provider headroom before approved audio/AI tests.
Estimate full-session usage from observations, not a monthly multiplication alone.

### G09 — P1: human usability and accessibility

Synthetic browser/Axe checks (`npm run qa`) pass at 1920, 1200, 390 and 320px for the
Live, Transcripts and Settings screens, remote, reader and viewer. Physical Safari/phones,
actual browser zoom, screen readers and volunteer comprehension remain unverified. Have
representative operators configure a service and explain the difference between Clear
screen, Remove passage and Delete transcript, and between Quick override, Terms and Live note.
Verify that pending phone commands cannot be mistaken for physical microphone confirmation.

### G10 — P2: market feature gaps need demand and a scope decision

Local QR joining remains a proposal in [Pilot improvements](PILOT_IMPROVEMENTS.md).
Saved terminology is now the shared church setup's Settings › Terms list
([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)). Live correction is
covered from the next caption by Quick override, and before publication by editing the
next caption in the output buffer or showing a paused Manual caption; correcting a caption
already on screen remains open. Private source
correction, passage removal, archives and summaries are already implemented.
Additional providers, exact Bible retrieval, workspace roles and simultaneous targets
need separate decisions. The [11 September benchmark](BENCHMARK_RESEARCH.md) is dated
research, not a description of current feature availability.

### G11 — P1: private-history and optional-AI production acceptance

Rehearse opt-in consent, source preservation, partial-history failures, independent
pagination, removal/exclusion, summary citations, interrupted jobs, deletion races,
seven-day content expiry and 30-day usage expiry. Include automatic summary drafts at End,
session details, and any signed-in operator reviewing or deleting a shared transcript.
Application deletion cannot recall
exports or promise immediate physical erasure of provider recovery copies. Account
backups and participant notice need explicit operational review.

## Next sequence

1. Record the deployment of the latest merge (the deploy command is preserved in
   `package.json` since PR #28) and verify actual route boundaries/configuration
   without weakening Access.
2. Approve the first language corpus and provider/account settings.
3. Run a short protected rehearsal with the capture system, separate OBS computer,
   paired operator phone, latest viewer and appending reader.
4. Test duration/recovery first with fixed synthetic channel output and optional AI off,
   then separately measure approved synthetic audio and optional inference.
5. Record an owner go/no-go decision with language, consent, latency, quality, budget and
   stop criteria. Feature expansion does not substitute for these gates.

The [roadmap](ROADMAP.md) carries deferred work. The iOS experiment was removed under
[ADR 0020](decisions/0020-remove-ios-shell.md).
