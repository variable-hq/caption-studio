# Product specification

Reviewed 29 October 2026 against open PR #77 (head `9289631`). The corrected 13 September
deploy of `20597d8` succeeded; protected runtime and church-language acceptance remain separate gates.
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

The browser is the sole client. The deferred iPhone/iPad shell was removed
([ADR 0020](decisions/0020-remove-ios-shell.md)).

## Implemented service journey

### Before the service

The dashboard opens on **Live** ([ADR 0021](decisions/0021-live-sermons-settings-operator-layout.md)).
Its readiness checklist (caption service, microphone, languages, words, OBS) shows a tick
or a red item with a **Fix** or **Set up** button that opens the matching Settings
section. A **Help** page, one click from every screen, lists the steps of a service in
plain words. Nothing opens automatically.

1. The operator signs in through Cloudflare Access.
2. The operator chooses a browser-visible microphone or audio interface and confirms its
   input level.
3. The operator selects a spoken language or automatic detection, one target language,
   and a 6-, 10-, or 14-second recording window, or Automatic. Automatic waits at least
   six seconds, then ends at the first microphone-level pause of about 700ms of silence;
   it always cuts by 14 seconds. Longer windows can reduce chopped sentences but make
   captions appear later.
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
   During the service, **Service details** in Quick fixes show the configured transcription
   and translation model identifiers;
   the readiness check confirms their availability when Start is selected.

### During the service

1. The browser records a fixed 6-, 10-, or 14-second window, or in Automatic mode records
   for 6 to 14 seconds and cuts at the first qualifying pause. The pause decision uses raw
   microphone RMS on the browser and requires no model call or quota.
2. The protected API transcribes the chunk with bounded church/biblical hints and the end
   of the previous chunk's transcript as continuity context.
3. If source and target differ, the protected API translates with an immutable server
   safety/output envelope, the active bounded operator prompt, up to four recent source
   captions, and approved mappings.
4. Deterministic processing applies preferred translations and script-aware whole-term
   masking in the public form. Incomplete provider output is skipped before publication.
5. The operator sees source and public previews, status, post-recording processing
   latency, dropped chunks, elapsed service time, and the server-owned reserved
   transcription-attempt count for the active service. Overlay sequence protection is
   applied internally and is not displayed.
6. If the output buffer is enabled, the moderated caption enters the buffer queue instead
   of publishing immediately; otherwise it publishes now. The latest public caption and
   style are published to the read-only Main OBS channel once a queued caption's turn
   comes, or is fast-forwarded.
7. OBS reconnects after temporary channel loss and receives the latest caption.
8. The operator can Pause capture and AI without changing the OBS URL or expiry, Clear
   the current public caption, or show a localized synthetic test while paused. Pausing
   or clearing the current caption also clears the output buffer queue.
9. A second operator is blocked unless they explicitly confirm takeover. Takeover clears
   OBS, replaces controller ownership, and causes stale operations to stop the old mic.
10. The operator can copy a separate mobile link. A viewer receives only current
    moderated target text and service status. A long caption shrinks on the phone
    from the chosen text size down to 18 px so it fits one screen. Confirmed replacement revokes that link
    without changing OBS.
11. Source/target language, terminology, public filters, recording window, and operator
    prompt remain editable as drafts. A banner on Live and on the affected Settings
    sections offers **Apply now**, which applies them together, and **Undo changes**,
    which discards them. Applying clears unfinished audio, recent
    translation context, current output, and any queued buffer content, but does not end or
    extend the service, change
    live/paused state, replace controller ownership, or rotate the mobile/OBS links. Output
    buffer count and delay are not part of this draft/refresh cycle: they apply immediately,
    like caption style.

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
   generate a summary when optional AI is enabled; End itself makes no summary call
   unless the church setup opts in to automatic summaries (see AI summary below).
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

### Audio and transcription

