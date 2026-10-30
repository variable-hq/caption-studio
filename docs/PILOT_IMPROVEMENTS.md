# Evidence-gated pilot improvements

Reviewed 28 October 2026 against merged PR #75 (`080e6ca`).

Prepared 12 September; scope reconciled 13 September 2026. QR joining, reusable saved
terminology packs and live public-caption correction remain proposals. Plan 1 has since
implemented private source corrections, approved recognition aliases and passage exclusion;
those do not edit an already displayed OBS caption. See [current product scope](PRODUCT_SPEC.md).
This document adds no runtime feature or new data retention.

Status at the 28 October review, without changing the proposals below:

- **QR joining:** still a proposal. No QR encoder or joining control exists.
- **Terminology pack:** superseded by a different design. Words are part of the one church
  setup every signed-in operator shares, stored server-side and edited as the Settings ›
  Words list ([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)); there is
  no per-browser pack.
- **Correction:** partly addressed by other controls; correcting a caption already on
  screen is still not implemented. See the status note under Candidate 3.

The "Current flow" passages describe the code as of 13 September; file names and labels
there may have changed. See [Product specification](PRODUCT_SPEC.md) for today's flow.

Use this plan after the critical implementation checks and the protected rehearsal in
[STAKEHOLDER_TEST_GUIDE.md](STAKEHOLDER_TEST_GUIDE.md). It addresses the optional
improvements identified in [GAP_ANALYSIS.md](GAP_ANALYSIS.md#g10--p2-market-feature-gaps-need-demand-and-a-scope-decision)
and [BENCHMARK_RESEARCH.md](BENCHMARK_RESEARCH.md). Published competitor workflows
justify testing these needs; they do not establish demand or quality for this church.

## Decision rule

Run the tasks below using the current product first. Classify the cause of each failure
before selecting a feature. A broken deployment, expired link, wrong language, missing
microphone permission, or provider failure needs its own fix; a QR code or saved pack
does not resolve it. Safety and meaning-changing errors remain pilot stop conditions.

The following numbers are proposed screening thresholds for a small rehearsal, not
industry standards, statistically validated targets, or release criteria. The owner
and reviewers should accept or replace them before scoring. Record actual observations
even if the thresholds have not yet been agreed; do not silently turn a proposal into
an approval to build.

| Candidate | Measured trigger for a scoped implementation proposal | Keep the present workflow when |
| --- | --- | --- |
| Local QR joining | In five intended-viewer trials with a valid link and working network, at least two viewers need operator help or cannot open the correct viewer within 60 seconds specifically because transferring/opening the link is difficult. | Copy/open/manual reveal works within the agreed task limit, or the failure is authentication, network, expiry, readability, or incorrect distribution. |
| One reusable terminology pack | Across two separate service setups, the same five or more approved entries must be recreated, and re-entry either takes more than two minutes per setup or causes an omitted/wrong mapping confirmed by the reviewer. First test the existing paste workflow. | A reviewed text list pasted into the existing field removes the repeated work and errors, or different services actually need different content. |
| Reviewed manual correction | A bilingual reviewer records a published meaning-changing error, or repeated terminology/number errors, and the operator demonstrates during a stopped synthetic replay that a correction would be useful within the audience's agreed recovery window. | No actionable errors are observed, the cause is a glossary/prompt defect that can be corrected before the next service, or the audience has already moved on before a volunteer could safely edit. |

A correction trigger starts a workflow decision. It does not authorize continuing a
pilot with unacceptable output, and it does not prove that correcting an already-seen
caption is an adequate safeguard. If approval is required before any caption reaches
the audience, use a separate review-before-publication design rather than the minimal
correction proposal below.

## First-pilot tasks and evidence

Name one operator, one observer/timekeeper, and an authorized bilingual reviewer for
the chosen source/target pair. Joining trials use five intended viewers if available;
if fewer participate, record the denominator and treat findings as preliminary. Use
the intended OBS computer, separate audience phones, and only synthetic or explicitly
approved speech. Schedule the feature-evaluation tasks around the existing rehearsal;
they do not replace its lifecycle, filtering, cost, or security checks.

| Task | Instructions for the reviewer and operator | Record without caption content or credentials |
| --- | --- | --- |
| J1: join without coaching | Start a synthetic service. Give each viewer the current mobile link through the intended private distribution method. Say only: “Open the translation viewer.” Start timing at handoff; stop when the correct page is open. Do not ask anyone to transcribe a long token by hand. | Trial ID, device/browser, distribution method, seconds, independent/assisted/failed, and cause category. |
| J2: recover a changed link | Explain that the service link changes. Replace the link once with the operator present and distribute the replacement privately. Ask viewers to rejoin. End the test afterward. | Seconds to rejoin; whether anyone keeps using the old link; whether the old link is rejected and OBS is unaffected. Never record either URL or its QR image. |
| T1: prepare approved terms | Give the operator a small church-reviewed terminology list through the agreed private channel. Have the operator enter or paste it, select the intended direction, and ask the reviewer to check every mapping. | Pack/scenario ID, entry count, preparation time, assistance, omitted entries, incorrect mappings, and wrong-direction attempts. Do not copy the list into the evidence sheet. |
| T2: repeat setup | End the service and open a fresh setup. Ask the same operator to prepare the same terms using today's paste controls; repeat once with a second representative operator if available. Do not assume the active-tab recovery snapshot is a reusable profile. | Reused-entry count, time, errors, and whether paste already solves the problem. Record whether same-browser reuse or transfer between operators is the actual need. |
| C1: observe correction demand | During approved language-quality samples, the bilingual reviewer marks scenario IDs and severity while the observer times the output. For a critical meaning or safety failure, stop capture/output using the existing controls and follow the guide. | Error class, severity, detection time, action taken, estimated audience exposure, and whether the intended meaning could still be corrected usefully. No copied source or translated text. |
| C2: simulate correction after stopping | With capture stopped, replay the approved scenario privately. Ask the operator to describe the intended correction and the observer to time detection, review, and the decision to publish or discard. Use a paper/mock control sequence; there is no live public-caption correction button; archive source correction is separate. | Time needed, reviewer availability, whether the operator could still supervise audio/OBS, and preference for correction after publication versus approval before publication. Do not treat a paper simulation as delivered-runtime evidence. |

The owner must define an acceptable audience recovery window with the bilingual reviewer;
this plan does not invent a universal number for correcting scripture, negation, or
other meaning-changing content. Record the interval between the erroneous caption and
the next caption too: an edit that finishes after the topic has changed may confuse
the audience rather than help.

Keep observations in the existing approved private rehearsal record. Use participant
and scenario IDs, counts, times, cause categories, and decisions. Do not add telemetry,
record audio, retain captions, collect attendee accounts, or put live links/screenshots
of bearer credentials in Git, tickets, or chat for this evaluation.

## Candidate 1: local QR joining

**Status (28 October 2026):** not implemented. The phone viewer link is now copied with
**Copy link** in Live's Share card; **Open preview** and the manual-copy field are in
Settings › OBS & links.

### Current flow and smallest change

[`page.tsx`](../src/app/page.tsx) already offers Copy mobile link, Open preview, and a
concealed manual-copy field. Starting a service creates the link; replacement, End,
expiry, and takeover revoke it. [`session-client.ts`](../src/live/session-client.ts)
uses the existing protected service/viewer routes. The fragment contains the viewer
credential, separate from the reusable OBS credential.

If J1/J2 demonstrate link-handoff friction, add one explicit **Show joining QR** action
inside Mobile viewer. Encode the current `viewerUrl` locally in the operator browser.
Keep the existing copy/open/manual options as alternatives. Label the code as the
current service's audience access, with the selected caption language and expiry
behavior. Do not imply that scanning provides simultaneous language choice.

The code must be concealed until the operator requests it and removed when the current
link disappears or changes. It contains a bearer credential just as the URL does:
show it only to intended viewers, keep it out of the broadcast/recording by default,
and do not automatically create a printable/downloaded artifact. A permanent church
joining URL, short-code service, QR analytics, and audience accounts are separate work.

This needs no new API, database, AI call, or token format. Native DOM/CSS does not itself
encode a QR symbol. At implementation time, check for an existing suitable encoder;
otherwise review a small locally bundled encoder's license, maintenance, and security
before choosing a package or vendored implementation. Do not implement a new QR
algorithm or send the link to a third-party QR/image service. No encoder is installed
for this plan.

### Acceptance before release

- An offline decoder reads exactly the current mobile URL, including its fragment;
  the OBS/controller credential never appears in the encoded payload.
- After replacement, the visible code changes and the prior decoded link is rejected.
  End, expiry, and takeover remove the code and revoke the old audience access.
- Real phones scan the code at the intended distance and lighting; the copy/manual
  alternatives remain available to people who cannot scan it.
- Keyboard focus, the Show/Hide name, 320px/390px reflow, and explanatory text work
  without requiring a visual scan. Use only synthetic credentials in automated images.
- A network inspection finds no external QR request and no credential in request URLs,
  logs, telemetry, or query strings. Existing provider-call counters do not change.

Pending owner decisions: where the code may be displayed, who may see it, whether an
attendee display is permitted under the existing private-link policy, and whether the
measured improvement over current private link sharing justifies the encoder footprint.

## Candidate 2: one explicit terminology pack in this browser

**Status (28 October 2026):** not built as proposed. Repeated setup is now handled by the
shared church setup: **Save for everyone** stores words, languages and other settings for
all signed-in operators, and new services start from it
([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)). That answered the
cross-operator sharing question below with a server-side record rather than `localStorage`;
it keeps a single setup, not packs per language pair. T1/T2 now measure the Words list.

### Current flow and smallest change

[`TranslationSettingsEditor.tsx`](../src/components/operator/TranslationSettingsEditor.tsx)
edits `keywordText` as a draft. [`config.ts`](../src/live/config.ts) reads at most
40 entries with bounded source/replacement text; mappings use the currently selected
target language. [`translation-settings.ts`](../src/live/translation-settings.ts)
bounds the terminology input to 8,000 characters and keeps the applied settings only
in the active tab's recovery snapshot. That snapshot is not a saved church profile.

First try the approved-list paste workflow in T2. If it is insufficient and the need
is repeated setup on one browser, propose one saved terminology pack bound to an
explicit source/target pair. Use **Save terminology in this browser**, **Load into
draft**, and **Forget saved terminology**. Saving/loading must never silently apply
terms to a live translation revision. Existing Review refresh/confirmation remains
the only live application step.

The smallest new stored record is a version, source language, target language, and
bounded `keywordText`. Store one pack only after an explicit Save action; replace it
only after showing which pair is being replaced. Reject a direction mismatch when
loading instead of changing the languages or reusing an Indonesian replacement for
Japanese output. Restrict the initial pack to explicit source selection; automatic
detection needs its own agreed reuse rule.

Reusing the existing unencrypted `localStorage` pattern is an additional retention
decision, not existing functionality or an assumption that church-private terms are
safe to persist. The owner must approve the allowed content, shared-browser handling,
and explicit deletion behavior before this version is built. Do not persist public
filter drafts, custom prompts, captions, reviewer identities, or additional settings
as an incidental part of saving terms. Cross-device synchronization, accounts, pack
libraries, import/export, and approval databases remain outside this first version.

### Acceptance before release

- Save is explicit; unsaved edits disappear on reload. A saved pack can be loaded in
  a fresh setup and forgotten. Storage failure produces an accurate message without
  losing the current draft or claiming that a save succeeded.
- Loading only changes the terminology draft. During live/paused operation, the
  active fingerprint, timer, links, usage, and current public output remain unchanged
  until the existing confirmed refresh.
- Validate the stored schema, locale values, string/entry bounds, and parse result
  before using the record. Malformed/overlong packs and direction mismatches fail
  visibly; do not rely on the existing parser's truncation to silently repair them.
- Changing the draft target after loading a pack does not silently authorize those
  mappings for a new language. Require review/reload of terms for the new direction.
- The owner-approved repeat task becomes faster or avoids the observed entry error;
  the pack remains absent from the Durable Object, viewer/OBS events, and logs.

Pending owner decisions: terminology approver and review cadence; content permitted on
a shared browser; replacement/deletion policy; whether same-browser reuse is enough;
and whether operators instead require controlled sharing between machines. A need for
shared profiles belongs to the separate workspace/role/retention design in the roadmap.

## Candidate 3: pause, review, and publish a correction

**Status (30 October 2026):** the proposal below is not implemented as written, but
neighbouring controls now ship on Live › Quick fixes:

- **Manual caption** while paused shows up to 240 typed characters in the active target
  language to OBS and the latest viewer, and archives it as a separate operator note
  ([ADR 0013](decisions/0013-manual-caption-archived-as-operator-notes.md)). Unlike this
  proposal, it does not capture or edit the previous caption, has no expected-sequence
  check, and bypasses the public filter and glossary as already-reviewed operator text.
- The optional **output buffer** holds each caption 1–5 seconds before Live; the next
  caption can be paused, edited (re-moderated before it can show), cleared or
  fast-forwarded ([ADR 0016](decisions/0016-client-side-output-buffer.md)). This is a
  limited review-before-publication, not correction after publication.
- **Quick override** can fix spelling, set a translation, help recognition, or hide a
  whole caption from the next caption onward without a refresh. **Live note** gives
  situational guidance to later translations
  ([ADR 0023](decisions/0023-live-note-and-recent-outputs.md)); neither changes a caption
  already shown.

The pending owner decisions at the end of this section still apply.

### Current flow and smallest change

There is no live public-caption correction editor today. The operator sees the latest source/public
caption, but [`use-live-caption-session.ts`](../src/live/use-live-caption-session.ts)
clears these when Pause succeeds. [`caption-room.ts`](../src/live/caption-room.ts)
also deletes the latest public caption on Pause, and normal caption publication is
accepted only while live. Reusing the current publish request from a paused editor
would therefore fail; allowing arbitrary publication while paused would weaken the
existing lifecycle boundary.

If C1/C2 justify correction after publication, the smallest safe first version is a
deliberate paused workflow, not a live history editor:

1. Offer **Correct current caption** only for the latest real caption while live,
   not for a synthetic test. It captures one nonempty public caption, its recorded
   language, sequence, and translation revision in page memory, then requests the
   existing Pause. Do not capture source text or a sermon history into a new store.
   Editing is available only after the server confirms Pause; a failure retains the
   existing recovery choices and never publishes the draft.
2. Show one target-text draft with **Discard** and **Review correction**. Lock its
   language to the captured caption, not a subsequently edited translation draft.
   Use the active public-filter rules to prepare a moderated public preview; do not
   call AI or substitute protected source text. If active settings are unavailable,
   require their existing recovery/refresh process before correction can proceed.
3. **Publish correction** explicitly authorizes one new public caption while the
   service stays paused. Add a narrowly validated protected correction action; do not
   relax the normal live-only publication rule or turn Show test into a general
   publisher. Validate Access/controller ownership, expiry, paused state, allowed
   language, translation revision, the existing 2,000-character public-text bound,
   and an expected current sequence in the Durable Object transaction.
4. Increment the sequence and count the correction against the existing 1,400-event
   service ceiling. Reuse the ordinary public caption event for OBS and the mobile
   viewer; store at most the existing latest caption. The 90-minute expiry, viewer/OBS
   links, and AI usage totals do not reset. Resume remains explicit and clears the
   correction before new audio capture, as it already clears a paused test caption.

The expected-sequence check prevents an old edit from replacing a newer caption or
synthetic test. If an in-flight caption wins before Pause, reject the old correction
and explain that the caption changed; discard/review through the agreed recovery
workflow instead of automatically overwriting it. Translation refresh, takeover, End,
expiry, or Clear must invalidate the correction draft. Failed publication must not be
shown as successful. For a lost acknowledgement, the proposed first version keeps the
outcome unconfirmed and does not automatically retry. The operator can inspect the
actual outputs or use the existing acknowledged Clear action to restore blank output
and discard the draft. If that recovery is inadequate, agree a bounded idempotency key
and reconciliation response before implementation. No append-only correction log is
required for this minimal proposal.

Fast-caption filtering runs in the browser pipeline; the Main room does not own the
complete active translation settings. Plan 1 additionally sends bounded filter/glossary
context to the sermon journal for reader processing. Reusing the existing masking function preserves that
trust model but does not create server-authoritative filtering. Any requirement for
server-owned rules needs a separate data/control decision. Also decide whether approved
term replacements should rewrite a human edit: blindly reapplying the mapping that
caused an error could defeat the correction.

### Acceptance before release

- An authorized paused operator can review and explicitly publish one moderated
  correction to both outputs. The source preview is never used as public fallback;
  no transcription/translation request is made by correction controls.
- Wrong/replaced controllers, expired services, live-state correction requests,
  stale revisions/sequences, invalid languages, oversized text, and the event ceiling
  are rejected before publication. A delayed older request cannot replace newer text.
- Confirmed Pause is required. Failure, cancellation, reload, Clear, refresh, End,
  expiry, and takeover cannot leak an unapproved draft or resurrect it afterward.
- Duplicate/lost-ack tests establish the selected retry policy without duplicate
  public events or false success. Public-text language remains attached to the
  correction after other drafts change.
- The existing public-filter tests run against edited text for the approved pilot
  language. Both audience outputs show the same moderated text and honest paused
  status; Resume clears it. Credential separation and latest-only retention remain.
- Representative volunteers can complete the workflow with keyboard controls and
  the required reviewer within the agreed recovery window while supervising OBS.
  If they cannot, reconsider staffing or review-before-publication rather than add
  more editing controls to an overloaded operator.

Pending owner decisions: correction after publication versus prior approval; who may
approve/publish; how audiences recognize a correction; maximum acceptable exposure and
recovery time; behavior when newer text arrives; retry/reconciliation policy; and
whether an audit requirement would require separately approved metadata retention.
Correction cannot retract a caption already seen, recorded, or understood by a viewer.

## Review and implementation handoff

After the rehearsal, review one row per candidate. A triggered threshold and a feasible
prototype task support a scoped proposal; the owner still resolves the listed decisions
and existing safety/quality gates before implementation and deployment. A non-triggered
feature stays deferred. Do not make these features prerequisites for a pilot that already
meets its agreed criteria with the current workflow.

```text
Rehearsal ID / date / verified deployed revision:
Candidate: QR / terminology pack / correction
Task IDs and number of trials:
Measured times / assistance / error counts:
Observed cause, with scenario IDs only:
Proposed threshold accepted or replaced before scoring:
Existing-workflow alternative attempted and result:
Triggered / not triggered / insufficient evidence:
Owner and reviewer decision:
Pending content / access / retention / cost decisions:
Smallest approved change and acceptance tests:
Local validation required:
Protected deployment rehearsal required:
Decision owner / next review date:
```

The implementation handoff must name the evidence that triggered the work, preserve the
Free-plan/no-paid-fallback boundary, and distinguish local tests from a deployed pilot.
This document supplies a reviewable next step; it records no observed feature demand,
completed physical rehearsal, production result, or approval to retain new data.
