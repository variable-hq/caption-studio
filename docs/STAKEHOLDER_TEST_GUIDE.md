# Stakeholder test guide

Reviewed 1 November 2026 against merged PR #85 (`863bf10`), including the Live/Sermons/Settings dashboard. Use a protected, verified deployment,
synthetic speech or explicitly approved recordings. Deployment success and local QA do
not establish a passing physical service, semantic quality or WCAG conformance.

## Confirmed rehearsal setup

The microphone AUX feed enters a USB audio interface connected to the capture system.
OBS runs on a separate computer using the hosted reusable Browser Source URL.
Use a signed-in paired phone for the operator remote and separate signed-out audience
phones for `/view` and `/read`. Device models and physical signal routing remain untested.

The browser is the sole client; there are no native/signing checklists.

## Before the test

- Record the reviewed Git SHA and final Worker version from a successful deploy.
  [Deployment](DEPLOYMENT.md) gives current commands, bindings and exact Access paths.
  Production is not an isolated test environment; use the owner-approved environment.
- Verify approved operator access, scoped public bypasses, all four Durable Objects,
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

1. In a fresh browser profile, open the dashboard: it lands on **Live** with the
   **Before you start** checklist and nothing pops up. Each red item's **Fix**, **Set up**
   or **Help** button opens the screen that fixes it. Open **Help** (the **?** button,
   "How it works") and return with **Back to Live**; no audio or service action occurs.
2. Check at 1920, 1200, 390 and 320 CSS pixels. Use keyboard navigation, visible focus,
   actual zoom, reduced motion and an assistive-technology user where available. No control,
   dialog or long record should create horizontal page overflow or hide the next action.
   Verify the **Live**, **Sermons** and **Settings** tabs and each Settings section, their
   bookmarks (`#live`, `#sermons`, `#settings=<section>`, `#help`), reload and browser
   Back/Forward. Switch **Settings › This system › Light or dark** to Dark and back to
   Light: text, status pill, focus outlines and the caption preview must stay readable, and
   the OBS overlay must stay transparent. Reload and confirm the theme returns from the account.
   Confirm drafts and the transcript checkbox survive moving between screens, and no
   navigation action starts capture.
   Save the translator instructions, summary style, caption look, Words and the languages
   setup with **Save for everyone**, then open the dashboard as a different Access user: the
   church setup must match. Change the theme there; it must not change for the first user.
   In **Settings › Words**, add one word with each **What to do** action and confirm each
   behaves as described.
3. Sign in; after Start, confirm the configured models under **Live › Quick fixes ›
   Service details** (Speech model, Translation model). Defaults are
   `whisper-large-v3-turbo` and `openai/gpt-oss-20b`. Configuration is not a model-output test.
4. In **Settings › This system › Microphone**, select the USB interface, press **Test the
   microphone** and speak into the AUX feed. Mute that feed and confirm nearby computer
   speech does not reveal an unintended input. Verify the selected device after reconnecting it.
5. In **Settings › Languages & timing**, choose **Preacher speaks** Indonesian, **Show
   captions in** English and **Caption speed** "Balanced: listens 9 seconds at a time".
   Review **Settings › Words › Bible names › Import names** (TB2) and approved mappings;
   add `swauf` with **Fix spelling to…** `Saul` only as an explicit reviewed alias.
   Compare original recognition and translation separately; do not infer the biblical identity.
6. Add safe synthetic Words rows. Review **Settings › AI translator** (how closely to follow
   the words, Sanitization, Filter inappropriate language, Instructions for the translator).
   Unsaved drafts stay page-local; **Save for everyone** writes the shared church setup and
   keeps an unencrypted browser `localStorage` copy.
7. In **Settings › OBS & links**, press **Create OBS link** once, then **Copy OBS link**
   directly into a 1920 × 1080 Browser Source on the separate computer. Test denied
   clipboard recovery with **Show the link to copy by hand** without exposing the link to
   a recording. In **Settings › Caption look**, set text size, font, colours, band, placement
   and margins; the preview updates continuously and the saved shared look survives reload.
8. Use **Show a test caption** and **Clear screen** for a synthetic idle test. It makes no
   AI call or microphone capture. On **Live**, decide **Save the transcript for 7 days**,
   optionally fill **Session details**, then press **Start captions**; Start performs
   readiness and ownership checks. **Heard** and **Audience sees** show the private source
   and the public caption.
9. Speak approved samples. Confirm private source versus moderated public output, Words
   behavior, masks, caption language, **Recent captions**, and the **Service details**
   counters (Delay after speech, Audio chunks dropped). The delay excludes the recording
   window, queue wait and audience rendering.
10. While live and paused, draft language, Words, caption speed and translator changes in
    Settings. The **Your changes aren’t in use yet** banner appears: press **Undo changes**
    once, make them again, then **Apply now**. Old output/context disappears; old results
    cannot reappear. Timer, controller, links, usage and live/paused state remain. Repeat a
    short sample at 6 and 18 seconds; longer windows do not guarantee complete sentences.