- Browser permission is explicit and the selected input has a visible level meter.
- Audio is mono with browser echo cancellation and noise suppression requested.
- The operator chooses a 6-, 10-, or 14-second fixed window, or Dynamic (the default). A
  dynamic window cuts at the first pause of about 700ms after at least 6 seconds, with a
  hard 14-second maximum; its browser microphone-level decision adds no model call or quota.
  Fixed choices can reduce fragmentation but add equal latency. Every option stays inside Whisper's 30-second window and, at the 64 kbps
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
- An Inference Level setting, shown in Settings › AI translator as **How closely to follow
  the words** (Close, Balanced — default, Free; stored as `low`, `balanced`, `high`),
  controls how aggressively the model may infer meaning and rephrase versus sticking
  close to word-for-word. Close corrects only clear transcription errors; Balanced permits conservative corrections so every
  caption reads as complete, natural sentences; Free allows bolder rephrasing and
  paraphrasing, prioritizing coherence and continuity over literal fidelity, falling back
  to the clearest partial caption for a whole line that's still too ambiguous even after
  that. It is an immutable envelope parameter, not operator-editable text, and changing it
  goes through the same translation refresh confirmation as language, terminology, public
  filtering, Sanitization, inappropriate-language filtering, and recording-window changes.
  Inference handles meaning and ambiguity;
  Sanitization owns filler cleanup, so Balanced Inference no longer removes filler or junk
  phrases when Sanitization is Off.
- The translator settings show a short description for the selected Inference Level only:
  Close stays closest to spoken words and fixes clear errors; Balanced keeps captions clear
  and complete by filling small gaps from context; Free favors intended meaning over exact
  wording and may reword boldly. This describes meaning and intent, not cleanup.
- Sanitization is a separate four-level setting, default Off; Balanced is the recommended
  on-state. Low omits non-word filler sounds. Balanced also omits filler words with no
  meaning in context and keeps only the final version of an explicit self-correction. High
  also omits empty openers and tags that add no content, while preserving direct address and
  congregation call-and-response. The model rule preserves other repetition and quoted or
  acted-out speech, and never removes meaningful content, names, or scripture. Profanity is
  controlled separately by Filter inappropriate language.
- Filter inappropriate language is an independent, default-on translation setting. When On,
  the existing envelope rule omits profanity, slurs, and vulgar language, using `[...]` only
  when omission would leave no caption content. When Off, the translator renders those words
  as spoken without softening, omission, or censorship. The deterministic public Filter and
  Quick block rules still apply in either state, so source text remains separate from
  moderated public text. Only explicit `false` disables this setting in new and stored
  snapshots; an absent or invalid value falls back to On. Changes use the translation refresh
  confirmation and are saved with shared church defaults. Sanitization does not control
  profanity, and there is no scripture-specific exemption; turn the setting Off for faithful
  wording of scripture.
- A deterministic transcription guard runs before translation. Off has no guard. Low drops
  a segment when `no_speech_prob > 0.8` and `avg_logprob < -1.2`, or when
  `compression_ratio > 3.0`; Balanced uses `0.6`, `-1.0`, or `2.4`; High uses `0.5`,
  `-0.8`, or `2.4`. The no-speech and log-probability conditions must both hold; the
  compression-ratio condition is independent. These are initial thresholds. The compression
  limit never goes below 2.4 because a lower value risks dropping deliberate human
  repetition. High has the greatest false-drop risk, especially for very soft or whispered
  speech such as prayer.
- While Sanitization is on, the service details show a numeric filtered-segment count. It
  contains no dropped text and is not logged or archived. The archive keeps only transcript
  text that survived the guard; surviving source text remains otherwise raw, and the model
  rule shapes translation only. If detected source language already equals the target, the
  translation call is skipped but the transcription guard still applies.
