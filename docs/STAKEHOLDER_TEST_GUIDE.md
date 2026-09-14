# Stakeholder test guide

Reviewed 14 September 2026 for merged PR #33 (`abae57b`), including the service panel. Use a protected, verified deployment,
synthetic speech or explicitly approved recordings. Deployment success and local QA do
not establish a passing physical service, semantic quality or WCAG conformance.

## Confirmed rehearsal setup

The microphone AUX feed enters a USB audio interface connected to the capture computer.
OBS runs on a separate computer using the hosted reusable Browser Source URL.
Use a signed-in paired phone for the operator remote and separate signed-out audience
phones for `/view` and `/read`. Device models and physical signal routing remain untested.

The browser is the sole active client. The [iOS experiment](../ios/README.md) is deferred
and its native/signing checklists are not web release gates.

## Before the test

- Record the reviewed Git SHA and final Worker version from a successful deploy.
  [Deployment](DEPLOYMENT.md) gives current commands, bindings and exact Access paths.
  Production is not an isolated test environment; use the owner-approved environment.
- Verify approved operator access, scoped public bypasses, all three Durable Objects,
  AI/assets bindings and secrets by name/type only.
- Verify actual provider Free plans, Groq ZDR, model availability and headroom.
  Leave optional Workers AI disabled until its privacy/model/quality checks are approved.
- Use the first Indonesian→English [30-sample review](evaluation/ID_EN_REVIEW.md);
  all scores and terminology approvals are still pending. Do not treat draft references
  as approved translations.
- Decide whether this synthetic service should save history. Saving must be explicitly
  enabled before Start; off is the default. Explain seven-day content and independent
  30-day numeric retention to operators/participants.
- Keep tokens, emails, private sermon content, prompts and active bearer URLs out of
  screenshots, Git, issues and shared evidence. Use sample IDs and status/timing metadata.
- Schedule a short rehearsal before a duration run. Paused time counts toward the
  original 90-minute service expiry.

## Setup and fast-caption journey

1. In a fresh browser profile, complete the six-step tutorial, test Back, direct selection,
   Skip/Escape and panel shortcuts. Reopen with **How to use**; focus returns correctly.
   Reload after dismissal; no audio or service action occurs from the guide.
2. Check at 1920, 1200, 390 and 320 CSS pixels. Use keyboard navigation, visible focus,
   actual zoom, reduced motion and an assistive-technology user where available. No control,
   dialog or long record should create horizontal page overflow or hide the next action.
   Verify the grouped sidebar and phone navigation drawer, Escape/focus return, section
   bookmarks and browser Back/Forward. Confirm drafts and the history checkbox survive
   in-page navigation, and no navigation action starts capture.
   Service controls should start collapsed. Open/close its right panel, test keyboard
   focus and resizing across 1280px, and confirm capture continues when it is closed.
3. Sign in; confirm configured models in Service details. Defaults are
   `whisper-large-v3-turbo` and `openai/gpt-oss-20b`. Configuration is not a model-output test.
4. Enable the audio test, select the USB interface and speak into the AUX feed. Mute that
   feed and confirm nearby computer speech does not reveal an unintended input. Verify the
   selected device after reconnecting it.
5. Choose Indonesian→English and a 9-second buffer. Review the TB2 vocabulary action and
   approved mappings; test `Saul|swauf => Saul` only as an explicit reviewed alias.
   Compare original recognition and translation separately; do not infer the biblical identity.
6. Add safe synthetic glossary/filter data. Review translation guidance; unsaved drafts
   stay page-local, while explicit browser-default saving uses unencrypted localStorage.
7. Create/retrieve Main once. Copy the concealed OBS URL directly to a 1920 × 1080 Browser
   Source on the separate computer. Test denied clipboard recovery without exposing the
   link to a recording. Set font, size, colours, highlight, placement and safe margins;
   preview updates continuously and saved shared style survives reload.
8. Show and Clear a synthetic idle test. It makes no AI call or microphone capture.
   Open **Service controls**, choose whether to save history, then **Start captions**;
   Start performs readiness and ownership checks. Expand **Preview captions** when needed.
9. Speak approved samples. Confirm private source versus moderated public output, glossary
   behavior, masks, caption language, skipped chunks and processing-time labels.
   The processing number excludes buffer, queue wait and audience rendering.
10. While live and paused, draft language, terms, filters, buffer and prompt changes.
    Cancel refresh once, then confirm it. Old output/context disappears; old results cannot
    reappear. Timer, controller, links, usage and live/paused state remain. Repeat a short
    sample at 6 and 18 seconds; longer windows do not guarantee complete sentences.
11. Pause at a natural break: microphone and queued work stop, OBS/latest viewer blank,
    and attempts stop increasing. Show/clear a paused test; Resume clears it before capture.
    Clear alone keeps capture active, so new valid speech can appear afterward.
    Repeat Pause/Resume and Clear with Service controls collapsed. End remains inside
    the panel; cancel its confirmation once and check focus returns to End service.

## Latest viewer, appending reader and remote

