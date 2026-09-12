# Church Live Caption: gap analysis and improvement plan

Assessment date: 12 September 2026. Source baseline: `aa3ddf2`, plus the local UI and
inference safeguards recorded below. This is a repository assessment, not a production readiness certificate.

## Assessment

The project already implements a substantial operator-assisted live-caption prototype:
protected cloud inference, one reusable OBS output, a separate mobile viewer, bounded
translation context, public masking, explicit live controls, and service-local usage.
The largest remaining risks are unmeasured language and live-service performance,
unproven device/deployment recovery, and deploying the locally verified inference safeguards.
Adding more languages, storage, native clients, or another provider would not resolve
those risks.

The recommended next milestone is one controlled browser/OBS rehearsal with an explicitly
selected Indonesian→English pair, a verified deployment, and measurable acceptance criteria. Keep
the Free-plan, browser-only, no-archive boundary. Paid providers, Apple distribution,
sermon retention, Bible retrieval, and multiple simultaneous target languages require
separate decisions.

See [benchmark research](BENCHMARK_RESEARCH.md) for current primary-source comparisons
with similar products and the accessibility references informing the UI review.
Published vendor features are useful comparisons; they do not prove this application's
accuracy, throughput, accessibility, or suitability for a particular church.

## Evidence and scope

Reviewed [contributor rules](../CONTRIBUTING.md), [security policy](../SECURITY.md),
[product specification](PRODUCT_SPEC.md), [architecture](ARCHITECTURE.md),
[roadmap](ROADMAP.md), [validation report](VALIDATION_REPORT.md), and
[stakeholder test guide](STAKEHOLDER_TEST_GUIDE.md), then traced browser capture,
provider dispatch, deterministic processing, channel state, and public delivery.

Existing tests cover important API, token, room-transaction, refresh, and usage boundaries.
The last recorded complete validation before this assessment was 125 tests in 15 files
on 23 August. That is historical local evidence, not a result of this assessment or
proof of the deployed revision. Current validation results belong in
[VALIDATION_REPORT.md](VALIDATION_REPORT.md).

This assessment made no real-sermon inference calls, changed no cloud settings, and
published no service or link. The code findings below distinguish observed behavior from
risks that require a controlled reproduction.

## Existing safeguards worth preserving