- The model is instructed not to invent or complete Bible verses, songs, quotations,
  doctrine, facts, missing words, or unsaid meaning. Recognizing that a passage is a
  scripture reading or paraphrase may only be used to translate the words actually spoken
  more naturally — never to retrieve, insert, or complete scripture text from memory. A
  unclear or mistranscribed spoken word follows an ordered cascade: normalize a stretched,
  hyphenated, repeated-for-effect, mispronounced, or likely mistranscribed real word to its
  closest plausible source-language form and translate it; render a sound word or imitation
  as its natural target-language equivalent or a short description; then, if only a partial
  guess is possible, put the best target-language guess or a category placeholder such as
  `[name]` in brackets. Brackets never contain an untranslated source-language word. Only
  when no guess is possible does the active Inference Level decide the final disposition —
  Close, Balanced, and Free may each omit that one word and keep the rest of the caption
  natural, falling back to the shared `[...]` marker only where omitting would leave the
  caption empty. The model also recognizes the speaker's likely tone and register
  (informative, conversational, biblical, formal, illustrative) and adjusts phrasing and
  formality accordingly. Profanity, slurs, or vulgar language are marked with that same
  `[...]` marker rather than translated, rendered, or invented. These prompt changes have
  constructed-prompt test coverage; live-model quality review remains pending under G03.
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
`localStorage` only when the operator explicitly saves it. Caption style is also a local
preference. During a service, the full active language, terminology, filter, recording window,
and prompt snapshot is held in that tab's unencrypted `sessionStorage` solely for same-tab
recovery and removed on End, takeover, or idle cleanup. The active prompt is sent through
the protected inference path to Groq, but the live translation prompt is not sent to OBS/viewer clients or stored in the room.
The output buffer queue is likewise only ever held in that tab's React state; it is never
written to `sessionStorage`, `localStorage`, or the room, and is discarded on Pause, Clear,
refresh, takeover, or End.
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
explicit translation refresh used for language, Inference, Sanitization, recording window,
and prompt changes.

### Live note and recent outputs

**Live note** is an ephemeral, operator-authored situational hint for an ambiguity in the
current passage (names, terms, sound words, speaker, or quoted voices). It applies to
translations that start after the edit without **Apply now** or a context reset. It cannot
correct a misheard word; exact replacements belong in Settings › Words, and Live's quick
block can hide a whole caption straight away. The note is limited to 500 characters, kept only in this tab's
`sessionStorage` for the matching service, and cleared at Start, End and takeover. It is
sent in a fenced trusted guidance block beside translator instructions, never as speech
data, and the server envelope always takes priority.

**Recent outputs** shows the last 3 successfully published captions in the controlling
tab, newest first, with time, public text and source text, under **Recent captions** in
Live's captions card. Filtered entries read “Hidden by
filter”. It records whether the output buffer was active, but does not change or feed later
translations. Pause and Clear preserve the strip; Start, End and takeover reset it.

### Live drafts

**Live drafts** is an optional, default-off church setting that applies immediately. While
the current recording window is still being captured, the controller may re-transcribe
the audio already recorded and replace the previous operator-only preview with a newer
draft. The preview sits below Heard and Audience sees in Live's Captions card. It is never
published, buffered, added to recent translation context, or sent to OBS, viewers, or the
sermon journal. The final caption still follows the normal end-of-window path.

Fixed 6-second windows have no draft; 10-second windows may draft at 4 seconds; 14-second
windows may draft at 4 and 8 seconds. Dynamic initially uses the 14-second offsets and
discards any in-flight draft at its natural or hard window end. A draft needs at least 3
seconds of new audio. At most one runs at a time, at most 2 are allowed per caption, and a
draft is skipped whenever a final chunk is queued or processing, or the remaining 900
attempt ceiling is needed for future finals. Draft attempts use the existing protected
transcription and translation routes. The worst case is 3 transcription and 3 translation
calls per caption and about twice the audio-seconds, so the setting warns that drafts use
more free-tier quota.

