# Product specification

UI, local inference safeguards, and current limitations reviewed 12 September 2026.

## Product vision

Help churches provide accessible, multilingual live captions without requiring a
specialist translation team, while respecting theological context, privacy, free-plan
constraints, and the needs of a live-stream operator.

The product assists an operator; it does not replace a human interpreter or theological
reviewer and must never invent speech, scripture, or doctrine.

## Current prototype users

- **Operator:** selects audio and languages, supplies terms and filter words, styles the
  caption, manages the reusable Main OBS channel, and controls a live service.
- **Stream viewer:** reads the current moderated caption through the OBS output.
- **Mobile viewer:** opens a service-scoped read-only link and sees the latest moderated
  translation without operator access or transcript history.

Reviewer, pastor/approver, administrator, and workspace-member roles belong to the future
archive and summary product. They are not implemented in the current prototype.

The first evaluation direction is **Indonesian→English**, with **Operator** selected as
the human reviewer outside the app. [All 30 prepared samples](evaluation/ID_EN_REVIEW.md)
still await review; no language-quality gate has passed. This is not a new application
role or approval queue.

The repository retains a deferred iPhone/iPad feasibility shell for the operator. It is
not part of the current product scope, active acceptance, or release plan. The browser is
the sole active client. See [`ios/README.md`](../ios/README.md).

## Implemented service journey

### Before the service

On a browser's first visit, a six-step modal guide explains the setup, USB audio
interface, languages, separate OBS computer, audience link, and live controls. Users
can move between steps, skip with a button or Escape, and reopen it with **How to use**.
A step shortcut opens its related panel and focuses the panel heading. Reopening returns
to the same step until page reload. Phones use a compact, labelled step selector.
It opens automatically only after channel loading settles and no service is active.
Manual replay during a service states that the service continues. The guide changes no
translation setting, requests no microphone permission, and never starts a service.

1. The operator signs in through Cloudflare Access.
2. The operator chooses a browser-visible microphone or audio interface and confirms its
   input level.
3. The operator selects a spoken language or automatic detection, one target language,
   and a 6-, 9-, or 12-second speech buffer. The UI explains that more context adds the
   same amount of caption delay.
4. The operator optionally enters bounded keyword/preferred-translation pairs and public
   mask words, and may edit the reviewed operator translation prompt.
5. The operator configures font, size, colour, line highlight, transparency, position,
   and horizontal/vertical safe margins beside the preview. Each change updates the
   dashboard preview immediately; the shared channel style and browser fallback can then
   be saved.
6. On first use, an approved operator creates the reusable Main OBS channel, copies its
   URL into a 1920 × 1080 Browser Source, and shows/clears a synthetic test while idle.
7. The operator starts a 90-minute service; the app verifies Access, Groq credentials,
   model availability, microphone access, and exclusive controller ownership.
   Service details show the configured transcription and translation model identifiers;
   the readiness check confirms their availability when Start is selected.

### During the service

1. The browser records the active 6-, 9-, or 12-second window at a time.
2. The protected API transcribes the chunk with bounded church/biblical hints.
3. If source and target differ, the protected API translates with an immutable server
   safety/output envelope, the active bounded operator prompt, up to four recent source
   captions, and approved mappings.
4. Deterministic processing applies preferred translations and script-aware whole-term
   masking in the public form. Incomplete provider output is skipped before publication.
5. The operator sees source and public previews, status, channel-wide overlay sequence,
   post-recording processing latency, dropped chunks, elapsed service time, and the
   server-owned reserved transcription-attempt count for the active service.
6. The latest public caption and style are published to the read-only Main OBS channel.
7. OBS reconnects after temporary channel loss and receives the latest caption.
8. The operator can Pause capture and AI without changing the OBS URL or expiry, Clear
   the current public caption, or show a localized synthetic test while paused.
9. A second operator is blocked unless they explicitly confirm takeover. Takeover clears
   OBS, replaces controller ownership, and causes stale operations to stop the old mic.
10. The operator can copy a separate mobile link. A viewer receives only current
    moderated target text and service status. Confirmed replacement revokes that link
    without changing OBS.
11. Source/target language, terminology, public filters, buffer duration, and operator
    prompt remain editable as drafts. After review, the operator confirms **Refresh
    translation session** to apply them together. Refresh clears unfinished audio, recent
    translation context, and current output but does not end or extend the service, change
    live/paused state, replace controller ownership, or rotate the mobile/OBS links.

### After the service

1. The operator selects End and confirms it.
2. The Worker stops the service, revokes the mobile link, and clears public/controller
   state. If deactivation
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

### Deferred iOS feasibility client

This section records the preserved experiment, not a current functional requirement.

- The shell targets iPhone and iPad on iOS 17 or newer and uses SwiftUI plus `WKWebView`.
- A native preflight explains cloud processing, requests microphone permission explicitly,
  and allows view-only access when the microphone is unavailable or declined.
