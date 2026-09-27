# Product specification

Reviewed against merged PR #33 (`abae57b`), 14 September 2026, including the dashboard
navigation and collapsible service panel. The corrected 13 September deploy of `20597d8`
succeeded; protected runtime and church-language acceptance remain separate gates.
See [Deployment](DEPLOYMENT.md) and [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md).

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
- **Audience reader:** opens `/read` for appending translated paragraphs, separate from
  the latest-caption viewer.
- **Operator remote:** uses an Access-authenticated, paired phone to control Pause,
  Resume and Clear on the capture computer.
- **Archive reviewer:** any Access-approved operator can review/correct saved source and
  generate/export summary drafts. There is no distinct reviewer role or per-email
  archive ownership: one Access tenant is one workspace, named *BEST Church workspace*
  in the operator UI, and every saved transcript and sermon in it is reachable by every
  signed-in operator. Workspace/administrator roles remain deferred.

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
can move between steps, skip with a button or Escape, and reopen it with **How to use**
in the navigation rail or phone drawer; the header holds only **Service controls**.
A step shortcut opens its related panel and focuses the panel heading. Reopening returns
to the same step until page reload. Phones use a compact, labelled step selector.
It opens automatically only after channel loading settles and no service is active.
Manual replay during a service states that the service continues. The guide changes no
translation setting, requests no microphone permission, and never starts a service.

1. The operator signs in through Cloudflare Access.
2. The operator chooses a browser-visible microphone or audio interface and confirms its
   input level.
3. The operator selects a spoken language or automatic detection, one target language,
   and a 6-, 9-, 12-, 15-, or 18-second recording window. The UI notes that longer windows reduce
   chopped sentences but make captions appear later.
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

1. The browser records the active 6- to 18-second window at a time.
2. The protected API transcribes the chunk with bounded church/biblical hints.
3. If source and target differ, the protected API translates with an immutable server
   safety/output envelope, the active bounded operator prompt, up to four recent source
   captions, and approved mappings.
4. Deterministic processing applies preferred translations and script-aware whole-term
   masking in the public form. Incomplete provider output is skipped before publication.
5. The operator sees source and public previews, status, post-recording processing
   latency, dropped chunks, elapsed service time, and the server-owned reserved
   transcription-attempt count for the active service. Overlay sequence protection is
   applied internally and is not displayed.
6. The latest public caption and style are published to the read-only Main OBS channel.
7. OBS reconnects after temporary channel loss and receives the latest caption.
8. The operator can Pause capture and AI without changing the OBS URL or expiry, Clear
   the current public caption, or show a localized synthetic test while paused.
9. A second operator is blocked unless they explicitly confirm takeover. Takeover clears
   OBS, replaces controller ownership, and causes stale operations to stop the old mic.
10. The operator can copy a separate mobile link. A viewer receives only current
    moderated target text and service status. A long caption shrinks on the phone
    from the chosen text size down to 18 px so it fits one screen. Confirmed replacement revokes that link
    without changing OBS.
11. Source/target language, terminology, public filters, recording window, and operator
    prompt remain editable as drafts. The operator selects **Review refresh**, then
    **Confirm refresh**, to apply them together; **Undo draft changes** discards them. Refresh clears unfinished audio, recent
    translation context, and current output but does not end or extend the service, change
    live/paused state, replace controller ownership, or rotate the mobile/OBS links.

### After the service

1. The operator selects End and confirms it.
2. The Worker stops the service, revokes the mobile link, and clears public/controller
   state. If deactivation
   cannot be confirmed, the dashboard retains controller state and offers Retry End.
3. The OBS URL and shared style remain ready for the next service. Only a separately
   confirmed Rotate action revokes the bearer URL and requires updating OBS.
4. If saving was explicitly enabled before Start, private source, corrections, exclusions,
   paragraphs and summaries remain for seven days after End/expiry. No audio is stored.
5. The separate reader has 30 minutes of post-End reading grace. An operator may manually
   generate a summary when optional AI is enabled; End itself makes no summary call.
