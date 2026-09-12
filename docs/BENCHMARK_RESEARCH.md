# Church Live Caption: external benchmarks and improvement priorities

Research date: 11 September 2026. All external sources below were accessed on
2026-09-11. This is a comparison of published official workflows, not a hands-on
performance test, procurement recommendation, or accessibility certification.

Church Live Caption already implements the essential small-church workflow:
browser audio capture, church terminology, operator previews, an OBS overlay,
and a separate mobile audience page. Its strongest next step is a measured,
repeatable service rehearsal. Commercial products establish useful interaction
patterns; they do not establish this application's translation quality or justify
expanding its current free-cloud scope.

The local baseline comes from [README](../README.md),
[Product specification](PRODUCT_SPEC.md), and [Roadmap](ROADMAP.md). The
[Gap analysis](GAP_ANALYSIS.md) records implementation findings. This document
keeps external evidence separate from those local findings.

## Comparable products

Three direct comparators cover AI church/event translation. OBS provides the
adjacent broadcast integration benchmark. Features below are vendor-documented;
availability can depend on plan, configuration, or service agreement.

| Benchmark | Operator and audience workflow | Terminology, correction, and display | Cost boundary and useful lesson |
| --- | --- | --- | --- |
| **Wordly** — direct church translation comparator | Hosts configure a session and audio input. Wordly recommends reusing a weekly worship session. Audiences join by QR code or URL without creating an account, then choose a language and read captions or listen. | Custom glossaries support church names and terms. Output can appear on audience devices, monitors, or presentations. The reviewed sources do not establish a live operator-correction workflow. | Published pricing uses purchased hours with a 12-month use period; all supported languages are included in the stated package model. Request a church-specific quote before comparing total cost. Adopt the clear preparation/joining journey while keeping this app's audience link service-scoped and its OBS URL reusable. [Worship setup](https://help.wordly.ai/setting-up-wordly-for-your-place-of-worship), [workflow](https://www.wordly.ai/translation-software), [pricing](https://www.wordly.ai/pricing) (accessed 2026-09-11). |
| **spf.io** — direct church translation and review comparator | Audience View supports phone access by URL/QR and language selection. Projector View can show up to four languages. Website embedding and OBS integration address online worship. | Its church offering documents live caption review/editing, manuscript release, keyword boosting, and an autoreplacement database. It also offers human captioners/interpreters. These are workflow capabilities, not independent proof of theological accuracy. | Church pricing varies with usage, including languages, services, and attendees. Compare an explicit scenario rather than infer a universal subscription. The useful next capability is a deliberate correction workflow and reusable approved terminology, after the current pilot establishes demand. [Church offering](https://www.spf.io/solutions/religious/), [pastor's guide](https://www.spf.io/solutions/religious/multilingual-ministry-pastors-guide/) (accessed 2026-09-11). |
| **LiveVoice** — direct live-event/church delivery comparator | Setup separates event, audio channel, spoken language, and audio start. Participants receive a link, QR code, or six-digit code. Its join guide distinguishes app and browser behavior. | Live Captions transcribes the original audio channel; translated subtitles are a separate AI feature. Display options include audience devices, fullscreen, and lower thirds. Glossaries are documented for SMART and PRO customers. Browser audio may stop on phone lock or app switching; this does not establish a limitation of this app's text viewer. | Pricing combines an account plan with optional AI services billed per minute per language; transcription and translation have different rates. The operator must stop the channel to avoid continued usage. Adopt visible capture state, clear stop behavior, and separate usage concepts. [Caption setup](https://livevoice.io/en/help/article/live-captions-setup), [joining](https://livevoice.io/en/help/guide/rsi-setup/article/join-as-participant), [pricing](https://livevoice.io/en/pricing) (accessed 2026-09-11). |
| **OBS Browser Source** — adjacent integration comparator, not an AI translator | Loads a URL into a configurable viewport. OBS separately controls whether a source unloads when hidden and refreshes when a scene becomes active. | Browser Source supports transparent backgrounds and custom CSS. Caption content, formatting, and recovery remain the application's responsibility. | The referenced page establishes integration behavior, not hosting or AI costs. Preserve the existing reusable source URL; show the intended 1920 × 1080 setup and test the actual source through scene changes and reloads. [Official Browser Source documentation](https://obsproject.com/kb/browser-source) (accessed 2026-09-11). |

No benchmark above was tested with this church's microphones, language pairs,
sermon vocabulary, network, or intended audience. No independently measured
accuracy, latency, uptime, or contractual SLA is established by this research.
Claims such as instant translation or improved accuracy must remain vendor
claims until assessed with the same approved recordings and scoring method.

## What the comparison means for this product

| Area | Documented local position | Recommendation and boundary |
| --- | --- | --- |
| Volunteer setup | Guided Setup, device selection, meter, language settings, test output, and separate Live workspace already exist. | Make the next required action and active state obvious. A configured device is not proof that audio reaches transcription. A saved OBS URL is not proof that OBS receives or displays output. |
| Audience joining | One replaceable, service-scoped mobile link; one active target language; latest public translation only. | Improve copy/open feedback and explain link expiry. A locally generated QR code is a useful subsequent addition if joining tests reveal friction. Encode only the mobile link; never send a bearer link to an external QR service. |
| Readability | Independent OBS style controls and safe margins; a separate mobile viewer. | Give mobile readers a simple local text-size preference without changing the broadcast style or storing captions. Test long translated segments before adding line limits; arbitrary truncation would discard meaning. |
| Translation quality | Bounded terminology, preferred translations, masking, contextual translation, and explicit draft refresh. | Establish a church-approved test corpus and glossary ownership. Decide whether correction means holding before publication or revising an already-public caption. Those are different workflows with different delay and revision semantics. |
| Recovery | Reconnect, late join, sequence/revision protection, takeover, link replacement, and service expiry are documented. | Exercise the whole deployed journey and physical audio-device loss. Distinguish listening, processing, waiting, reconnecting, paused, and ended when evidence supports each state. |
| Latency | Capture uses 6-, 9-, or 12-second windows; the existing processing metric is not complete spoken-to-screen delay. | Measure capture, queue wait, provider processing, publish, and display separately. Preserve the exact meaning of the displayed metric until complete instrumentation exists. |
| Cost | Ninety-minute services, up to 900 reserved transcription attempts, service-local usage, and no automatic paid fallback. | Keep provider/account limits separate from service counters. Unknown provider quota is unavailable, not zero. Show the existing stop behavior clearly; do not imply the counter guarantees remaining free capacity. |
| Persistent and expanded features | Archives, summaries, native distribution, multiple simultaneous targets, and church accounts remain deferred. | Keep them deferred. Reopen only with a demonstrated user need and explicit decisions on consent, retention, review, access, and recurring cost. |

The joining and terminology recommendations are inferences from the documented
Wordly, spf.io, and LiveVoice patterns in the comparison. The remaining priorities
combine the repository's stated constraints with the accessibility criteria below.
They are proposed product decisions, not features this research claims to implement.

## Accessibility criteria for the UI work

Use WCAG 2.2 AA as an evaluation target. A cleaner layout or successful automated
scan does not establish conformance across the complete operator and audience
journeys. The W3C Understanding pages explain the criteria; the
[WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) is the normative source
(accessed 2026-09-11).

| Principle | Applicable criterion | Concrete check for this app |
| --- | --- | --- |
| Readable text and controls | Normal text generally needs 4.5:1 contrast; qualifying large text needs 3:1. These are text criteria, not a blanket rule for every visual element. [SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) (accessed 2026-09-11). | Measure labels, hints, states, and buttons against their actual backgrounds. Evaluate user-selected caption colours separately, especially with transparent highlights and changing video. |
| Reflow and zoom | Content should reflow at the equivalent of 320 CSS pixels without two-dimensional scrolling, subject to the criterion's exceptions. [SC 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) (accessed 2026-09-11). | Check operator and viewer pages at 320px and 390px, and browser zoom. Long captions, links, prompt controls, and sticky actions must remain usable. |
| Keyboard visibility | Keyboard focus must be visible; author-created content must not entirely obscure the focused component. [SC 2.4.7](https://www.w3.org/TR/WCAG22/#focus-visible), [SC 2.4.11](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum) (accessed 2026-09-11). | Traverse tabs, disclosure controls, confirmation dialogs, and all actions. Check that the mobile action bar does not hide focus and dialogs restore focus appropriately. |
| Usable targets | The AA minimum is 24 × 24 CSS pixels or qualifying spacing/exceptions. The existing 44px control-height requirement is a stronger product choice; it is not the AA minimum. [SC 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (accessed 2026-09-11). | Retain generous controls; inspect small icon buttons, close controls, and adjacent links rather than checking primary buttons alone. |
| Understandable status | Status changes should be available to assistive technology without moving focus. Excessive live-region announcements can impede use. [SC 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) (accessed 2026-09-11). | Announce meaningful connection, pause, failure, and copy results. Do not announce every timer tick or microphone-meter update. Validate caption announcements with actual screen-reader users. |
| Accessible live media | Live captions concern synchronized audio information, including relevant speaker identification and non-speech sound. Translation of dialogue alone does not establish this requirement. [SC 1.2.4](https://www.w3.org/WAI/WCAG22/Understanding/captions-live.html) (accessed 2026-09-11). | Describe current output honestly as near-live AI captions/translation. Assess synchronization, names, music, speaker changes, and reading time with the intended audience before claiming live-caption accessibility. |

These criteria guide practical fixes. They do not prescribe a particular visual
theme, require an animation library, or justify installing a new UI framework.
The existing native controls, React components, and CSS can support this work.

## Recommended sequence and evidence

1. **Finish the current UI and truthfulness pass.** Make setup readiness, active
   versus draft settings, public output, and the main live controls easy to scan.
   Keep the consequences of Pause, Clear, End, takeover, and translation refresh
   explicit. Verify desktop, intermediate, and mobile layouts, keyboard use,
   focus, contrast, and screen-reader status behavior. A browser preview supports
   these checks; it does not prove OBS connectivity or real inference.
   Update, 12 September: the local UI changes and automated checks are complete;
   intended-user and assistive-technology rehearsal remains. See the
   [validation report](VALIDATION_REPORT.md#follow-up-usability-review--12-september-2026).
2. **Close critical implementation gaps, then rehearse a verified test deployment.**
   Resolve the transcription dispatch claim and the pilot-specific correctness gates in
   [G01, G06, and G07](GAP_ANALYSIS.md) first. Follow the
   [stakeholder guide](STAKEHOLDER_TEST_GUIDE.md). Record the deployed revision and
   provider models. Use synthetic or approved audio and the intended mixer,
   operator device, OBS computer, and audience phones. Exercise two consecutive
   services with the reusable OBS source, audience late join, pause/resume,
   draft refresh, replacement, takeover, expiration, and network interruption.
3. **Score quality and delivery before selecting the next feature.** Have an
   authorized bilingual reviewer evaluate each intended language direction.
   Include biblical names, verse references, negation, numbers, code-switching,
   rapid speech, silence, music, and long utterances. Record terminology errors,
   meaning-changing errors, dropped segments, and operator interventions.
   Report word-onset-to-display and utterance-end-to-display delay separately,
   including median and p95 when the sample supports them. Do not call a provider
   request duration end-to-end latency.
4. **Choose the smallest improvement supported by the rehearsal.** Prioritize
   device-loss/recovery fixes for interruptions, reviewed correction for
   unacceptable meaning errors, and mobile joining/readability for audience
   friction. Test alternative segmentation or providers only against the same
   corpus. Agree numeric latency, quality, and recovery thresholds before a
   go/no-go decision; this research supplies no validated universal threshold.
5. **Authorize a limited pilot only after its gates pass.** Name operators and
   reviewers, document stopping and recovery procedures, verify actual account
   limits, and preserve the current data boundaries. Add multiple languages,
   persistent church profiles, audio delivery, or archives only through a new
   scoped decision.

For any paid comparison, use the same planning case: number and duration of
services, input and output languages, audience size, concurrent sessions,
retention requirements, support coverage, and tax/currency assumptions. Include
base plans, usage, support, and overages. A per-minute AI price alone is not the
total operating cost, and a free prototype without a production SLA is not
equivalent to a managed service.