- `APP_BASE_URL` must be HTTPS and must not contain embedded credentials.
- WebKit microphone permission is granted only to the exact configured dashboard origin;
  other media types, frames, and origins are denied. In-app navigation is limited to the
  dashboard and Cloudflare Access, and the native state bridge accepts only bounded
  messages from the dashboard main frame.
- The shell hosts the existing web Setup and Live journeys. Cloudflare Access, inference,
  Durable Object state, OBS delivery, limits, and retention behavior remain unchanged.
- Background audio is not enabled. Becoming inactive stops capture and requests a server
  pause; foregrounding reloads the authoritative channel into a safe paused state. This
  code compiled during a simulator build attempt, but complete simulator and
  physical-device lifecycle validation is still pending.
- No Cloudflare, Groq, OBS, Apple, controller, or signing credential is embedded in the
  target.

Version 0.1.0 build 1 and the candidate bundle identifier
`com.lukaskawira.churchlivecaption` are preserved experiment metadata only. The owner
deferred paid Apple distribution on 10 August 2026. No signing, TestFlight, or App Store
work belongs to the current phase.

### Audio and transcription

- Browser permission is explicit and the selected input has a visible level meter.
- Audio is mono with browser echo cancellation and noise suppression requested.
- The operator chooses a 6-, 9-, or 12-second window. The 6-second default preserves the
  existing fast path; longer choices can reduce fragmentation but add equal latency.
- The active-setting snapshot for each chunk and maximum two-chunk queue bound memory and
  backlog. Pause or confirmed translation refresh discards an unfinished active window,
  so operators should use either control at a natural break.
- Source selection can be explicit or automatic; explicit selection is preferred live.
- The hint prompt preserves biblical names, Bible books, verse numbers, church names,
  locations, and operator-provided vocabulary.
- Raw audio is neither logged nor stored by this application.

The current provider emits finalized segments only. Interim word-by-word captions,
confidence indicators, speaker diarization, and device hot-swap recovery are not
implemented.

### Translation and biblical context

- One target language is active per translation revision within a service.
- Up to four recent source captions provide bounded context.
- Approved mappings are requested from the model and enforced deterministically after
  translation.
- Chinese output receives an explicit Simplified or Traditional instruction.
- A reviewed operator prompt prioritizes natural target-language grammar and idioms while
  preserving evident tone, formality, slang, and intentional rhetorical repetition. It is
  editable up to 4,000 characters; blank restores the reviewed default, while non-text,
  overlength, or unsupported-control-character values fail validation without truncation.
- A separate immutable server envelope fixes language direction, Chinese script,
  untrusted-data handling, non-invention, and exactly-one-caption output. The operator
  cannot edit that envelope, and the model is instructed to prioritize it over conflicting
  custom text; this prompt ordering is risk reduction, not guaranteed enforcement. The
  request is one bounded model call rather than an agent.
- The model is instructed not to invent or complete Bible verses, songs, quotations,
  doctrine, facts, missing words, or unsaid meaning.
- Current caption, approved terms, and recent context are structured as untrusted data.
  Context may resolve ambiguity but must not be translated, repeated, or summarized.
- Publishable model output must be nonempty text with provider finish reason `stop`.
  Other completions are skipped with an operator message and skipped-count increment;
  available usage is persisted before the `422 translation_incomplete` response.
  Missing or failed usage acknowledgement stops capture. A correctly translated source
  fragment may remain incomplete speech; `stop` does not prove meaning or accuracy.

The app uses prompting and glossary mappings, not custom model training or a licensed
Bible retrieval corpus. Output can still be inaccurate and needs validation by the
church for important names, references, and theological terms.

Translation drafts stay in React/page memory. A custom prompt enters unencrypted browser
`localStorage` only when the operator explicitly saves it. Caption style and the tutorial
dismissal flag are also local preferences. Dismissing or completing the tutorial stores
only `dismissed`; no step history, identity, or content is retained. If storage is blocked,
the guide remains usable but may reappear after reload. Clearing site data resets this
first-visit behavior. During a service, the full active language, terminology, filter, buffer,
and prompt snapshot is held in that tab's unencrypted `sessionStorage` solely for same-tab
recovery and removed on End, takeover, or idle cleanup. The active prompt is sent through
the protected inference path to Groq, but no translation setting is stored in the Durable
Object or included in mobile-viewer or OBS messages. Operators must not enter credentials
or confidential pastoral information.

### Keywords and public filtering

The prototype accepts up to 40 glossary rows and 40 filter terms. A glossary row can
provide a canonical source term and a preferred target translation. Keyword terms are
also sent as bounded transcription hints.