6. Numeric usage survives service/content actions for a rolling 30 days.

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
- The operator chooses a 6-, 9-, 12-, 15-, or 18-second window. The 6-second default
  preserves the existing fast path; longer choices can reduce fragmentation but add equal
  latency. Every option stays inside Whisper's 30-second window and, at the 64 kbps
  recorder setting, far below the 3 MB audio limit.
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
- An optional, appendable guidance block corrects a specific Indonesian congregational
  address-term ambiguity (for example "Saudara-saudara") for Indonesian-to-English
  services. It is prompt guidance, not a glossary substitution, since correct rendering
  depends on how the term is used in context, not on the word alone.
- A separate immutable server envelope fixes language direction, Chinese script,
  untrusted-data handling, non-invention, unclear-word bracketing, profanity omission,
  and exactly-one-caption output. The operator cannot edit that envelope, and the model
  is instructed to prioritize it over conflicting custom text; this prompt ordering is
  risk reduction, not guaranteed enforcement. The request is one bounded model call
  rather than an agent.
- The model is instructed not to invent or complete Bible verses, songs, quotations,
  doctrine, facts, missing words, or unsaid meaning. A word that was said but is unclear
  or mistranscribed is rendered as a bracketed best guess, or `[unclear]` if none is
  possible, rather than left untranslated; profanity, slurs, or vulgar language are left
  out of the translation rather than rendered or invented. Neither behavior has been
  confirmed against live model responses, only against constructed-prompt tests.
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
first-visit behavior. During a service, the full active language, terminology, filter, recording window,
and prompt snapshot is held in that tab's unencrypted `sessionStorage` solely for same-tab
recovery and removed on End, takeover, or idle cleanup. The active prompt is sent through
the protected inference path to Groq, but the live translation prompt is not sent to OBS/viewer clients or stored in the room.
The journal receives bounded glossary/filter snapshots to process public reader paragraphs;
with saving on, its pending-work checkpoint persists that context while needed. Operators must not enter credentials
or confidential pastoral information.

### Keywords and public filtering

The prototype accepts up to 40 glossary rows and 40 filter terms. A glossary row can
provide a canonical source term and a preferred target translation. Keyword terms are
also sent as bounded transcription hints.

Public filtering masks, replaces, or hides configured whole terms after translation,
using `word`, `word=>replacement`, or `word=>!hide` syntax in the same field. Terms
containing Han, Hiragana, or Katakana use native target-language word boundaries; other
terms retain Unicode whole-word matching. Missing native segmentation prevents affected
publication with a browser-update error. Protected source remains unchanged. Terms need
review in the intended browser; the policy is not exhaustive multilingual safety. See the
[filtering and completion decision](evaluation/CAPTION_POLICY_DECISION.md).
Approved whole-word recognition aliases are implemented, for example an explicitly reviewed
`Saul|swauf => Saul`. The TB2 vocabulary action is scoped to Indonesian/automatic source
and English target. It supplies canonical names only; incorrect aliases are not boosted
in transcription hints. This is not model training or fuzzy identity resolution.
Rule scopes/priorities and persistent workspace packs remain deferred.

A separate **quick block** control lets an operator instantly hide any caption
containing a chosen word for the remainder of the service, without the translation
refresh other filter edits require. It always hides rather than masks or replaces, is
session-only, and does not persist between services; a term meant to persist still
belongs in the filter field above.

Terminology and filter edits made during an active service are drafts until the same
explicit translation refresh used for language, recording window, and prompt changes.

### Caption display, OBS, and mobile viewing

- The operator console uses neutral light and dark palettes built from shared design
  tokens (see [Design system](DESIGN_SYSTEM.md)); the navigation **Theme** select offers
  System, Light and Dark, and the choice is saved with the operator's account. Status
  text and control labels do not depend on colour alone.
- Locally adapted React Bits navigation, spotlight, and pending-state glow components add
  restrained hierarchy and feedback without a runtime package dependency; reduced-motion,
  keyboard, coarse-pointer, and touch behavior remain explicit.