Any draft error disables drafts for that window without ending the service or showing an
operator error; the final caption remains eligible to report its own failure. If the
provider rejects partial audio with HTTP 400, drafts stay disabled for the service and a
short status message explains why. Pause, Clear, End, takeover, translation refresh, and
each window end clear the preview and abort in-flight draft work.

| Control | Purpose | When it applies |
| --- | --- | --- |
| Words (Settings › Words) | Exact word rules and spelling fixes | After Apply now |
| Quick block (Live › Quick fixes) | Hide any caption containing a word | Immediately; current service only |
| Translator instructions (Settings) | Standing guidance for the whole service | After Apply now |
| Live note | Situational guidance for the passage being spoken now | From the next translation; current service only |
| Live drafts | In-progress operator preview | Replaces the previous draft; never published |
| Recent outputs | Observe the last 3 published captions | Display only; changes nothing |

### Output buffer

Distinct from the recording window above: the output buffer is an optional delay queue
between a translated, moderated caption and its arrival on the public Live output (OBS and
the mobile viewer). It lives only in the controlling operator's browser tab, applies
immediately without a translation refresh, and is unrelated to the recording window
duration. See [ADR 0016](decisions/0016-client-side-output-buffer.md) and
[ADR 0017](decisions/0017-configurable-output-buffer-dwell.md). The setting and its church
default sit under **Check captions before they show** on the Live screen, both before Start and
during a service; the queued captions and their controls appear in Live's **Quick fixes**
with Quick block and Manual caption. The public caption filter lives in Settings › Words.

- One choice, **Wait before showing each caption**: Off (the default, matching behavior
  before this feature existed) or Wait 1, 2, 3, 4 or 5 seconds before each caption advances
  to Live. It is stored as the existing On/Off count and dwell duration
  ([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)).
- Only the next-up caption is ever shown or individually controllable. Internally, up to
  3 more translations can queue behind it out of sight, giving a paused or in-edit caption
  real headroom; once that backlog is full, a paused front drops any further arriving
  translation (leakage) instead of growing without bound. A visible counter (for example
  "2/4 queued") always shows how much of that headroom is used, and an explicit warning
  appears once the backlog is full and the next-up caption is held, since that is the
  specific state in which the next translation would be dropped.
- Each caption's dwell starts when it becomes next-up. Back-to-back arrivals therefore
  remain visible and controllable for at least one full dwell each; in a burst, the wait
  can grow by one dwell per queued caption, bounded by the four-entry capacity. The
  intentional early releases are buffer Off, operator Fast-forward, or force-advance when
  the full unpaused queue needs room for a new caption.
- The next-up caption can be **paused** (frozen; remaining hold time preserved), **edited**
  (operator override, put back through the same glossary and confirmed-filter moderation
  as every other caption before it can reach Live; auto-resumes on Submit), **cleared**
  (removed from the queue), or **fast-forwarded** (shown on Live immediately). These are
  separate from the quick block above: pausing the service, clearing the current Live
  caption, a translation refresh, takeover, and End all discard the whole buffer.
- **Save for everyone** stores the choice in the church setup; new services start from it.

### Church setup and Words

Every saved setting except the theme belongs to one **church setup** shared by all
signed-in operators ([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)):
languages, caption speed, words, Inference and Sanitization; the translator instructions; the
caption style; the summary defaults and automatic summaries; the output buffer; and the
transcript-saving default. **Save for everyone** (and **Make this the church default**
beside the transcript choice) writes it. Until anyone saves it, each operator keeps the
setup they saved earlier; afterwards a value the church setup has never set still falls
back to the operator's own, and the first save carries the saving operator's earlier
setup across. Discrete-choice controls mark the church's saved option "· Church default",
distinct from the current draft.