Public filtering masks configured whole terms after translation. Terms containing Han,
Hiragana, or Katakana use native target-language word boundaries; other terms retain
Unicode whole-word matching. Missing native segmentation prevents affected publication
with a browser-update error. Protected source remains unchanged. Terms need review in
the intended browser; the policy is not exhaustive multilingual safety. See the
[filtering and completion decision](evaluation/CAPTION_POLICY_DECISION.md).
Replace, hide, scope, priority, phonetic variants, and persistent workspace controls are
future UI features.

Terminology and filter edits made during an active service are drafts until the same
explicit translation refresh used for language, buffer, and prompt changes.

### Caption display, OBS, and mobile viewing

- The operator console uses a minimal light monochrome theme; status text and control
  labels do not depend on colour alone.
- Locally adapted React Bits navigation, spotlight, and pending-state glow components add
  restrained hierarchy and feedback without a runtime package dependency; reduced-motion,
  keyboard, coarse-pointer, and touch behavior remain explicit.
- Setup opens with Audio input, then Translation, Appearance, Live outputs, AI usage,
  and optional AI instructions. A preflight strip highlights audio, language, and actual
  OBS verification; a persistent snapshot separates the active configuration from drafts.
- Cloud AI configured describes configuration, and Main-channel state describes the
  server room. Neither claims observed OBS connectivity or measured translation quality.
- A skip link and workspace-heading focus support keyboard navigation. End is a visible
  live action with a native confirmation dialog; Clear captions affects both public outputs.
- The output monitor tags each displayed caption with its own language, including paused
  synthetic tests. Subsequent draft language edits do not relabel existing text.
- Failed clipboard actions have hidden-by-default manual-copy recovery: OBS in Live
  outputs before a service or More during one, and the audience link in Mobile viewer.
  More closes with Escape and expands inline on mobile without covering later controls.
- Form labels remain readable, action targets are at least 44px high, and mobile inputs
  use a zoom-safe text size.
- Layout gutters scale continuously and the same logical order reflows without horizontal
  scrolling at the declared 320px minimum.
- A disabled Start action retains a visible explanation; confirmed takeover keeps its
  consequence text on mobile.
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
- One read-only mobile link per active service with a separate token, automatic reconnect,
  late-join recovery of at most the latest caption, and controller-gated replacement.
- The mobile page offers Standard, Large, and Extra large local text sizes without saving
  content or changing OBS styling. English controls retain their language while translated
  captions carry their own language attribute. Connection loss appears when the browser
  reports socket closure; exhausted retries offer Reconnect. Physical loss-detection
  delay remains unmeasured. Invalid or revoked links do not offer that recovery.
- The mobile page exposes no source caption, history, broadcast style controls, operator state,
  controller token, OBS token, or inference capability. Pause clears it; End, expiry,
  takeover, and replacement revoke it.
- The shared style persists in the channel; the browser preference remains a fallback.
  Neither browser storage contains the OBS token.

Pause stops microphone capture, clears queued audio and public display, and blocks late
caption writes while keeping the original URL and expiry. Resume clears any synthetic
test before capture restarts. Clear does not pause capture, so the next valid live
caption may replace the blank display.

Translation refresh is distinct from Pause, reload, and End. It keeps the original service
identity, timer, controller, mobile viewer, OBS link, usage count, and live/paused state;
clears current output and translation context; adopts all reviewed drafts atomically from
the operator's perspective; and rejects captions carrying an earlier server translation
revision.

The prototype does not yet offer line-count, outline, transition, multiple channels, or
named display profiles.

### Usage and cost controls

- Active services stop after at most 90 minutes; paused time still counts.
- Audio windows are 6, 9, or 12 seconds. The server ceiling remains 900 reserved
  transcription attempts in a 90-minute service, derived from the fastest option.
  Non-silent captions whose source differs from the target can make one additional
  translation call, so there are no more than 900 translation calls. Access is verified
  before a separate one-time claim for each inference stage; direct/replayed calls and
  noncanonical inference-path aliases cannot bypass the Worker claim boundary.
- Pause and confirmed refresh invalidate earlier reservations even after Resume; legacy
  state invalidates existing reservations whose dispatch history is unknown. Fresh
  reservations preserve the original ceiling and expiry. Local checks pass; deployed
  verification remains pending under [G01](GAP_ANALYSIS.md).
- A service supports one translation target at a time and no automatic paid fallback.
- A quota response stops the affected service without revoking its OBS URL.
- The UI shows separate active-service meters for elapsed time and reserved
  transcription attempts, plus acknowledged translation-call and prompt/completion/total
  token counts persisted for the service, including skipped incomplete output.
- After an acknowledged translation result, the operator can see the latest Groq daily-request and
  per-minute-token limit/remaining/reset headers. Missing headroom is shown as unknown,
  never zero.
- Translation completions are capped at 256 tokens. GPT-OSS 20B additionally uses low
  reasoning effort, and only glossary mappings relevant to the current caption and up to
  the four most recent retained source captions enter its prompt.