- Setup opens on Overview. A fixed desktop sidebar lists Overview, Audio input,
  Translation, Appearance, Live outputs, Sermon history, AI usage, AI instructions and
  AI summary under the headings Workspace, Setup, Service and Settings; Arrow, Home and End keys
  move between links. A **Resize navigation** handle on the rail's edge sets the sidebar
  width between 200 and 420px by drag, arrow keys, Home/End, or double-click to reset;
  the width is cached locally and saved with the operator's account.
  Destinations keep the same order during a service. Below 981px a native modal drawer
  provides the same links, Escape dismissal and focus return; desktop resizing closes it.
- Section-only URL fragments support direct links, reload and browser Back/Forward.
  In-page navigation keeps translation drafts and the before-Start history choice.
  Reload preserves the destination, not unsaved drafts. Links never include credentials.
- The overview shows spoken/audience language and the service window or elapsed time,
  three "Before you go live" checks for audio, language and actual OBS verification, a
  history-consent reminder, and **Review service setup** / **Open service controls**
  actions. Service controls
  opens an initially collapsed right panel grouping history consent with Start, live
  actions, configuration details and an expandable caption monitor. It docks from 1280px
  and becomes a modal drawer below that width. Escape returns focus to the trigger;
  crossing the breakpoint closes it and restores scrolling. Toggling it does not affect
  capture or consent. A deliberately opened desktop panel stays open during navigation;
  **View usage** inside it is the exception, closing the panel and opening AI usage.
  Its More menu offers Copy OBS URL, Copy mobile viewer link, Show test caption and
  Reveal OBS URL for manual copy.
- Only Appearance keeps an inline output preview. Other pages have the optional monitor
  in Service controls. Active settings remain distinct from unapplied drafts; detailed
  translation-refresh controls appear in Translation and AI instructions, with a compact
  review link on other pages.
- Live outputs groups OBS, latest-viewer and reader/phone sharing into expandable sections.
  Sermon history contains the workspace's saved archives, corrections and summaries;
  the panel states that every signed-in operator sees them and the audience does not. OBS link rotation
  stays disabled during a service; paused test captions remain under More.
- A status bar docked at the bottom of the workspace (beside the sidebar on desktop,
  full width on phones) holds two pills. They read Checking cloud AI, Cloud AI configured, Cloud setup needed or
  Cloud AI unavailable, and Checking Main channel, Channel not created or Main channel ·
  Idle/Live/Paused. They describe configuration and the server room, not observed OBS
  connectivity or measured translation quality. Channel errors offer **Retry channel**
  or, when the OBS credential must be rebuilt, **Rotate and recover**.
- A skip link and workspace-heading focus support keyboard navigation. Opening a section
  always moves focus to its heading so a screen reader announces the new page, but the
  focus ring is drawn only when the section was opened from the keyboard; a click or tap
  leaves the title unringed. When Service
  controls is collapsed, a compact sticky bar keeps Pause/Resume and Clear reachable;
  while paused, it also offers a Manual caption field.
  End stays inside the service panel with a native confirmation dialog (**Confirm End**
  or **Keep service open**); **Clear live caption** blanks OBS and the latest viewer,
  while preserving committed reader paragraphs.
- The output monitor carries each displayed caption's own `lang` attribute, including
  paused synthetic tests, without a visible label. Subsequent draft language edits do not
  relabel existing text.
- Failed clipboard actions have hidden-by-default manual-copy recovery: OBS in Live
  outputs or More during a service, and the latest audience link in Live outputs.
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
  reports socket closure; after eight failed retries the page offers Reconnect, and the
  OBS overlay stops after twelve. Physical loss-detection delay remains unmeasured.
  Invalid, replaced or revoked links do not offer that recovery.
- The mobile page exposes no source caption, history, broadcast style controls, operator state,
  controller token, OBS token, or inference capability. Pause clears it; End, expiry,
  takeover, and replacement revoke it.
