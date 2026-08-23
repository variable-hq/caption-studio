# Stakeholder test guide

Last reviewed 23 August 2026.

## Purpose

This guide covers a controlled usability and technical rehearsal of the Phase 1 cloud
prototype. Passing it supports a decision about the next pilot step; it is not a
production, theological, accessibility, or every-language certification.

The main script below is the complete current client and OBS acceptance journey. Apple
distribution is deferred; the preserved native rehearsal later in this guide is a
historical appendix and must not be included in the current test scope.

Test the deployed dashboard at
<https://church-live-caption.lukas-ka.workers.dev/>. Stop if its ownership or environment
cannot be confirmed by the project owner.

## Before the test

- Use a recent Chrome or Edge browser and a stable internet connection.
- Confirm the tester's email is approved in Cloudflare Access.
- Use the intended microphone or audio interface and verify its name in the dropdown.
- Install OBS on the intended streaming computer and prepare a 1920 × 1080 Browser
  Source.
- Prepare a separate phone at both 390px-class and 320px-class widths for the read-only
  mobile viewer. It must not be signed in as an operator.
- Confirm with the owner that Groq ZDR is enabled and both provider accounts remain on
  the intended Free plans. Never send or paste keys to a tester.
- Confirm Cloudflare reports a successful deployment of a reviewed Git revision that
  contains both `e680576` and the 4 August documentation/code cleanup. Record the exact
  revision identifier, not build logs containing secrets.
- Use synthetic speech or a recording with explicit consent. Do not use confidential
  sermon, pastoral, member, or counselling content.
- Reserve 15–20 minutes for one source/target pair and the reusable-link checks. End the
  service when finished.
- Confirm exact Access bypasses exist for `/overlay*`, `/api/live/overlay*`, `/view*`, and
  `/api/live/viewer*`, while `/api/live/channel*` remains operator-protected.
- Do not put an active OBS or mobile-viewer URL in screenshots, tickets, chat, analytics,
  or test notes.

## Test script

1. Open the dashboard, complete Cloudflare Access, confirm **Cloud AI ready**, and expand
   Service details. Verify the displayed configured identifiers are
   `whisper-large-v3-turbo` and `openai/gpt-oss-20b`, unless the owner has recorded an
   intentional override. Start later performs the separate model-availability check.
2. Select **Enable audio test** to grant permission and populate the device list. Choose
   the intended input, enable the audio test again if the meter stops, speak, and confirm
   the meter moves. Recheck the displayed device name before continuing.
3. Select the spoken source explicitly, choose one target language, and select the
   9-second **Balanced** speech buffer. Confirm the UI says longer windows add latency.
   Later, repeat one short synthetic sample at 6 and 12 seconds to verify cadence and the
   locked value without treating any option as a guaranteed sentence boundary.
4. Add one safe test mapping, such as `Bethlehem => Betlehem`, if appropriate for the
   chosen target. Add one synthetic filter word that is safe to say in the rehearsal.
5. At the primary 1920 × 1080 operator viewport, confirm audio/languages, terminology,
   and service details are grouped on the left, while preview, appearance, and live
   outputs are on the right. Repeat at a 1200px intermediate width. At both 390px and
   320px widths, confirm the same sections form one reachable column without horizontal
   scroll. Confirm the four setup labels match the numbered panels, controls remain easy
   to target, focus remains visible, and live/paused/error states remain understandable
   from their text rather than colour alone.
6. Configure text size, font, colour, per-line highlight, transparency, position, and
   horizontal/vertical safe margins. Confirm the dashboard preview changes during each
   adjustment, then select **Save as default** and reload once to confirm the shared
   Main-channel style returns.
7. If this deployment has no Main channel, select **Create OBS channel**. Copy the URL
   directly into the 1920 × 1080 OBS Browser Source. Existing deployments should return
   the same URL to every approved collaborator; never put it in test evidence.
8. Before starting capture, select **Show test** and confirm localized synthetic text,
   style, and safe margins in OBS without microphone or transcription-attempt activity.
   Select **Clear OBS**, refresh the Browser Source, and confirm it remains blank.
9. Start captions. Open **Mobile translation viewer**, copy its link to the separate
   phone, and confirm the page fits at 390px and 320px with no horizontal scroll. It must
   show only the current moderated target-language caption and status—never source text,
   history, styling data, operator controls, or the OBS URL. Refresh or join late and
   confirm it recovers at most the current caption.
