# Stakeholder test guide

## Purpose

This guide covers a controlled usability and technical rehearsal of the Phase 1 cloud
prototype. Passing it supports a decision about the next pilot step; it is not a
production, theological, accessibility, or every-language certification.

Test the deployed dashboard at
<https://church-live-caption.lukas-ka.workers.dev/>. Stop if its ownership or environment
cannot be confirmed by the project owner.

## Before the test

- Use a recent Chrome or Edge browser and a stable internet connection.
- Confirm the tester's email is approved in Cloudflare Access.
- Use the intended microphone or audio interface and verify its name in the dropdown.
- Install OBS on the intended streaming computer and prepare a 1920 × 1080 Browser
  Source.
- Confirm with the owner that Groq ZDR is enabled and both provider accounts remain on
  the intended Free plans. Never send or paste keys to a tester.
- Use synthetic speech or a recording with explicit consent. Do not use confidential
  sermon, pastoral, member, or counselling content.
- Reserve 10–15 minutes for one source/target pair. End the session when finished.
- Do not put an active OBS URL in screenshots, tickets, chat, analytics, or test notes.

## Test script

1. Open the dashboard, complete Cloudflare Access, and confirm **Cloud AI configured**.
2. Select **Enable audio test** to grant permission and populate the device list. Choose
   the intended input, enable the audio test again if the meter stops, speak, and confirm
   the meter moves. Recheck the displayed device name before continuing.
3. Select the spoken source explicitly and choose one target language.
4. Add one safe test mapping, such as `Bethlehem => Betlehem`, if appropriate for the
   chosen target. Add one synthetic filter word that is safe to say in the rehearsal.
5. Configure text size, font, colour, per-line highlight, transparency, position, and
   horizontal/vertical safe margins. Save the display preference and reload once to
   confirm it.
6. Start the caption session. Copy the generated URL directly into the OBS Browser
   Source; set its width and height to 1920 × 1080.
7. Select **Pause capture** and confirm the input meter stops, OBS clears, the session
   URL remains unchanged, and transcription requests stop increasing. Select **Show test
   caption** and confirm the localized synthetic text and safe margins in OBS.
8. Select **Clear caption**, refresh the OBS Browser Source, and confirm it remains blank.
   Select **Resume capture** and confirm the test is cleared before listening restarts.
9. Speak short, approved test phrases containing names, numbers, and a reference, for
   example: “Today we read John chapter three, verse sixteen. The Holy Spirit brings
   hope.” Do not paste or record licensed Bible text as test evidence.
10. Confirm the protected source preview and the public translated preview are sensible.
   Verify the glossary mapping and public mask without expecting the source preview to
   be rewritten.
11. Confirm OBS shows only the public caption. Change each display setting while live and
   confirm the overlay updates without restarting.
12. Note caption count, skipped count, and the displayed processing-latency range. The
    normal spoken-to-screen delay is about four seconds plus that processing value.
13. Refresh the OBS Browser Source and confirm the latest public caption and style
    return.
14. Select **End session**, cancel once to verify protection, then confirm End. Confirm
    the current caption disappears. The old URL should become unusable; it can display
    reconnecting status for roughly 34 seconds before the final invalid/expired message.

## Pass criteria

| Area | Pass evidence |
| --- | --- |
| Access | Unapproved users cannot reach the dashboard or protected APIs. |
| Audio | Intended input is displayed, meter responds, and captions follow its speech. |
| AI | Approved phrases produce usable source and target text without invented content. |
| Biblical terms | Agreed names/references are recognizable; mapping is applied where tested. |
| Public safety | Configured mask affects public text without changing protected source text. |
| OBS | Public captions and all chosen styles appear at the intended canvas position. |
| Controls | Pause stops capture/AI and clears OBS; Resume retains the URL; Clear and test behave as labelled. |
| Recovery | Reload restores current caption/style or cleared state; ended URL becomes unusable. |
| Performance | Processing latency and skipped chunks stay inside stakeholder-agreed limits. |
| Cost | Provider dashboards show no paid usage or unexpected concurrent consumption. |

Any failed safety, access, wrong-input, fabricated-content, or public-filter check is a
test failure. Accuracy and latency cannot pass until stakeholders define numeric or
sample-based thresholds for the intended service.

## Known limitations

- The app records four-second chunks; the UI latency number excludes that recording time.
- One target language is supported per session. There is no source-caption fallback,
  manual correction, history, archive, or sermon summary.
- The usage bar covers only the current browser session and is not a provider billing
  meter. Free tiers have no availability guarantee.
- Language and theological quality remain unvalidated for the full supported matrix.
- Device unplug/replug, long network loss, provider quota/outage, Access expiry, and a
  complete 90-minute session still require controlled validation.
- A revoked overlay may remain in reconnecting state for roughly 34 seconds before its
  final message, although the room is cleared immediately.

## Evidence template

Record metadata only; do not record credentials, URLs, audio, or caption content.

```text
Date/time and tester:
Browser and OS:
Audio device:
OBS version and computer:
Source -> target:
Synthetic/consented data approval:
Duration:
Caption count / skipped count:
Processing-latency range:
OBS style/reload/revocation result:
Groq and Cloudflare Free-plan check:
Issues and timestamps (no private content):
Overall pass / fail / blocked:
```

Stop immediately for an unintended audio input, private content, exposed credential or
overlay URL, Access bypass, public-filter failure, sustained provider errors, or any sign
of paid usage. End the session, preserve only content-free timing metadata, and report
through the private process in [SECURITY.md](../SECURITY.md) when security is involved.