- The shared style persists in the channel; **Save as default** also stores the style
  with the operator's account and keeps a browser fallback in `localStorage`
  (`church-live-caption:caption-style:v1`), beside the explicitly saved prompt
  (`church-live-caption:translation-system-prompt:v1`), the explicitly saved summary
  defaults (`church-live-caption:summary-defaults:v1`), the theme
  (`church-live-caption:theme:v1`), the sidebar width
  (`church-live-caption:sidebar-width:v1`) and the tutorial flag. Account
  values load first on each visit and win over the browser copy; the browser copy is
  used only when the account store is unavailable. Neither storage holds the OBS token. The tab's `sessionStorage` holds
  the controller token, the current mobile viewer link and the active translation
  snapshot until End, takeover or cleanup; the reader link lives only in page memory.

Pause stops microphone capture, clears queued audio and public display, and blocks late
caption writes while keeping the original URL and expiry. Resume clears any synthetic
test before capture restarts. Clear does not pause capture, so the next valid live
caption may replace the blank display.

While paused, a Manual caption control can show operator-typed text (up to 240
characters, no AI translation involved) in the session's current target language to OBS
and the latest viewer, in place of the hidden translation. Resume or Clear removes
it the same way a synthetic test is cleared. Unlike a synthetic test, a manual caption is
also recorded as a separate operator note in the appending reader and archive, since it
is real service content rather than a connectivity check.

Translation refresh is distinct from Pause, reload, and End. It keeps the original service
identity, timer, controller, mobile viewer, OBS link, usage count, and live/paused state;
clears current output and translation context; adopts all reviewed drafts atomically from
the operator's perspective; and rejects captions carrying an earlier server translation
revision.

The prototype does not yet offer line-count, outline, transition, multiple channels, or
named display profiles.

### Usage and cost controls

- Active services stop after at most 90 minutes; paused time still counts.
- Audio windows are 6, 9, 12, 15, or 18 seconds. The server ceiling remains 900 reserved
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
an operator-page refresh. The separate rolling ledger spans this deployment's services,
but cannot see usage by other applications in the same Groq organization or Cloudflare account. Owners
must keep provider accounts on the intended Free plans and verify their dashboards. The
provider response headers do not expose remaining daily tokens, so a content-heavy
service may stop before the visible ceiling of 900 reserved transcription attempts or
the 90-minute limit.

## Prototype acceptance criteria

Code-level acceptance:

- An operator can select an input, source, target, and 6- to 18-second recording window. During
  live or paused operation, language, terminology, filter, recording window, and custom-prompt edits
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
- Setup separates navigation and the selected settings page from collapsible service
  controls. The output monitor renders the real 1920 × 1080 canvas scaled to the card and
  shows the published caption under Live outputs; Appearance keeps a sample beside its editor.
- The primary operator viewport is 1920 × 1080, with dashboard content capped at a
  readable 1160px rather than stretched across the full display.
- The Setup layout reflows without horizontal scrolling from 320px through desktop
  widths, including the 680px, 980px and 1280px layout boundaries.
- The mobile service drawer keeps Start, blocking/takeover context and its close action
  reachable. Closing it restores the focused workspace and does not change the service.
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
- Audio is never persisted. Source/history is saved only with immutable pre-service opt-in;
  content expires seven days after End/expiry and numeric usage separately after 30 days.

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

## Reader, private history and summary requirements

Plan 1 is implemented under [ADR 0011](decisions/0011-service-history-and-optional-inference.md).
The `/read` audience link is distinct from `/view`; one shared journal job processes at
most five moderated translation chunks about every 30 seconds. Polling and additional
viewers make no AI calls. With optional AI off or failed, existing translations are joined.
With saving off, reader text lives in memory and may be lost on object eviction. The
reader page offers Comfortable, Large and Extra large local text sizes, a skip link to
the sermon text, and a **New text · Return to live** control when the reader has
scrolled away from the newest paragraph; sections are labelled by language and
translation revision, and unphrased fallbacks are marked as original translated chunks.