11. In **Quick fixes**, test **Hide captions with it** (hides the whole caption at once),
    a **Live note**, and **Check captions before they show** with a short wait: under
    **Next up**, edit, pause, clear and fast-forward a queued caption.
12. Pause at a natural break: microphone and queued work stop, OBS/latest viewer blank,
    and attempts stop increasing. While paused, show a test caption and **Show your own
    message** (**Show now**); Resume clears it before capture.
    **Clear screen** alone keeps capture active, so new valid speech can appear afterward.
    Pause/Resume, Clear screen and End service stay pinned to the bottom of Live while you
    scroll. Cancel **End this service?** once with **Keep going** and check focus returns
    to End service.
13. Open the dashboard as a second Access user during the service: Live names the running
    operator, mirrors the output read-only and offers **Take over**; Start stays disabled.
    Cancel the takeover once with **Keep watching**.

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
| **Pair phone** (Live › Share) | Requires Access plus service remote credential; any earlier phone is unpaired; phone never captures audio |
| Remote Pause | New server inference claims stop immediately; physical mic status confirmed only after host acknowledgement |
| Remote Resume/Clear | Applies to the existing capture system; duplicate commands do not repeat actions |
| Capture system disconnected | Phone reports pending/disconnected; no false microphone confirmation |
| Replace viewer/reader link | Only intended capability changes; old link denied, OBS unchanged |
| Takeover | Old controller/remote/reader/latest-viewer revoked; stale computer stops on reconciliation |
| End/expiry | OBS blank but reusable; latest viewer/remote revoked; reader remains for 30-minute grace |
| Network loss/reconnect | Truthful state and bounded recovery; record actual detection time, not only mocked socket behavior |

The phone viewer link (**Copy link**), sermon reader (**Get link**) and **Pair phone** are
under **Live › Share**, with **Replace reader link** under "Reader link shared by
mistake?". Phone viewer and OBS link replacement (**Replace…**) are under **Settings ›
OBS & links**. Private transcript review and summaries are under **Sermons**.

Test authenticated missing/duplicate/stale/paused/expired attempt rejection through the
synthetic harness. Do not publish credential values or spend inference quota to prove a
rejection. A mocked incomplete completion must skip public text while retaining known
usage; accounting failure stops capture.

## Private archive and summaries

1. End an opted-in service, open **Sermons** and choose it from the list. Under
   **Transcript › Show the transcript** and **Reader passages**, original source,
   corrections and paragraph/source IDs stay distinct; **Load full transcript** and **Load
   more passages** do not repeat/skip records. **Edit details** changes the session details.
2. **Correct** a private source record and **Save correction**. Preserve the original and
   invalidate a prior summary. This does not edit already displayed OBS output or train a model.
3. Under **Reader passages**, press **Remove**, cancel **Remove this passage?** once, then
   confirm **Remove passage**. Reader removes the paragraph on successful
   polling; source IDs become excluded from future summaries while originals remain private.
   If the current live caption uses a removed source ID, verify it is also cleared.
   Unrelated current captions must remain; Clear is the separate general blanking action.
4. With optional AI enabled for approved synthetic testing, set **Settings › AI summary ›
   Summary style** (Language, Short/Detailed length, harmless **What to focus on**), then
   press **Generate summary** after End. Separately, turn on **Make a summary draft
   automatically after each service** and confirm End of a saved service queues one draft.
   Duplicate submission/lost acknowledgement must not schedule duplicate jobs.
5. Inspect source-linked points, uncertain references, names and omissions. Guidance must
   not override grounding. No exact TB2 passage text is imported; reject invented scripture
   or unsupported points. Source-ID membership alone does not establish semantic support.
6. Exercise disabled-provider, context-limit, quota, interrupted-job and network failures.
   Show a visible failed state; never retry uncertain inference automatically or use paid fallback.
7. **Export transcript** privately as JSON. **Export summary** requires ticking **I checked
   this summary against the transcript**. Clear local exports after the synthetic test; app
   deletion cannot recall copies.
8. Press **Delete sermon**, cancel once with **Keep it**, then confirm after End.
   Archive/index and reader access disappear;
   late jobs cannot restore content. Read-time expiry must deny content seven days after
   End/expiry even if cleanup is late. Use a test clock only in isolated automated tests,
   never alter production clocks/state to simulate retention.

## Usage and duration

In **Settings › Usage**, verify active-service time, reserved attempts, acknowledged
translation tokens and latest provider headroom (**Translation service right now**)
separately from the **Last 30 days** history. Check per-service/day/model
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
Access expiry and provider failure. Disconnect OBS and the capture system separately to
distinguish delivery failure from capture failure. Stop at quota/error limits.

## Evidence and acceptance

Record content-free metadata:

```text
Date / approved environment / Git SHA / final Worker version:
Device / OS / browser / selected USB interface:
Separate OBS computer / OBS version / audience phone models:
Source -> target / models / recording window / evaluation sample IDs:
History consent / optional AI state / account-plan and data-control checks:
Help / keyboard / zoom / screen-reader / layout results:
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
