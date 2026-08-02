# Product specification

## Product vision

Help churches provide accessible, multilingual live captions without requiring a
specialist translation team, while respecting theological context, privacy, free-plan
constraints, and the needs of a live-stream operator.

The product assists an operator; it does not replace a human interpreter or theological
reviewer and must never invent speech, scripture, or doctrine.

## Current prototype users

- **Operator:** selects audio and languages, supplies terms and filter words, styles the
  caption, manages the reusable Main OBS channel, and controls a live service.
- **Viewer:** reads the current moderated caption through the stream overlay.

Reviewer, pastor/approver, administrator, and workspace-member roles belong to the future
archive and summary product. They are not implemented in the current prototype.

## Implemented service journey

### Before the service

1. The operator signs in through Cloudflare Access.
2. The operator chooses a browser-visible microphone or audio interface and confirms its
   input level.
3. The operator selects a spoken language or automatic detection and one target language.
4. The operator optionally enters bounded keyword/preferred-translation pairs and public
   mask words.
5. The operator configures font, size, colour, line highlight, transparency, position,
   and horizontal/vertical safe margins beside the preview. Each change updates the
   dashboard preview immediately; the shared channel style and browser fallback can then
   be saved.
6. On first use, an approved operator creates the reusable Main OBS channel, copies its
   URL into a 1920 × 1080 Browser Source, and shows/clears a synthetic test while idle.
7. The operator starts a 90-minute service; the app verifies Access, Groq credentials,
   model availability, microphone access, and exclusive controller ownership.

### During the service

1. The browser records four seconds of audio at a time.
2. The protected API transcribes the chunk with bounded church/biblical hints.
3. If source and target differ, the protected API translates with up to four recent
   source captions and approved term mappings.
4. Deterministic processing applies preferred translations and masks configured whole
   terms in the public form.
5. The operator sees source and public previews, status, post-recording processing
   latency, dropped chunks, elapsed service time, and transcription request count.
6. The latest public caption and style are published to the read-only Main OBS channel.
7. OBS reconnects after temporary channel loss and receives the latest caption.
8. The operator can Pause capture and AI without changing the OBS URL or expiry, Clear
   the current public caption, or show a localized synthetic test while paused.
9. A second operator is blocked unless they explicitly confirm takeover. Takeover clears
   OBS, replaces controller ownership, and causes stale operations to stop the old mic.

### After the service

1. The operator selects End and confirms it.
2. The Worker stops the service and clears public/controller state. If deactivation
   cannot be confirmed, the dashboard retains controller state and offers Retry End.
3. The OBS URL and shared style remain ready for the next service. Only a separately
   confirmed Rotate action revokes the bearer URL and requires updating OBS.
4. The app retains no sermon transcript, summary, or audio.

## Supported languages

Source audio and target text support:

- English (`en`)
- Indonesian (`id`)
- Japanese (`ja`)
- Korean (`ko-KR`)
- Tagalog (`tl-PH`)
- Chinese Simplified (`zh-Hans`)
- Chinese Traditional (`zh-Hant`)
- Vietnamese (`vi`)

“South Korean” is not a separate language option. Both Chinese choices use Chinese
speech recognition and differ in output-script instruction. The Phase 1 assumption is
Mandarin; Cantonese requires a separate language and model-quality decision.

## Current functional requirements

### Audio and transcription

- Browser permission is explicit and the selected input has a visible level meter.
- Audio is mono with browser echo cancellation and noise suppression requested.
- Four-second files and a maximum two-chunk queue bound memory and backlog.
- Source selection can be explicit or automatic; explicit selection is preferred live.
- The hint prompt preserves biblical names, Bible books, verse numbers, church names,
  locations, and operator-provided vocabulary.
- Raw audio is neither logged nor stored by this application.

The current provider emits finalized segments only. Interim word-by-word captions,
confidence indicators, speaker diarization, and device hot-swap recovery are not
implemented.

### Translation and biblical context

- One target language is active per service.
- Up to four recent source captions provide bounded context.
- Approved mappings are requested from the model and enforced deterministically after
  translation.
- Chinese output receives an explicit Simplified or Traditional instruction.
- The model is instructed not to invent Bible verses, doctrine, facts, or unsaid meaning.

The app uses prompting and glossary mappings, not custom model training or a licensed
Bible retrieval corpus. Output can still be inaccurate and needs validation by the
church for important names, references, and theological terms.

### Keywords and public filtering

The prototype accepts up to 40 glossary rows and 40 filter terms. A glossary row can
provide a canonical source term and a preferred target translation. Keyword terms are
also sent as bounded transcription hints.

Public filtering currently masks configured whole terms after translation. It does not
alter the protected source preview. Replace, hide, scope, priority, phonetic variants,
and persistent workspace rules are future features.

### Caption display and OBS

- The operator console uses a minimal light monochrome theme; status text and control
  labels do not depend on colour alone.