10. Select **Pause**, confirm the meter stops, OBS and mobile caption clear, both links
    stay unchanged, and reserved transcription attempts stop increasing. Show and clear
    another test while paused, then select **Resume** and confirm the test clears before
    listening restarts. Pause at a natural break because the unfinished buffer is discarded.
11. Speak short, approved test phrases containing names, numbers, and a reference, for
   example: “Today we read John chapter three, verse sixteen. The Holy Spirit brings
   hope.” Do not paste or record licensed Bible text as test evidence.
12. Confirm the protected source preview and the public translated preview are sensible.
   Verify the glossary mapping and public mask without expecting the source preview to
   be rewritten.
13. Confirm OBS shows only the public caption. Change each display setting while live and
   confirm the overlay updates without restarting.
14. Note the channel-wide overlay sequence, skipped count, reserved transcription-attempt
    count, and displayed processing-latency range. Confirm the usage UI shows a ceiling of
    900 transcription attempts. The sequence includes synthetic tests and survives End,
    so it is not a per-service caption count. Normal spoken-to-screen delay is the selected
    6, 9, or 12 seconds plus the processing value.
15. Open **Viewer link security**, cancel once, then confirm **Replace mobile link**.
    Confirm the old phone disconnects with a replaced-link message, the new link works,
    and OBS is unaffected. Never place either viewer token in the evidence.
16. Refresh the OBS Browser Source and confirm the latest public caption and style
    return. In a second Access-approved browser, confirm **Main channel already live** and
    **Take over channel** appear instead of a normal Start action. Cancel once, then
    confirm takeover using synthetic audio. Confirm the first operator stops when its next
    stale request is rejected. Confirm the previous service's mobile link is revoked and
    the takeover operator receives a different link.
17. Select **End service**, cancel once, then confirm End. Confirm OBS becomes blank but
    the URL remains unchanged. Start and End a second short service and verify the same
    Browser Source receives it without editing OBS; confirm both service-scoped mobile
    links are invalid after their respective End actions.
18. In a controlled synthetic setup, open Advanced link security, cancel Rotate once,
    then confirm it. Verify the old Browser Source stops and the replacement URL works.
    Do not rotate a production URL without the owner and OBS operator present.

## Deferred native rehearsal — do not run in the current phase

Apple distribution was deferred on 10 August 2026. This checklist is preserved only to
avoid losing prior research. Do not run it or treat it as a current blocker unless the
owner records a new decision that explicitly reopens native distribution.

1. Record the app version/build, exact Git revision, physical iPhone or iPad model, iOS
   version, TestFlight group, configured dashboard origin, and deployed backend revision.
   Do not record signing material, credentials, or the OBS URL.
2. Install through TestFlight, launch from a fresh state, and confirm the native
   approved-audio notice appears before the dashboard. Exercise both view-only and
   microphone-approved paths.
3. Complete Cloudflare Access sign-in. Confirm redirects return to the app, the dashboard
   loads, and the authenticated session survives an ordinary app relaunch without an
   Access bypass or embedded credential.
4. Grant microphone permission, run the audio test, and verify the intended physical
   input and meter. Confirm the produced `audio/mp4` chunks are accepted by the protected
   transcription route using synthetic speech.
5. Repeat the safe terminology, filter, appearance, Start, Pause/Resume, Clear OBS, End,
   and URL-reuse portions of the main script. Use a separate test OBS computer when
   validating the overlay and WebSocket path.
6. Verify portrait and landscape reachability on the physical device, including visible
   blocking, error, and takeover consequence text without horizontal overflow.
7. While live with synthetic audio, background the app, lock the device, interrupt audio,
   and briefly remove the network in separate trials. Confirm capture stops or recovers in
   the documented safe state, no late caption is published, and returning status is
   truthful before any Resume action.
8. Submit content-free TestFlight feedback. Never attach a screenshot containing a
   caption, Access detail, church-private term, or OBS bearer URL.

The iOS feasibility pass is blocked if installation did not originate from TestFlight,
the device is a simulator, the backend revision is unknown, Access is bypassed, a
physical microphone or WebSocket path is untested, or background/device-lock behavior
cannot be demonstrated safely.