| Check | Expected result |
| --- | --- |
| Open `/view` privately on a signed-out phone | Current moderated target caption/status only; local text sizing does not change OBS |
| Refresh/join latest viewer late | At most current caption; no source, history, usage or operator access |
| Open separate `/read` link | Appending translated paragraphs; no source or private summary |
| Open more readers/remotes | No model call caused by opening/polling; reader work is shared |
| Optional AI off | Reader joins existing translations and marks fallback; summary reports unavailable |
| Optional AI on in approved synthetic test | Shared bounded phrasing improves tested punctuation without changing meaning; glossary/filter rules still apply |
| Scroll reader away from bottom | New content does not yank scroll; return-to-live action is available |
| Clear/Pause/refresh during pending paragraph work | Pending text discarded; committed paragraphs preserved; new revisions/languages separated |
| Saving on, reader reload/late join | Paginated public history recovered for that service |
| Saving off | No durable source archive; explain that object eviction can lose unreceived reader text |
| Pair operator phone | Requires Access plus service remote credential; phone never captures audio |
| Remote Pause | New server inference claims stop immediately; physical mic status confirmed only after host acknowledgement |
| Remote Resume/Clear | Applies to the existing capture computer; duplicate commands do not repeat actions |
| Capture computer disconnected | Phone reports pending/disconnected; no false microphone confirmation |
| Replace viewer/reader link | Only intended capability changes; old link denied, OBS unchanged |
| Takeover | Old controller/remote/reader/latest-viewer revoked; stale computer stops on reconciliation |
| End/expiry | OBS blank but reusable; latest viewer/remote revoked; reader remains for 30-minute grace |
| Network loss/reconnect | Truthful state and bounded recovery; record actual detection time, not only mocked socket behavior |

Viewer/reader links and phone pairing are under **Live outputs**. Private transcript
review and summaries are under **Sermon history**.

Test authenticated missing/duplicate/stale/paused/expired attempt rejection through the
synthetic harness. Do not publish credential values or spend inference quota to prove a
rejection. A mocked incomplete completion must skip public text while retaining known
usage; accounting failure stops capture.

## Private archive and summaries

1. End an opted-in service and inspect its archive. Original source, corrections and
   paragraph/source IDs stay distinct; independent pagination does not repeat/skip records.
2. Correct a private source record. Preserve the original and invalidate a prior summary.
   This action does not edit already displayed OBS output or train a model.
3. Cancel Remove passage once, then confirm. Reader removes the paragraph on successful
   polling; source IDs become excluded from future summaries while originals remain private.
   If the current live caption uses a removed source ID, verify it is also cleared.
   Unrelated current captions must remain; Clear is the separate general blanking action.
4. With optional AI enabled for approved synthetic testing, select model, language,
   short/detailed length and harmless guidance. Generate manually after End.
   Duplicate submission/lost acknowledgement must not schedule duplicate jobs.
5. Inspect source-linked points, uncertain references, names and omissions. Guidance must
   not override grounding. No exact TB2 passage text is imported; reject invented scripture
   or unsupported points. Source-ID membership alone does not establish semantic support.
6. Exercise disabled-provider, context-limit, quota, interrupted-job and network failures.
   Show a visible failed state; never retry uncertain inference automatically or use paid fallback.
7. Export the transcript privately as JSON. Summary export requires the explicit review
   step. Clear local exports after the synthetic test; app deletion cannot recall copies.
8. Cancel Delete once, then confirm after End. Archive/index and reader access disappear;
   late jobs cannot restore content. Read-time expiry must deny content seven days after
   End/expiry even if cleanup is late. Use a test clock only in isolated automated tests,
   never alter production clocks/state to simulate retention.

## Usage and duration

Verify active-service time, reserved attempts, acknowledged translation tokens and latest
provider headroom separately from the **Last 30 days** history. Check per-service/day/model
groups, unknown outcomes and capacity-estimate assumptions. More phones, Clear, End,
takeover and archive deletion must not erase usage or create additional viewer inference.
Each usage row expires 30 days after its original attempt, independently of content.
The ledger cannot see unrelated provider-account traffic or renew a monthly allowance.

Run a short content-free channel test before a 90-minute endurance test with optional AI
off: use fixed synthetic public captions, no inference routes, no reserved transcription
attempts, and zero provider usage. Preserve the original service to verify actual expiry;
test a second service and takeover separately. Channel endurance does not test audio/AI.

For a separate approved audio-duration run, measure provider usage on short samples first,
then verify sufficient headroom. Observe full audience delay, queue drops, input loss,
Access expiry and provider failure. Disconnect OBS and the capture computer separately to
distinguish delivery failure from capture failure. Stop at quota/error limits.

## Evidence and acceptance

Record content-free metadata:

```text
Date / approved environment / Git SHA / final Worker version:
Device / OS / browser / selected USB interface:
Separate OBS computer / OBS version / audience phone models:
Source -> target / models / buffer / evaluation sample IDs:
History consent / optional AI state / account-plan and data-control checks:
Tutorial / keyboard / zoom / screen-reader / layout results:
Fast output / glossary / filter / completion / attempt-claim results:
Remote commands / host acknowledgement / disconnect results:
Reader late join / Clear / Pause / revision / link expiry results:
Source corrections / exclusions / summary grounding / export / deletion results:
Service counters / rolling usage / unknown outcomes / retention results:
Capture-to-display delay / processing time / queue drops / duration:
Recovery / second service / takeover / expiry / OBS URL reuse:
Issues / pass, fail or blocked / owner go-no-go:
```

Stop for unintended input, private-data exposure, failed authentication boundaries,
invented/meaning-changing output, public-filter failure, sustained provider errors or
paid usage. End capture, revoke the affected capability as described in
[Security](../SECURITY.md#incident-response), and retain only safe diagnostic metadata.
Acceptance needs owner-approved quality, latency, privacy, recovery and budget thresholds;
screenshots and successful deployment alone are insufficient.