The consumption dashboard is not an account billing meter. Its service totals survive
an operator-page refresh, but it cannot see concurrent services or
usage by other applications in the same Groq organization or Cloudflare account. Owners
must keep provider accounts on the intended Free plans and verify their dashboards. The
provider response headers do not expose remaining daily tokens, so a content-heavy
service may stop before the visible ceiling of 900 reserved transcription attempts or
the 90-minute limit.

## Prototype acceptance criteria

Code-level acceptance:

- An operator can select an input, source, target, and 6-, 9-, or 12-second buffer. During
  live or paused operation, language, terminology, filter, buffer, and custom-prompt edits
  stay draft until an explicit confirmed translation refresh.
- The AI usage section separates service time, reserved transcription attempts,
  acknowledged translation calls/tokens, and provider headroom; it remains truthful when
  provider headers are unavailable and never claims account-wide consumption.
- A refresh applies all drafts, clears unfinished audio/context/current output, rejects a
  stale-revision publish, and preserves service identity/timer, usage, controller, viewer,
  OBS URL, and live/paused state.
- The operator can restore the reviewed prompt default; invalid or overlength prompts are
  rejected rather than silently changed, and the immutable server envelope remains active.
- Supported audio is transcribed and translated through protected cloud APIs.
- Access and one-time stage claims precede provider dispatch; missing, duplicate, stale,
  paused, expired, invalidated, unreserved, over-ceiling, and aliased requests cannot spend
  provider quota. Pausing/resuming or refreshing does not restore an old reservation.
- Incomplete provider output never reaches public captions; available usage is counted
  before the structured skip response, and unavailable usage fails closed.
- A preferred term can affect transcription guidance and translated output.
- A configured mask changes public output without changing the protected source preview.
- Style changes reach a connected overlay without restarting the service.
- Appearance controls update the dashboard design preview continuously before Save.
- Setup separates preflight, navigation and active/draft context, the selected settings
  panel, and the output monitor at desktop widths.
- The primary operator viewport is 1920 × 1080, with dashboard content capped at a
  readable 1600px rather than stretched across the full display.
- The Setup layout reflows without horizontal scrolling from 320px through desktop
  widths, including immediately around the 680px and 980px breakpoints.
- The mobile Start bar remains reachable without hiding its blocking or takeover context.
- The dashboard theme does not override the independently configured OBS caption colour
  or highlight.
- Pause stops AI requests, clears OBS, and Resume retains the reusable URL and expiry.
- Clear survives overlay reload; idle-or-paused test captions make no AI request.
- Safe margins are bounded, saved, restored, and propagated live.
- An overlay can reconnect and recover the latest public caption.
- End and expiry clear OBS while preserving the reusable URL; Rotate invalidates it.
- A per-service mobile link supports late join, Pause/Resume, and current-caption updates
  without source/history leakage; replacement, End, expiry, and takeover revoke it while
  leaving the OBS credential unchanged.
- Second starts fail with `channel_in_use`; confirmed takeover rejects stale controllers.
- Reload with the same tab controller recovers in a safe paused state.
- Production operator mutations fail closed without valid Access configuration.
- Audio and sermon transcripts are not persisted by the application.

Local iOS-shell acceptance currently proves only that the pre-hardening generated Swift
project built without signing for the simulator, three configuration tests passed on an
iPhone 17 simulator, and Xcode produced a pre-hardening unsigned arm64 archive. The
hardened sources compile, but a complete current build, four-test run, and archive remain
pending because sandboxed CoreSimulator access blocked the follow-up build.

Pilot acceptance still requires evidence from synthetic or explicitly approved tests:

- acceptable accuracy for every supported language and agreed accents;
- correct handling of representative biblical names and references;
- acceptable end-to-end latency and dropped-chunk rate for a full service;
- verified microphone/audio-interface and OBS compatibility;
- safe behavior for network loss, provider timeout, quota exhaustion, device loss,
  Access expiry, token revocation, and Worker-limit exhaustion; and
- confirmed provider usage within the active account's Free-plan envelope.

If native distribution is explicitly reopened, its acceptance criteria must be defined in
a new decision. No iOS/TestFlight result contributes to current web-application
acceptance.

The 20 July 2026 production smoke test exercised the legacy disposable-room,
four-second, pre-GPT-OSS cloud/OBS journey, style updates, reconnect, revocation, and
edge-access boundaries. It did not validate the currently merged revision, reusable Main
channel, language quality, a complete 90-minute run, quota/outage behavior, or a real OBS
production computer. Those remain stakeholder and pilot acceptance work.

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
   service-local, server-owned transcription counter and UI indicator?

Apple distribution is deferred. Reopening it would require a new owner decision covering
cost, publisher, signing, privacy, export compliance, testing, and distribution scope.