- Font size: 10–72px.
- Font: sans-serif, serif, or monospace.
- Text and line-highlight colours.
- Highlight transparency: 0–100%.
- Horizontal alignment: left, centre, or right.
- Vertical placement: top, middle, or bottom.
- Horizontal and vertical safe margins: 0–20%, defaulting to 4% and 6%.
- Transparent overlay canvas with per-line background highlight.
- One read-only reusable Main-channel URL with automatic reconnect, server-assigned
  sequence protection, and explicit rotation.
- The shared style persists in the channel; the browser preference remains a fallback.
  Neither browser storage contains the OBS token.

Pause stops microphone capture, clears queued audio and public display, and blocks late
caption writes while keeping the original URL and expiry. Resume clears any synthetic
test before capture restarts. Clear does not pause capture, so the next valid live
caption may replace the blank display.

The prototype does not yet offer line-count, outline, transition, multiple channels, or
named display profiles.

### Usage and cost controls

- Active services stop after at most 90 minutes; paused time still counts.
- Audio chunks are fixed at four seconds.
- A service supports one translation target and no automatic paid fallback.
- A quota response stops the affected service without revoking its OBS URL.
- The UI shows active-service elapsed time and transcription request progress.

The usage meter is not an account billing meter. It cannot see concurrent services or
usage by other applications in the same Groq organization or Cloudflare account. Owners
must keep provider accounts on the intended Free plans and verify their dashboards.

## Prototype acceptance criteria

Code-level acceptance:

- An operator can select an input, source, and target.
- Supported audio is transcribed and translated through protected cloud APIs.
- A preferred term can affect transcription guidance and translated output.
- A configured mask changes public output without changing the protected source preview.
- Style changes reach a connected overlay without restarting the service.
- Appearance controls update the dashboard design preview continuously before Save.
- Setup keeps audio, languages, terminology, and service details on the left, with the
  preview, appearance controls, and OBS Browser Source on the right at desktop widths.
- The dashboard theme does not override the independently configured OBS caption colour
  or highlight.
- Pause stops AI requests, clears OBS, and Resume retains the reusable URL and expiry.
- Clear survives overlay reload; idle-or-paused test captions make no AI request.
- Safe margins are bounded, saved, restored, and propagated live.
- An overlay can reconnect and recover the latest public caption.
- End and expiry clear OBS while preserving the reusable URL; Rotate invalidates it.
- Second starts fail with `channel_in_use`; confirmed takeover rejects stale controllers.
- Reload with the same tab controller recovers in a safe paused state.
- Production operator mutations fail closed without valid Access configuration.
- Audio and sermon transcripts are not persisted by the application.

Pilot acceptance still requires evidence from synthetic or explicitly approved tests:

- acceptable accuracy for every supported language and agreed accents;
- correct handling of representative biblical names and references;
- acceptable end-to-end latency and dropped-chunk rate for a full service;
- verified microphone/audio-interface and OBS compatibility;
- safe behavior for network loss, provider timeout, quota exhaustion, device loss,
  Access expiry, token revocation, and Worker-limit exhaustion; and
- confirmed provider usage within the active account's Free-plan envelope.

The 20 July 2026 production smoke test exercised the core cloud/OBS journey, style
updates, reconnect, revocation, and edge-access boundaries. It did not sign off language
quality, a complete 90-minute run, quota/outage behavior, or a real OBS production
computer. Those remain stakeholder and pilot acceptance work.

## Deferred archive and summary product

The requested sermon archive and biblically contextual summary are valuable but require
a new consent and data architecture. A future approved design may include:

- explicit recording and retention state visible to the operator;
- church workspaces and owner, admin, operator, reviewer, and viewer roles;
- separate source, translated, corrected, and public transcript forms;
- licensed Bible-reference profiles with version and language metadata;
- grounded summary sections such as theme, outline, key points, mentioned passages,
  applications, and uncertainty warnings;
- human editing and approval before publication;
- export, deletion, retention expiry, audit, and backup controls; and
- hard storage and AI cost limits.

A summary must distinguish words actually spoken from a model inference, a paraphrase,
and retrieved Bible material. It must not manufacture a citation or present retrieved
text as a preacher's quotation.

## Decisions required before persistent data or a live pilot

1. Which Bible versions and translations may be used, under what licence?
2. Who approves church-specific theological terminology?
3. What caption latency and error rate are acceptable for each language?
4. Is live manual correction required before captions reach OBS?
5. Should translation failure skip the caption or deliberately fall back to source text?
6. What is the device-disconnect and internet-loss operating procedure?
7. For archives, what consent notice, retention period, transcript forms, export, and
   deletion process are required?
8. How many simultaneous services, operators, and overlay viewers are expected?
9. What provider-account monitoring or external hard cap is required beyond the
   browser-local usage indicator?