Clear, Pause and refresh discard pending work and preserve committed paragraphs. The
reader follows new text only near the bottom; older revisions/languages remain labelled.
End grants 30 minutes of reading grace. Takeover, replacement and archive deletion revoke
access immediately on the server; disconnected clients reflect it on successful polling.
Manual captions shown while paused appear as separate operator notes, interleaved by
timestamp for display but stored independently of paragraphs; they are not batched,
reprocessed by optional AI phrasing, or reapplied against glossary/filter rules, since
the operator already typed final text.

History saving is off by default and cannot be enabled after Start. Saved records expire
seven days after End/expiry. Archive pages expose private original source, separate
corrections, source-linked reader paragraphs, and any operator notes. Confirmed Remove
passage excludes its source IDs and invalidates summaries without deleting originals. If
the current live caption uses one of those IDs, removal also requests its clearing; it
never rewrites OBS.
Confirmed Delete requires End, removes content and the archive index, and rejects late jobs.

The paired `/operator/mobile` remote offers **Pause captions**, **Resume captions** and
**Clear live caption**; Resume stays disabled while the capture computer is disconnected,
and each action reads as pending until the capture computer acknowledges it. The remote
stays scoped to those live commands: saved transcripts and sermons are reviewed on the
dashboard's Sermon history page, which any signed-in operator may open on any device.

Up to 32 Access identities may hold a watcher credential for one service, and up to 32 may
hold a paired-phone credential, matching the 32 watcher sockets the room accepts. Past
that ceiling the oldest identity is dropped and must register again.

Manual summaries use opted-in, ended history with a frozen source revision. Operators
select an allowlisted Workers AI model, output language, short/detailed length and up to
2,000 characters of guidance. The **AI summary** settings page holds account
defaults for those four fields; **Save to my account** stores them explicitly, and
each Summary assistant request is prefilled from them but still shows and sends its own
values. The AI usage history disclosures explain that nothing is listed until usage is
loaded. Server-owned TB2 grounding rules cannot be edited. Bounded
source sections and final synthesis produce points linked to source IDs; failures at
context, call or daily budgets are visible. Source membership validation is not semantic
proof. Operators must review the private draft before JSON export. Transcript JSON export
is also available; generating or regenerating never extends retention.

Exact TB2 text, licensed retrieval, an editable structured summary, section-selection UI,
workspace roles, multiple providers and autonomous agent tools are not implemented.
Summaries must not manufacture scripture or claim a generated paraphrase is an exact quote.

## Usage history and optional AI

A separate numeric ledger spans services for a rolling 30 days. It records admissions
before provider dispatch, deduplicates outcomes and preserves unknown consumption.
End, Clear, refresh, takeover, source removal and archive deletion never reset it.
The UI groups by service/day/stage/model and labels capacity as an estimate under stated
limits, not an account billing meter or a calendar-month allowance.

Optional Workers AI requires `CAPTION_OPTIONAL_AI_ENABLED=true`; it defaults off.
Per-service ceilings are 200 reader and 60 summary calls. Conservative reservations permit
at most 9,000 estimated neurons per UTC day, including a 6,000 reader ceiling; uncertain
calls remain charged. No paid fallback is implemented. Verify actual plans, content
settings, availability and approved semantic quality before enabling it for sermons.

## Remaining decisions before a live pilot

1. TB2 is selected; which authorized text source/licence permits exact passage retrieval?
2. Who approves church-specific theological terminology?
3. What caption latency and error rate are acceptable for each language?
4. Is live manual correction required before captions reach OBS?
5. Should translation failure skip the caption or deliberately fall back to source text?
6. What is the device-disconnect and internet-loss operating procedure?
7. Approve the participant notice and rehearse the implemented opt-in, seven-day retention,
   corrections/exclusions, JSON export and deletion behavior.
8. How many simultaneous services, operators, and overlay viewers are expected?
9. What provider-account monitoring or external hard cap is required beyond the
   service counters, 30-day deployment ledger and optional-AI reservation guards?

Apple distribution is deferred. Reopening it would require a new owner decision covering
cost, publisher, signing, privacy, export compliance, testing, and distribution scope.