**Settings › Words** lists one row per word with one action: **Help the AI recognise it**,
**Fix spelling to…** (a mishearing), **Always translate as…**, **Hide the word (\*\*\*)**,
**Replace on screen with…**, or **Hide the whole caption**. Rows are stored as the glossary
and public-filter text described above, so drafts, **Apply now** and saved setups treat
them exactly as before; the pipeline reads at most 40 glossary and 40 filter entries, and
the editor warns past that. **Import Bible names** adds the TB2 list once for Indonesian →
English. Live's quick block stays separate because it applies without a refresh.

### Caption display, OBS, and mobile viewing

- The operator console follows [Brand guidelines](BRAND_GUIDELINES.md) and uses neutral
  light and dark palettes built from shared design tokens (see [Design system](DESIGN_SYSTEM.md)).
  **Settings › This computer › Light or dark** offers Match this computer, Light and Dark, and
  the choice is saved with the operator's account. Status text and control labels do not
  depend on colour alone.
- A top bar holds the brand, one status pill (Ready, Checking…, Not ready, Live, Paused,
  Applying changes…, Live on another computer, Needs attention, Ending…) and the **Live**, **Sermons** and
  **Settings** tabs plus **Help**. Each screen has its own address (`#live`, `#sermons`,
  `#settings=<section>`, `#help`), so links, reload and browser Back/Forward work; old
  `#workspace=…` links land on the matching screen. Moving between screens keeps
  translation drafts and the before-Start transcript choice; reload preserves the screen,
  not unsaved drafts. Links never include credentials. The status pill announces state
  changes to screen readers; the running clock beside it is not announced.