## Pass criteria

| Area | Pass evidence |
| --- | --- |
| Access | Unapproved users cannot reach the dashboard or protected APIs. |
| Audio | Intended input is displayed, meter responds, and captions follow its speech. |
| AI | Approved phrases produce usable source and target text without invented content. |
| Prompt behavior | Idioms are natural; intentional repetition remains; incomplete or familiar quoted content is not invented or completed. |
| Biblical terms | Agreed names/references are recognizable; mapping is applied where tested. |
| Public safety | Configured mask affects public text without changing protected source text. |
| OBS | Public captions and all chosen styles appear at the intended canvas position. |
| Mobile viewer | At 320px and 390px it shows only current moderated target text/status; late join works; replacement, End, expiry, and takeover revoke the correct link without changing OBS. |
| Layout | Desktop grouping is correct; mobile is reachable with no horizontal overflow; appearance changes update the preview continuously. |
| Theme | Operator UI is monochrome with readable hierarchy and focus; OBS caption colours remain independently configurable. |
| Controls | Pause stops capture/AI and clears OBS; Resume retains URL/expiry; idle and paused tests make no AI request. |
| Ownership | A second start is blocked; confirmed takeover replaces the prior controller without mixed captions. |
| Recovery | Reload recovers the same controller paused; End preserves the URL; Rotate alone invalidates it. |
| Performance | Processing latency, skipped chunks, and transcription usage stay inside stakeholder-agreed limits. |
| Buffer | 6-, 9-, and 12-second choices match observed cadence, remain locked while active, and communicate the latency tradeoff. |
| Cost | Provider dashboards show no paid usage or unexpected concurrent consumption. |

Any failed safety, access, wrong-input, fabricated-content, or public-filter check is a
test failure. Accuracy and latency cannot pass until stakeholders define numeric or
sample-based thresholds for the intended service.

## Known limitations

- The app records fixed 6-, 9-, or 12-second windows; the UI latency number excludes that
  recording time. Fixed windows can reduce fragmentation but cannot detect every complete thought.
- One target language is supported per service. There is no source-caption fallback,
  manual correction, history, archive, or sermon summary.
- The usage bar covers only the current Main-channel service. Its server-owned
  transcription counter survives reload and takeover, but it is not a provider billing
  meter. Free tiers have no availability guarantee.
- Language and theological quality remain unvalidated for the full supported matrix.
- Device unplug/replug, long network loss, provider quota/outage, Access expiry, and a
  complete 90-minute service still require controlled validation.
- The reusable OBS URL is a long-lived bearer credential. Rotation is the incident response,
  not a normal per-service action.
- The mobile viewer URL is a service-scoped bearer credential. It shows one current
  caption, not scrolling history or multiple target languages.
- The iOS shell has only stale pre-hardening unsigned simulator and generic-device
  archive evidence; the hardened sources compile, but their complete build and four-test
  run remain pending. Apple signing, upload, TestFlight installation, physical-device
  microphone/WebKit behavior, and compatibility with the protected deployed backend
  remain unvalidated.

## Evidence template

Record metadata only; do not record credentials, URLs, audio, or caption content.

```text
Date/time and tester:
Deployed Git revision:
Client and version/build (browser or TestFlight):
Browser/device and OS:
TestFlight group and installation result (if applicable):
Configured dashboard origin and backend revision (no tokens):
Audio device:
OBS version and computer:
Configured transcription / translation models:
Observed chunk cadence / displayed transcription ceiling:
Selected speech buffer / locked-value result:
Source -> target:
Synthetic/consented data approval:
Duration:
Overlay sequence / skipped count / reserved transcription attempts:
Processing-latency range:
OBS style/reload/revocation result:
Mobile viewer late-join/replacement/End/takeover result:
Groq and Cloudflare Free-plan check:
Issues and timestamps (no private content):
Overall pass / fail / blocked:
```

Stop immediately for an unintended audio input, private content, exposed credential,
OBS URL, or mobile viewer link, Access bypass, public-filter failure, sustained provider
errors, or any sign of paid usage. End the service, replace an exposed mobile link or
rotate an exposed OBS URL as appropriate, preserve only content-free
timing metadata, and report
through the private process in [SECURITY.md](../SECURITY.md) when security is involved.