| Area | Implemented safeguard and evidence | Limit of the evidence |
| --- | --- | --- |
| Operator access | Signed Access verification and received-byte request limits; [Access implementation](../src/auth/cloudflare-access.ts), [body reader](../src/http/request-body.ts). | Deployment routes and operator allowlists still require environment verification. |
| Public capability separation | Different controller, OBS, and mobile-viewer tokens; read-only public sockets; revocation and lifecycle tests in [caption-room.test.ts](../src/live/caption-room.test.ts). | Unit tests do not demonstrate physical viewer or OBS behavior. |
| Inference authorization and accounting | Access precedes separate atomic per-stage claims; canonical inference routes and reservation invalidation protect dispatch. Translation usage is acknowledged before usable or incomplete-result responses. See [Worker dispatch](../src/live/inference-request.ts) and [translation tests](../src/live/translation-request.test.ts). | Local deterministic and real local-room checks pass; deployed provider enforcement remains unverified. |
| Live configuration | Drafts apply only through confirmed refresh; server revisions reject stale caption publication. See [translation settings](../src/live/translation-settings.ts) and [room refresh tests](../src/live/caption-room.test.ts#L808). | Browser capture and refresh orchestration lack equivalent end-to-end evidence. |
| Content handling | Protected source stays separate from public text; no application audio/archive storage; bounded recent context and model output. See [caption pipeline](../src/pipeline/caption-pipeline.ts) and [provider](../src/ai/server/groq.ts). | Prompts and filters do not guarantee correctness or complete multilingual moderation. |
| Operator safety | Pause, Clear, confirmed End/takeover/rotation, same-tab paused recovery, bounded queue, and no automatic paid fallback. See [session hook](../src/live/use-live-caption-session.ts). | Some failure states remain device-, browser-, and deployment-dependent. |

## Ranked gaps

P0 means resolve before a live pilot. P1 means resolve or explicitly constrain the pilot
around it. P2 means add only after observed demand or a measured limitation.

### G01 — P0: transcription dispatch enforcement — resolved locally, deployment pending

The original transcription POST authenticated Access without consuming a one-time service
reservation, allowing an approved operator to bypass the browser reservation flow.
The local [Worker dispatch](../src/live/inference-request.ts) now authenticates before
claiming each transcription attempt; translation has its own claim for the same attempt.
Only canonical inference POST routes are accepted. Unsupported `/_next/data/*` paths are
rejected before OpenNext can rewrite them around the claim boundary.

The room atomically rejects inactive, paused, expired, stale-controller, unreserved,
duplicate, and over-900 claims. Pause and confirmed refresh advance an attempt floor so
old reservations cannot be reused after Resume. Legacy state invalidates its prior
reservations because their dispatch history is unknown; usage ceilings and expiry do not
reset. Failed downstream dispatch still consumes the claim.

**Evidence:** deterministic tests and a real local Wrangler/Durable Object smoke verify
claim consumption, duplicate rejection, and Pause/refresh invalidation without Groq
traffic. The [validation report](VALIDATION_REPORT.md) records the final local checks.

**Remaining acceptance:** verify the same boundary on the isolated Access-protected
candidate after [deployment prerequisites](DEPLOYMENT_REHEARSAL_READINESS.md) are met.
No current production-enforcement claim follows from local tests.

### G02 — P0: the current production journey has no recorded complete rehearsal

[The validation report](VALIDATION_REPORT.md#not-validated) explicitly leaves the current
deployed revision, real GPT-OSS response, reusable channel, active viewer, intended
hardware, full 90-minute duration, and outage behavior unvalidated. The July production
smoke test exercised an older disposable-room implementation. It cannot establish
behavior for the current Main-channel design. The read-only investigation identified
production version `0998e416-60e5-4878-b639-d938ed5249bd` without Git provenance, no test
Worker, edge-denied operator probes, unverified plans, and missing local test credentials.
See [deployment readiness](DEPLOYMENT_REHEARSAL_READINESS.md) for exact prerequisites.
The local real-room smoke now covers a short channel lifecycle, not cloud deployment,
physical OBS, or 90-minute endurance.

**Next step:** verify one protected test deployment's exact revision, model configuration,
Access route boundaries, Groq Data Controls, and intended Free plans. Run the existing
stakeholder script with synthetic or explicitly approved material, then a duration test.

**Acceptance:** one content-free evidence record identifies revision, browsers, microphone,
OBS machine, models, test language pair, results, and unresolved failures. Pause, Resume,
Clear, reload, takeover, refresh, viewer replacement, End, and expiry all meet their
documented public-output and token effects. Do not declare success from an HTTP 200,
model-list check, build, or screenshot alone.

### G03 — P0: language and theological quality lack a reviewed evaluation set

Eight language choices, custom guidance, church hints, and deterministic mappings are
implemented. Provider tests verify prompt construction and mocked responses; they do not
measure transcription, translation, Chinese script, accents, mixed-language speech,
numbers, references, or invented completions. There is no manual correction or human
publication queue in the current journey.

**Prepared:** Indonesian→English is selected. The user chose **Operator** as reviewer;
[30 synthetic samples and a scoring sheet](evaluation/ID_EN_REVIEW.md) are ready, but
all human scores, terminology/reference approvals, and audio runs remain pending.
References are drafts, not reviewed translations. No reverse-direction quality is implied.

**Next step:** obtain Operator review, record approved terms and exclusions, then run
approved synthetic audio. Separate transcription errors from translation errors.
Silence/music, accents, physical input, and long-service behavior need additional audio
cases. Expand only after the first pair passes; selector availability is not certification.

**Acceptance:** at least 30 varied samples per pilot pair receive bilingual review, with
all critical names/numbers/references checked individually. Proposed pilot gate: no
unresolved invented scripture/doctrine, reversed meaning, or critical numeric errors in
the approved set. Stakeholders must approve an ordinary-error threshold and record every
known exclusion. A finite test set cannot guarantee future output correctness.

### G04 — P1: the displayed processing metric omits queue age

[processChunk](../src/live/use-live-caption-session.ts#L479) starts its timer only after
[drainQueue removes a chunk](../src/live/use-live-caption-session.ts#L610). Queued chunks
carry audio and generation but no capture timestamp. The displayed value therefore
excludes both recording and queue wait; it ends after publication acknowledgement rather
than OBS/mobile rendering. Adding the selected buffer to that number can still understate
the audience delay under load.

**Next change:** retain content-free chunk timestamps and distinguish buffer duration,
queue wait, processing, and measured audience delay. Show queue backlog and dropped audio
clearly. Add a stale-caption policy only after choosing its acceptable threshold.

**Acceptance:** an intentionally queued chunk reports its added queue wait; the UI never
calls processing time end-to-end latency. Measure word-onset-to-display and
utterance-end-to-display separately on the intended OBS path. Proposed starting target
for the 6-second setting: p95 word-onset-to-display at most 12 seconds and under 1% of
completed chunks dropped during a 90-minute synthetic run. These are proposed product
targets, not an industry guarantee; review them before the rehearsal.

### G05 — P1: device and browser recovery need explicit behavior and orchestration tests

The [audio setup](../src/live/use-live-caption-session.ts#L207) requests a specific input,
and recorder errors stop the service. However, device-change handling only refreshes the
device list; there is no explicit audio-track `ended`/`mute` handler. The recorder's normal
`onstop` restarts recording without a track-state guard. `pagehide` stops local capture
and sends a best-effort server pause, while foreground reconciliation listens to a
native-shell event rather than browser `pageshow`. These are source-level risks, not a
claim that every browser reproduces a failure.

**Next change:** implement one explicit safe-state path for lost input and relevant browser
lifecycle events. Require deliberate input reselection and Resume after recovery. Reuse
existing cancellation and server Pause behavior.

**Acceptance:** unplug/replug, permission denial, suspended/restored tab, and network loss
produce truthful operator status without unintended input switching, leaked provider
requests after Pause, or stale output after refresh. Add a focused orchestration check
covering cancellation during provider work and same-language/silent translation bypass.
Current [Vitest configuration](../vitest.config.ts) runs Node tests; there is no existing
hook test or complete browser capture test in the repository baseline.

### G06 — P1: unspaced-script filtering — resolved locally, term review pending

The baseline Unicode whole-term rule missed `测试` inside `这是测试内容`. The local
[moderation implementation](../src/pipeline/moderation.ts) now uses target-language
`Intl.Segmenter` word boundaries for terms containing Han, Hiragana, or Katakana.
Other terms preserve Unicode whole-word matching. Deterministic cases cover embedded
Simplified/Traditional Chinese and Japanese terms, harmless Latin substrings, and
protected-source preservation. Missing native segmentation blocks affected publication
with a browser-update error.

**Remaining acceptance:** Operator reviews actual terms and false positives in each
approved target/browser. Inflections, homophones, unusual names, mixed scripts, and
cross-caption terms remain outside the guarantee. The
[recorded matching policy](evaluation/CAPTION_POLICY_DECISION.md) is implemented, not
multilingual safety certification. Indonesian→English review remains pending.

### G07 — P1: incomplete output is skipped locally; display policy remains open

[The provider adapter](../src/ai/server/groq.ts) now requires nonempty text and finish
reason `stop`. It strips empty, non-text, truncated, and other non-stop output while
retaining normalized usage. The Worker persists available usage before returning
`422 translation_incomplete`; the browser counts usage and the skip without publishing
text or falling back to source. Missing/failed usage acknowledgement remains terminal.
Deterministic tests and a mocked Indonesian→English browser journey verify this handling.
See the [completion decision](evaluation/CAPTION_POLICY_DECISION.md).

A normal `stop` response can still be a faithfully translated fragment or be inaccurate.
The [OBS document](../src/live/overlay-document.ts) still renders a clipped text block
without a line-count or reading-time policy. Speaker identity and meaningful non-speech
cues remain absent; translated text alone is not complete accessible live captioning.

**Remaining acceptance:** verify deployed completion handling, then test long Latin/CJK
captions at supported font/safe-margin extremes. Choose readable density and recovery
criteria before adding segmentation or resizing; never silently remove meaning to fit.
The owner must decide whether speaker/non-speech support is required. Local visual and
Axe checks do not establish WCAG conformance.

### G08 — P1: service-local usage cannot establish available account capacity

[usage.ts](../src/ai/usage.ts) correctly keeps missing provider fields unavailable.
Acknowledged translation usage, including incomplete output skipped after provider work,
is private and persisted per service. It does not include organization
traffic, remaining daily tokens, authoritative billing, or a complete ledger of provider
work whose response/acknowledgement was lost. A new service or takeover resets these
service totals. Those boundaries are intentional and must remain visible.

**Next step:** check the authoritative Groq and Cloudflare dashboards immediately before
the pilot and record the current plan/limits without credentials. The
[readiness investigation](DEPLOYMENT_REHEARSAL_READINESS.md) could not verify Free plans;
Cloudflare subscription lookup returned 403 and Groq account evidence was unavailable. Estimate a full service
from approved test observations. Define an operator response for `429`, timeout, and
unavailable usage; do not enable paid fallback as an automatic recovery.

**Acceptance:** unknown usage remains unknown, same-tab recovery retains service totals,
End/takeover reset them as documented, and provider-limit simulations stop safely.
Account-wide capacity and Free-plan status require current account evidence, independent
of the 90-minute and 900-reservation controls.

### G09 — P1: operational UI clarity and accessibility need task-based validation

The baseline presents cloud configuration as “Cloud AI ready” and room state as
“OBS ready/live”, although neither confirms an OBS connection or successful inference.
It also calls a shared public-output clear action “Clear OBS”. Workspace navigation lacks
a skip link and explicit panel focus handling. Advanced prompt/usage detail competes with
basic setup, and End sits inside More. These are correctable interface gaps without
changing backend capability.

The UI change in this assessment implements truthful state labels, audio/language/OBS
preflight, task ordering, active/draft snapshots, focused keyboard navigation, a direct
End action with native confirmation, and mobile-reader text sizing. The viewer shows
connection loss as soon as the browser reports socket closure; physical loss-detection
delay remains untested. Reconnect exhaustion is actionable, and caption language does not
change the English controls. The [validation report](VALIDATION_REPORT.md) distinguishes
local browser checks from untested physical and deployed behavior. These baseline UI
defects should not be counted as wholly unimplemented after this change.

The subsequent user-requested first-visit tutorial now explains the six setup/control
steps in an accessible modal, with dismissal and manual replay. It includes the confirmed
AUX/USB-interface and separate-OBS setup. Local browser checks verify behavior; actual
volunteer comprehension and independent setup still require the usability trial below.

**Acceptance:** at 1920, 1200, 390, and 320 CSS pixels, essential actions remain reachable
without horizontal document overflow. Complete setup, navigation, Pause/Resume, Clear,
and confirmed End by keyboard; focus is visible and unobscured. Check text/control
contrast, 200% zoom, reduced motion, meaningful status announcements, and the viewer's
caption language with assistive technology. Three representative volunteer operators
should independently configure a synthetic service and identify its next safe action;
record task completion and confusion before adding another UI framework.

### G10 — P2: market feature gaps need demand and a scope decision

Comparable products offer combinations of participant language choice, QR onboarding,
reusable terminology, live correction, human interpretation, output modes, and transcript
exports. This project deliberately supports one target, one Main channel, latest-only
viewing, page/tab-scoped terminology, and no archives. These are scope limits rather than
proof of defects. See the [benchmark comparison](BENCHMARK_RESEARCH.md) and
[prepared pilot improvement designs](PILOT_IMPROVEMENTS.md); the designs are not implemented.

**Next steps, after pilot evidence:** prioritize local-only QR generation if distributing
viewer links is measurably difficult; terminology reuse if operators repeatedly re-enter
approved terms; and manual correction/human handoff if quality observations require it.
Never send a bearer viewer link to a third-party QR service. Simultaneous languages need
separate quota and concurrency design. Persistent profiles, recordings, exports, and
summaries need retention, permission, licensing, consent, and human-review decisions.

## Recommended sequence

| Stage | Deliverable | Exit criteria |
| --- | --- | --- |
| 1. UI pass completed locally | Truthful operator status, clear setup/live controls, accessible navigation, readable mobile viewer, and synthetic browser verification. | Local checks pass. Volunteer, assistive-technology, and deployed task validation remain; the validation report distinguishes mocked and untested states. |
| 2. Safeguards verified locally; human review pending | G01 both-stage claims and alias rejection, G06 native word boundaries, and G07 incomplete-output skipping pass local checks. Indonesian→English has 30 prepared samples; Operator review remains pending. | Approved terminology and semantic scores are recorded; deployed enforcement still requires Stage 3. |
| 3. Run a short protected rehearsal | Resolve documented plan/access/test-secret setup; deploy a verified isolated revision, use the approved pair, intended microphone/OBS machine, separate viewer, and all lifecycle controls. | Every acceptance row in the stakeholder guide has a result; no credential/source leakage, unintended input, or invented-content failure remains unresolved. |
| 4. Measure a full service | First run content-free channel endurance without AI, then separately approved synthetic audio/provider measurement with verified headroom; measure queue/audience delay, disconnects, usage, and real expiry. | Stakeholders approve measured quality/latency/recovery targets; no paid usage, unbounded retry, or unexplained output loss. |
| 5. Decide the limited pilot | Named operators, content approval, language exclusions, incident steps, and rollback/stop procedure. | Owner records go/no-go using current evidence. Optional feature work follows observed failures or demand. |

The updated roadmap places the limited live-caption pilot gate after Phase 1 reliability
and quality evidence. Optional profiles and archives are not prerequisites. Their separate
permission, retention, review, and cost decisions remain required.

## Verification for this assessment

Dependency maintenance was completed during the UI pass: the fresh production/full
audits initially reported 3/10 known vulnerabilities. Compatible framework, test-tool,
image-library, and transitive patches reduced both reports to zero. Current versions
and build evidence are in the validation report. This resolves the detected dependency
findings, not the implementation and rehearsal gaps above.

- Source trace: completed for capture, transcription/translation dispatch, usage claims,
  moderation, room controls, overlay, and viewer behavior.
- The 11 September synthetic check exposed the embedded Chinese-term gap. The
  12 September script-aware fix passes local embedded-term and harmless-substring tests;
  real terminology and language review remain pending. No provider was contacted.
- Current unit/type/lint/build/audit and synthetic browser results are recorded in
  [VALIDATION_REPORT.md](VALIDATION_REPORT.md).
  No new result is inferred from the historical 125-test run.
- Current deployed revision, real provider output, physical microphone/OBS behavior,
  assistive-technology rehearsal, and 90-minute runtime: not established by this audit.