- **Live** is two rows of paired cards, each pair the same height: captions beside the
  readiness checklist, then the Start card (or **Quick fixes**) beside **Share**; on narrow
  screens they stack as captions, Start/Quick fixes, checklist, Share. The captions card
  shows **Heard** (the source text, operator only) beside **Audience sees** (a scaled copy
  of the OBS screen in the channel's saved style, letterboxed), always the same size, and
  the microphone level, with **Recent captions** folded below.
  Before Start it holds one Start card: **Start captions**, **Show a test caption**, a line
  saying what to do next or what blocks Start, the transcript-saving choice, **Session details**, and
  the output buffer under **Check captions before they show**. Each checklist row links to the
  Settings section that changes it (a chevron when ready, a Fix, Set up or Help button when not).
  **Share** holds the phone viewer link, sermon reader link, **Phone remote** pairing, and
  replacing a reader link shared by mistake.
- During a service a bar pinned to the bottom of Live holds **Pause**/**Resume**, **Clear
  screen**, the minutes left and whether the transcript is being saved, and **End service**
  (or **Try End again** when End could not be confirmed); the
  page reserves scroll space so the bar never covers a focused control. **Quick fixes**
  replaces the Start card: Quick block, Manual caption while paused, the queued captions,
  **Live note**, a test caption while paused, **Session details** (with **Save session
  details**), and under **Service
  details** the delay after speech, segments filtered (when filtering is on), dropped audio
  chunks, transcription and translation counts, tokens, and model names.
  End and Take over open native confirmation dialogs
  (**End this service?**: Keep going / End service; **Take over captions?**: Keep watching
  / Take over). **Clear screen** blanks OBS and the latest viewer while preserving
  committed reader paragraphs.
- When another operator's service is running, Live names them, mirrors their output
  read-only and offers **Take over**; Start stays disabled.
- **Settings** lists its sections beside the selected one: This computer (microphone,
  level test, light or dark), Languages & timing, Words (names and terms, the public caption
  filter, and the TB2 import), Caption look (with a preview), OBS & links (OBS link,
  phone viewer link and their replacement), AI translator, AI summary and Usage. Channel
  errors offer **Retry channel** or, when the OBS credential must be rebuilt, **Rotate and
  recover**, in a banner at the top of Live.
- **Sermons** loads the workspace's saved sermons on opening, states that every signed-in
  operator sees them and the audience does not, and shows each sermon's transcript,
  reader passages, operator messages and AI summary. OBS link replacement stays disabled
  during a service.
- A skip link leads to the main content. Moving between screens with the keyboard moves
  focus to the new screen's heading.
- The output monitor carries each displayed caption's own `lang` attribute, including
  paused synthetic tests, without a visible label. Subsequent draft language edits do not
  relabel existing text.
- Failed clipboard actions have hidden-by-default manual-copy recovery in Settings › OBS &
  links for both the OBS link and the phone viewer link.
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
- The shared style persists in the channel; **Save for everyone** also stores the style
  in the church setup and keeps a browser fallback in `localStorage`
  (`caption-studio:caption-style:v1`), beside the explicitly saved prompt
  (`caption-studio:translation-system-prompt:v1`), the explicitly saved summary
  defaults (`caption-studio:summary-defaults:v1`), the theme
  (`caption-studio:theme:v1`). Account
  values load first on each visit and win over the browser copy; the browser copy is
  used only when the account store is unavailable. Neither storage holds the OBS token. The tab's `sessionStorage` holds
  the controller token, the current mobile viewer link and the active translation
  snapshot until End, takeover or cleanup; the reader link lives only in page memory.
  Keys saved under the former `church-live-caption:` prefix, in either storage, move to
  `caption-studio:` on the next page load, before any page script reads them; a value
  already under the new key wins.

Pause stops microphone capture, clears queued audio and public display, and blocks late
caption writes while keeping the original URL and expiry. Resume clears any synthetic
test before capture restarts. Clear does not pause capture, so the next valid live
caption may replace the blank display.

Only a full navigation away or close (`pagehide`) pauses the operator tab automatically.
Backgrounding or losing focus does not stop capture: recorder boundaries, service expiry,
and output-buffer dwell ticks use a dedicated Web Worker clock to avoid main-thread timer
throttling. If the worker is unavailable or fails, active timers continue on browser timers
from their next due time. Returning from a bfcache-restored page reloads channel status but
does not resume capture; the operator resumes explicitly.

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
- Audio windows are 6, 10, or 14 seconds, or Dynamic (6–14 seconds). The server ceiling
  remains 900 reserved transcription attempts in a 90-minute service, derived from the
  6-second minimum option.
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

- An operator can select an input, source, target, and 6s, 10s, 14s, or Dynamic recording window. During
  live or paused operation, language, terminology, filter, recording window, and custom-prompt edits
  stay draft until the operator presses **Apply now**.
- Live separates service time (the control bar), reserved transcription
  attempts, and acknowledged translation calls/tokens for the live service; Settings ›
  Usage separates that from Groq's provider headroom, which remains truthful when provider
  headers are unavailable and never claims account-wide consumption.
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
- An output buffer, when On, holds the next moderated caption before Live, with up to 3
  more queued out of sight behind it; Off publishes immediately as before. A full,
  unpaused backlog force-advances to admit a new caption; a full, paused backlog drops the
  incoming one instead. Pause freezes the shown caption's remaining hold time; Clear
  removes only it; Fast-forward publishes it immediately. Editing cannot reach Live
  unmoderated, and auto-resumes on Submit.
- Caption look controls update the dashboard preview continuously before Save.
- The output monitor renders the real 1920 × 1080 canvas scaled to the card and shows the
  published caption on Live; Settings › Caption look keeps a sample above its editor.
- The primary operator viewport is 1920 × 1080, with dashboard content capped at a
  readable 1160px rather than stretched across the full display.
- Every screen reflows without horizontal scrolling from 320px through desktop
  widths, including the 680px and 980px layout boundaries.
- On phones the Live screen stacks into one column; the pinned control bar keeps Pause,
  Clear screen and End service reachable and drops its hint text to save space.
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

Pilot acceptance still requires evidence from synthetic or explicitly approved tests:

- acceptable accuracy for every supported language and agreed accents;
- correct handling of representative biblical names and references;
- acceptable end-to-end latency and dropped-chunk rate for a full service;
- verified microphone/audio-interface and OBS compatibility;
- safe behavior for network loss, provider timeout, quota exhaustion, device loss,
  Access expiry, token revocation, and Worker-limit exhaustion; and
- confirmed provider usage within the active account's Free-plan envelope.

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

History saving is off by default and cannot be enabled after Start. An operator can choose
**Make this the church default** beside the checkbox to have it pre-ticked (or cleared) at each
Start; it stays visible and changeable until Start. Saved records expire
seven days after End/expiry. Archive pages expose private original source, separate
corrections, source-linked reader paragraphs, and any operator notes. Confirmed Remove
passage excludes its source IDs and invalidates summaries without deleting originals. If
the current live caption uses one of those IDs, removal also requests its clearing; it
never rewrites OBS.
Confirmed Delete requires End, removes content and the archive index, and rejects late jobs.

Optional **Session details** (Topic and Speaker up to 120 characters each, Description up
to 1,000 characters, and an optional session date/time) sit under a **Session details**
disclosure on Live's Start card and, during a service, in **Quick fixes** with **Save
session details**. They are saved only with opted-in history. They remain editable by any signed-in workspace operator while the seven-day
archive exists. They are record-keeping only: they are not sent to translation or summary
models, do not extend retention, and are deleted with the archive.

The paired `/operator/mobile` phone remote offers **Pause**, **Resume** and **Clear
screen**; Resume stays disabled while the capture computer is disconnected,
and each action reads as pending until the capture computer acknowledges it. The remote
stays scoped to those live commands: saved transcripts and sermons are reviewed on the
dashboard's Sermons screen, which any signed-in operator may open on any device.

Up to 32 Access identities may hold a watcher credential for one service, and up to 32 may
hold a paired-phone credential, matching the 32 watcher sockets the room accepts. Past
that ceiling the oldest identity is dropped and must register again.

Manual summaries use opted-in, ended history with a frozen source revision. Settings › AI
summary holds the church's defaults for output language, short/detailed length and up to
2,000 characters of guidance; **Save for everyone** stores them. Every summary uses the
default Workers AI model; there is no model choice. **Generate summary** on a sermon sends those defaults and names
them with a **Change defaults** link; it has no per-request overrides. The Usage history
disclosures explain that nothing is listed until usage is
loaded. Server-owned TB2 grounding rules cannot be edited. Bounded
source sections and final synthesis produce points linked to source IDs; failures at
context, call or daily budgets are visible. Source membership validation is not semantic
proof. Operators must review the private draft before JSON export. Transcript JSON export
is also available; generating or regenerating never extends retention.

The same settings page has **Make a summary draft automatically after each service** (off
by default, part of the church setup). When on, ending a service with saving on queues the
same summary job from the church's summary defaults; it appears in Sermons marked as
generated automatically, still needs review before export, and is skipped if a summary
already exists. See [ADR 0019](decisions/0019-automatic-post-service-summary.md).

Exact TB2 text, licensed retrieval, an editable structured summary, section-selection UI,
workspace roles, multiple providers and autonomous agent tools are not implemented.
Summaries must not manufacture scripture or claim a generated paraphrase is an exact quote.

## Usage history and optional AI

A separate numeric ledger spans services for a rolling 30 days. It records admissions
before provider dispatch, deduplicates outcomes and preserves unknown consumption.
End, Clear, refresh, takeover, source removal and archive deletion never reset it.
Settings › Usage shows the service count and today's remaining requests, with breakdowns under
**Usage by day (UTC)**, **Usage by service** and **Usage by AI service**. It is not an
account billing meter or a calendar-month allowance, and it offers no capacity estimate.

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

A native app is out of scope. Building one would require a new owner decision covering
cost, publisher, signing, privacy, export compliance, testing, and distribution scope.
