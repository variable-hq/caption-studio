# Product specification

Reviewed 3 November 2026 against merged PR #97 (`a21da4f`). The corrected 13 September
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
  caption, manages the reusable Main OBS channel, and controls a live session.
- **Stream viewer:** reads the current moderated caption through the OBS output.
- **Mobile viewer:** opens a session-scoped read-only link and sees the latest moderated
  translation without operator access or transcript history.
- **Audience reader:** opens `/read` for appending translated paragraphs, separate from
  the latest-caption viewer.
- **Operator remote:** uses an Access-authenticated, paired phone to control Pause,
  Resume and Clear on the capture system.
- **Archive reviewer:** any Access-approved operator can review/correct saved source and
  generate/export summary drafts. There is no distinct reviewer role or per-email
  archive ownership: one Access tenant is one workspace, named *BEST Church workspace*
  in the operator UI, and every saved transcript in it is reachable by every
  signed-in operator. Workspace/administrator roles remain deferred.

The first evaluation direction is **Indonesian→English**, with **Operator** selected as
the human reviewer outside the app. [All 30 prepared samples](evaluation/ID_EN_REVIEW.md)
still await review; no language-quality gate has passed. This is not a new application
role or approval queue.

The browser is the sole client. The deferred iPhone/iPad shell was removed
([ADR 0020](decisions/0020-remove-ios-shell.md)).

## Implemented session journey

### Before the session

The dashboard opens on **Live** ([ADR 0021](decisions/0021-live-sermons-settings-operator-layout.md)).
Its readiness checklist (caption service, microphone, OBS, languages, Terms) shows a tick
or a red item with a **Fix** or **Set up** button that opens the matching Settings
section. A **Help** page, one click from every screen, lists the steps of a session in
plain words. Nothing opens automatically.

1. The operator signs in through Cloudflare Access.
2. The operator chooses a browser-visible microphone or audio interface, confirms its
   input level, and can play the short test recording back.
3. The operator selects a spoken language or automatic detection, one target language,
   and a caption wait time of 6, 10 or 14 seconds, or Dynamic. Each option caps how long a
   caption waits and also cuts earlier at a pause after its floor: 6 seconds is quickest and
   may break mid-sentence, 10 balances, 14 allows fuller sentences, and Dynamic adapts to
   the speaker up to 14 seconds.
4. The operator optionally enters bounded keyword/preferred-translation pairs and public
   mask words, and may edit the reviewed operator translation prompt.
5. The operator configures font, size, colour, line highlight, transparency, position,
   and horizontal/vertical safe margins beside the preview. Each change updates the
   dashboard preview immediately; the shared channel style and browser fallback can then
   be saved.
6. On first use, an approved operator creates the reusable Main OBS channel, copies its
   URL into a 1920 × 1080 Browser Source, and shows/clears a synthetic test while idle.
7. The operator starts a 90-minute session; the app verifies Access, Groq credentials,
   model availability, microphone access, and exclusive controller ownership.
   During the session, **Session details** in Quick fixes show the configured transcription
   and translation model identifiers;
   the readiness check confirms their availability when Start is selected.

### During the session

1. The browser records a window of 6, 10 or 14 seconds, or Dynamic for up to 14 seconds;
   every option cuts at a qualifying pause after its floor or at its cap. The pause decision
   uses raw microphone RMS on the browser and requires no model call or quota.
2. The protected API transcribes the chunk with bounded name and term hints and the end
   of the previous chunk's transcript as continuity context.
3. If source and target differ, the protected API translates with an immutable server
   safety/output envelope, the active bounded operator prompt, up to four recent source
   captions, and approved mappings.
4. Deterministic processing applies preferred translations and script-aware whole-term
   masking in the public form. Incomplete provider output is skipped before publication.
5. The operator sees source and public previews, status, post-recording processing
   latency, dropped chunks, elapsed session time, and the server-owned reserved
   transcription-attempt count for the active session. Overlay sequence protection is
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
    moderated target text and session status. A long caption shrinks on the phone
    from the chosen text size down to 18 px so it fits one screen. Confirmed replacement revokes that link
    without changing OBS.
11. Source/target language, terminology, public filters, recording window, and operator
    prompt remain editable as drafts. A banner on Live and on the affected Settings
    sections offers **Apply now**, which applies them together, and **Undo changes**,
    which discards them. Applying clears unfinished audio, recent
    translation context, current output, and any queued buffer content, but does not end or
    extend the session, change
    live/paused state, replace controller ownership, or rotate the mobile/OBS links. Output
    buffer count and delay are not part of this draft/refresh cycle: they apply immediately,
    like caption style.

### After the session

1. The operator selects End and confirms it.
2. The Worker stops the session, revokes the mobile link, and clears public/controller
   state. If deactivation
   cannot be confirmed, the dashboard retains controller state and offers Retry End.
3. The OBS URL and shared style remain ready for the next session. Only a separately
   confirmed Rotate action revokes the bearer URL and requires updating OBS.
4. If saving was explicitly enabled before Start, private source, corrections, exclusions,
   paragraphs and summaries remain for seven days after End/expiry. No audio is stored.
5. The separate reader has 30 minutes of post-End reading grace. An operator may manually
   generate a summary when optional AI is enabled; End itself makes no summary call
   unless the church setup opts in to automatic summaries (see Summary below).
6. Numeric usage survives session/content actions for a rolling 30 days.

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

## Operator interface language

**Settings › Language › Interface language** selects English, Indonesian, or
**System default**. The choice is personal to the signed-in operator and is kept
separate from the shared caption source and target languages. System default uses
the browser's `navigator.languages` preference, choosing Indonesian when an Indonesian
language is listed and English otherwise. An account preference takes precedence; a
browser copy is used only when account preferences cannot be reached. The active language
is reflected in the document's `lang` attribute.

The first four localization phases cover the operator interface and public reader
surfaces. Phase 1 provides the typed lookup and translates the shell: top navigation,
status labels, the live control bar, its status banner labels, and the language selector.
Phase 2 translates the operator panels, page messages, and the live-session hook and
request fallbacks. Phase 3 translates the Help screen and phone remote. Phase 4 translates
the public transcript reader and the Worker-rendered viewer document from the request's
`Accept-Language`, never operator preferences. Caption-language names, AI prompts and
server error text are not translated by the interface language setting. The phone remote
does not load account preferences, so it follows that browser's saved interface-language
copy or browser language, then English.

## Current functional requirements

### Audio and transcription

- Browser permission is explicit and the selected input has a visible level meter.
- Audio is mono with browser echo cancellation and noise suppression requested.
- The operator chooses a caption wait time of 6, 10 or 14 seconds, or Dynamic (the
  default). Every option is a cap, not a fixed timer: it cuts at a pause once its floor has
  passed and always cuts at the cap. The floors are 3, 5, 7 and 4 seconds, the pause
  lengths 500, 700, 900 and 700ms, and Dynamic's required pause shrinks to 200ms at its cap.
  In Dynamic mode a transcription-only draft at a pause confirms the cut when it ends in
  terminal punctuation; an unfinished clause keeps recording until another pause or the
  cap. The numbered options run no drafts. Once a session has heard
  speech, a window with less than 300ms of speech is not sent unless its peak is not well
  below earlier speech or a level sample failed; a skipped window uses no transcription,
  translation or attempt. After a provider rate-limit or usage-limit response, no option
  cuts before six seconds for the rest of the session and one status line says so. The
  microphone-level decision adds no model call or quota. Every option stays inside
  Whisper's 30-second window and, at the 64 kbps recorder setting, far below the 3 MB
  audio limit.
- The active-setting snapshot for each chunk and maximum two-chunk queue bound memory and
  backlog. Pause or confirmed translation refresh discards an unfinished active window,
  so operators should use either control at a natural break.
- Source selection can be explicit or automatic; explicit selection is preferred live.
- The hint prompt preserves names, locations, and operator-provided vocabulary, after a
  neutral spoken-recording instruction ("Spoken recording. Preserve names and spelling:").
- Raw audio is neither logged nor stored by this application.

The current provider emits finalized segments only. Interim word-by-word captions,
confidence indicators, speaker diarization, and device hot-swap recovery are not
implemented.

### Translation and biblical context

- One target language is active per translation revision within a session.
- Up to four recent source captions provide bounded context.
- Approved mappings are requested from the model and enforced deterministically after
  translation.
- Chinese output receives an explicit Simplified or Traditional instruction.
- A reviewed operator prompt prioritizes natural target-language grammar and idioms while
  preserving evident tone, formality, slang, and intentional rhetorical repetition. It is
  editable up to 4,000 characters; blank restores the reviewed default, while non-text,
  overlength, or unsupported-control-character values fail validation without truncation.
- An optional, appendable guidance block corrects a specific Indonesian audience
  address-term ambiguity (for example "Saudara-saudara") for Indonesian-to-English
  sessions. It is prompt guidance, not a glossary substitution, since correct rendering
  depends on how the term is used in context, not on the word alone.
- A separate immutable server envelope fixes language direction, Chinese script,
  untrusted-data handling, non-invention, unclear-word bracketing, profanity omission,
  and exactly-one-caption output. The operator cannot edit that envelope, and the model
  is instructed to prioritize it over conflicting custom text; this prompt ordering is
  risk reduction, not guaranteed enforcement. The request is one bounded model call
  rather than an agent.
- An Inference Level setting, shown in Settings › Translation as **How closely to follow
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
  audience call-and-response. The model rule preserves other repetition and quoted or
  acted-out speech, and never removes meaningful content, names, or scripture. Profanity is
  controlled separately by Filter inappropriate language.
- Filter inappropriate language is an independent, default-on translation setting. When On,
  the existing envelope rule omits profanity, slurs, and vulgar language, using `[...]` only
  when omission would leave no caption content. When Off, the translator renders those words
  as spoken without softening, omission, or censorship. The deterministic public Filter and
  Quick override hide rules still apply in either state, so source text remains separate from
  moderated public text. Only explicit `false` disables this setting in new and stored
  snapshots; an absent or invalid value falls back to On. Changes use the translation refresh
  confirmation and are saved with the shared defaults. Sanitization does not control
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
- While Sanitization is on, the session details show a numeric filtered-segment count. It
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
preference. During a session, the full active language, terminology, filter, recording window,
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
`Saul|swauf => Saul`. They supply canonical names only; incorrect aliases are not boosted
in transcription hints. This is not model training or fuzzy identity resolution.
Rule scopes/priorities and persistent workspace packs remain deferred.

**Quick override** in Live › Quick fixes provides four live actions: **Hide the whole
caption**, **Fix spelling to…**, **Always translate as…**, and **Help the AI recognise it**.
The controlling tab keeps up to 20 entries in memory and shows them for removal. At the cap,
Add is disabled with a prompt to remove an entry; existing overrides are not evicted. They
apply from the next caption whose processing starts; a caption already processing keeps its
existing rules. Entries remain active until removed, including across End in the same tab.
Live entries take priority over saved Terms for recognition and filtering;
a live spelling or translation replaces the saved action for the same word, and approved
recognition variants are combined. These actions do not use **Apply now**. **Keep in Terms**
adds the row to the draft Terms list; the live entry remains active, while the saved row
follows the usual **Apply now** and **Save for everyone** choices. The live list is not
saved as a setting or logged. If transcript saving is enabled, compiled rules accompany
the caption through the existing private reader flow. Live entries are separate from the
translation settings fingerprint and are never parsed as raw filter syntax.

Terminology and filter edits made during an active session are drafts until the same
explicit translation refresh used for language, Inference, Sanitization, recording window,
and prompt changes.

### Live note and recent outputs

**Live note** is an ephemeral, operator-authored situational hint for an ambiguity in the
current passage (names, terms, sound words, speaker, or quoted voices). It applies to
translations that start after the edit without **Apply now** or a context reset. It cannot
correct a misheard word; use **Quick override** to fix spelling, set a translation, help
recognition, or hide a whole caption. The note is limited to 500 characters, kept only in this tab's
`sessionStorage` for the matching session, and cleared at Start, End and takeover. It is
sent in a fenced trusted guidance block beside translator instructions, never as speech
data, and the server envelope always takes priority.

**Recent outputs** shows the last 3 successfully published captions in the controlling
tab, newest first, with time, public text and source text, under **Recent captions** in
Live's captions card. Filtered entries read “Hidden by
filter”. It records whether the output buffer was active, but does not change or feed later
translations. Pause and Clear preserve the strip; Start, End and takeover reset it.

### Live Heard transcription

In Dynamic mode the Heard pane fills in with the speaker's words as they pause. At the
first qualifying pause candidate the controller transcribes the window so far without
translating and shows that source text as in-progress in Heard, in the muted colour. A
caption runs at most one draft. Only the controlling tab sees it, it is not announced to
screen readers, and the final's source text replaces it. Numbered wait options run no
drafts; their Heard pane updates at the final as before.

When the draft ends in terminal punctuation it confirms the cut, and the final reuses the
draft's transcription instead of transcribing again: dropped segments, approved recognition
variants and language detection are already applied, and the translation runs once. The
reused draft counts as that caption's one attempt: the draft claimed transcription for the
attempt number and the final claims translation for the same number. When the draft ends
mid-clause, recording continues through that silence, the draft stays in Heard until it is
replaced, later candidates use the existing pause-only cut, and the final transcribes the
whole window normally.

Reuse requires nothing relevant to have changed since the draft: no speech resumed, the
same translation revision, settings, Terms/Quick overrides and Live note, no pause, clear or
takeover, and no aborted draft or rejected provider request. Otherwise the final runs
normally. A draft never delays a final.

A rate-limit or usage-limit response, or a provider rejecting partial audio, stops drafts
for the rest of the session silently; the session continues with pause-only cuts. There is
no operator switch, saved default or separate preview line, and old stored
`liveDraftsEnabled` values are ignored.

Relative to the same session without drafts, translation calls do not change. A confirming
draft adds no transcription call and no audio-seconds; a mid-clause draft costs at most one
extra transcription call and one extra pass over that window's audio, so the worst case per
caption is about 2x transcription and Dynamic's usual case is about 1x. See
[ADR 0032](decisions/0032-live-heard-transcription.md).

| Control | Purpose | When it applies |
| --- | --- | --- |
| Terms (Settings › Terms) | Exact word rules and spelling fixes | After Apply now |
| Quick override (Live › Quick fixes) | Fix, translate, recognise, or hide a whole caption | From the next caption; controller tab until removed |
| Translator instructions (Settings) | Standing guidance for the whole session | After Apply now |
| Live note | Situational guidance for the passage being spoken now | From the next translation; current session only |
| Recent outputs | Observe the last 3 published captions | Display only; changes nothing |

### Output buffer

Distinct from the recording window above: the output buffer is an optional delay queue
between a translated, moderated caption and its arrival on the public Live output (OBS and
the mobile viewer). It lives only in the controlling operator's browser tab, applies
immediately without a translation refresh, and is unrelated to the recording window
duration. See [ADR 0016](decisions/0016-client-side-output-buffer.md) and
[ADR 0017](decisions/0017-configurable-output-buffer-dwell.md). The wait setting sits in
the Captions card, below the **Heard** and **Audience view** panes, both before Start and
during a session. While the wait is above zero, the next-up caption and its controls follow
it there. The public caption filter lives in Settings › Terms.

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
  separate from Quick override: pausing the session, clearing the current Live
  caption, a translation refresh, takeover, and End all discard the whole buffer.
- On Live, the shared **Save selected settings as default** control stores the choice in
  the church setup; new sessions start from it.

### Church setup and Terms

One **church setup** is shared by all signed-in operators
([ADR 0022](decisions/0022-shared-church-setup-and-words-list.md)). It includes languages,
caption wait time, Terms, Inference and Sanitization; translator instructions; caption style;
summary defaults and automatic summaries; the output buffer; and the transcript-saving
default. Theme and interface language remain personal preferences. From Settings,
**Save for everyone** writes the shared setup. On Live, **Save selected settings as
default** appears only after a visible choice differs from its saved default, or from the
built-in value when nothing has been saved, and writes only the per-session choices that
are visible: before a session, the transcript-saving choice and the output buffer wait;
during a session, the wait alone.
Until anyone saves it, each operator keeps the
setup they saved earlier; afterwards a value the church setup has never set still falls
back to the operator's own, and the first save carries the saving operator's earlier
setup across. Discrete-choice controls mark the saved option "· Saved default",
distinct from the current draft.

**Settings › Terms** lists one row per term with one action: **Help the AI recognise it**,
**Fix spelling to…** (a mishearing), **Always translate as…**, **Hide the word (\*\*\*)**,
**Replace on screen with…**, or **Hide the whole caption**. Rows are stored as the glossary
and public-filter text described above, so drafts, **Apply now** and saved setups treat
them exactly as before; the pipeline reads at most 40 glossary and 40 filter entries, and
the editor warns past that. **Import a list** accepts a `.csv` or `.txt` file or pasted
text in the format `term,action` or `term,action,with`, one per line or separated by `;`.
Actions are recognise, fix, translate, mask, replace and hide; With is the corrected
spelling, translation or replacement. An import appends rows to the draft list, so Apply
now and Save treat it like any other edit; it accepts up to 64 KB and 500 rows. Live Quick
overrides stay active without a refresh; **Keep in Terms** also adds the row to the draft
Terms list and leaves the live entry active.

### Caption display, OBS, and mobile viewing

- The operator console follows [Brand guidelines](BRAND_GUIDELINES.md) and uses neutral
  light and dark palettes built from shared design tokens (see [Design system](DESIGN_SYSTEM.md)).
  **Settings › System › Theme** offers System default, Light and Dark, and
  the choice is saved with the operator's account. Status text and control labels do not
  depend on colour alone.
- A top bar holds the brand, one status pill (Ready, Checking…, Not ready, Live, Paused,
  Applying changes…, Live on another system, Needs attention, Ending…) and the **Live**, **Transcripts** and
  **Settings** tabs plus **Help**. Each screen has its own address (`#live`, `#sermons`,
  `#settings=<section>`, `#help`), so links, reload and browser Back/Forward work; old
  `#workspace=…` links land on the matching screen. Moving between screens keeps
  translation drafts and the before-Start transcript choice; reload preserves the screen,
  not unsaved drafts. Links never include credentials. The status pill announces state
  changes to screen readers; the running clock beside it is not announced.
- **Live** opens before a session with a full-width Start bar: **Start captions**, **Show
  a test caption**, and a line saying what to do next or what blocks Start. Below it are
  two rows of paired cards, each pair the same height: captions beside the readiness
  checklist, then the Start settings card (or **Quick fixes**) beside **Share**; on narrow
  screens they stack as the Start bar, captions, Start settings/Quick fixes, checklist,
  Share. The captions card shows **Heard** (the source text, operator only) beside
  **Audience view** (a scaled copy of the OBS screen in the channel's saved style,
  letterboxed), always the same size, the microphone level, and the output buffer wait
  (with the next-up queue while running), with **Recent captions** folded below.
  Before Start the Start settings card holds the transcript-saving choice, the shared
  **Save selected settings as default** control, and **Session details**. Each checklist
  row links to the Settings section that changes it (a chevron when ready, a Fix, Set up or
  Help button when not).
  **Share** holds the phone viewer link, transcript reader link, **Phone remote** pairing, and
  replacing a reader link shared by mistake.
- During a session a bar pinned to the bottom of Live holds **Pause**/**Resume**, **Clear
  screen**, the minutes left and whether the transcript is being saved, and **End session**
  (or **Try End again** when End could not be confirmed); the
  page reserves scroll space so the bar never covers a focused control. **Quick fixes**
  replaces the Start settings card: **Caption controls** (Quick override and Manual caption
  while paused),
  **Live note**, a test caption while paused, **Session details** (with **Save session
  details**), and under **Technical details** the delay after speech, segments filtered (when filtering is on), dropped audio
  chunks, transcription and translation counts, tokens, and model names. The output buffer
  stays in the Captions card, where its wait and next-up queue are joined by the shared
  **Save selected settings as default** control when the wait differs from the saved or
  built-in default.
  End and Take over open native confirmation dialogs
  (**End this session?**: Keep going / End session; **Take over captions?**: Keep watching
  / Take over). **Clear screen** blanks OBS and the latest viewer while preserving
  committed reader paragraphs.
- When another operator's session is running, Live names them, mirrors their output
  read-only and offers **Take over**; Start stays disabled.
- **Settings** lists its sections beside the selected one: System (microphone, level
  test and playback, and Theme), Language (interface language, spoken and caption languages),
  Translation (caption wait time and translator instructions), Terms (names and terms,
  the public caption filter, and a list import), Output (with a preview), OBS & links
  (OBS link, phone viewer link and their replacement), Summary and Usage. Channel
  errors offer **Retry channel** or, when the OBS credential must be rebuilt, **Rotate and
  recover**, in a banner at the top of Live.
- **Transcripts** loads the workspace's saved transcripts on opening, states that every signed-in
  operator sees them and the audience does not, and shows each transcript's reader passages,
  operator messages and AI summary. OBS link replacement stays disabled
  during a session.
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
- One read-only mobile link per active session with a separate token, automatic reconnect,
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
Backgrounding or losing focus does not stop capture: recorder boundaries, session expiry,
and output-buffer dwell ticks use a dedicated Web Worker clock to avoid main-thread timer
throttling. If the worker is unavailable or fails, active timers continue on browser timers
from their next due time. Returning from a bfcache-restored page reloads channel status but
does not resume capture; the operator resumes explicitly.

While paused, a Manual caption control can show operator-typed text (up to 240
characters, no AI translation involved) in the session's current target language to OBS
and the latest viewer, in place of the hidden translation. Resume or Clear removes
it the same way a synthetic test is cleared. Unlike a synthetic test, a manual caption is
also recorded as a separate operator note in the appending reader and archive, since it
is real session content rather than a connectivity check.

Translation refresh is distinct from Pause, reload, and End. It keeps the original session
identity, timer, controller, mobile viewer, OBS link, usage count, and live/paused state;
clears current output and translation context; adopts all reviewed drafts atomically from
the operator's perspective; and rejects captions carrying an earlier server translation
revision.

The prototype does not yet offer line-count, outline, transition, multiple channels, or
named display profiles.

### Usage and cost controls

- Active sessions stop after at most 90 minutes; paused time still counts.
- Audio windows cap at 6, 10 or 14 seconds, or Dynamic (up to 14 seconds), with floors of
  3, 5, 7 and 4 seconds. The server ceiling is 1,800 reserved transcription attempts in a
  90-minute session, derived from the 3-second floor, so a faster option does not end the
  session early. Non-silent captions whose source differs from the target can make one
  additional translation call, so there are no more than 1,800 translation calls. Access is
  verified
  before a separate one-time claim for each inference stage; direct/replayed calls and
  noncanonical inference-path aliases cannot bypass the Worker claim boundary.
- Pause and confirmed refresh invalidate earlier reservations even after Resume; legacy
  state invalidates existing reservations whose dispatch history is unknown. Fresh
  reservations preserve the original ceiling and expiry. Local checks pass; deployed
  verification remains pending under [G01](GAP_ANALYSIS.md).
- A session supports one translation target at a time and no automatic paid fallback.
- A quota response stops the affected session without revoking its OBS URL.
- The UI shows separate active-session meters for elapsed time and reserved
  transcription attempts, plus acknowledged translation-call and prompt/completion/total
  token counts persisted for the session, including skipped incomplete output.
- After an acknowledged translation result, the operator can see the latest Groq daily-request and
  per-minute-token limit/remaining/reset headers. Missing headroom is shown as unknown,
  never zero.
- Translation completions are capped at 256 tokens. GPT-OSS 20B additionally uses low
  reasoning effort, and only glossary mappings relevant to the current caption and up to
  the four most recent retained source captions enter its prompt.

The consumption dashboard is not an account billing meter. Its session totals survive
an operator-page refresh. The separate rolling ledger spans this deployment's sessions,
but cannot see usage by other applications in the same Groq organization or Cloudflare account. Owners
must keep provider accounts on the intended Free plans and verify their dashboards. The
provider response headers do not expose remaining daily tokens, so a content-heavy
session may stop before the visible ceiling of 1,800 reserved transcription attempts or
the 90-minute limit.

## Prototype acceptance criteria

Code-level acceptance:

- An operator can select an input, source, target, and a caption wait time of 6, 10 or 14 seconds, or Dynamic. During
  live or paused operation, language, terminology, filter, recording window, and custom-prompt edits
  stay draft until the operator presses **Apply now**.
- Live separates session time (the control bar), reserved transcription
  attempts, and acknowledged translation calls/tokens for the live session; Settings ›
  Usage separates that from Groq's provider headroom, which remains truthful when provider
  headers are unavailable and never claims account-wide consumption.
- A refresh applies all drafts, clears unfinished audio/context/current output, rejects a
  stale-revision publish, and preserves session identity/timer, usage, controller, viewer,
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
- Style changes reach a connected overlay without restarting the session.
- An output buffer, when On, holds the next moderated caption before Live, with up to 3
  more queued out of sight behind it; Off publishes immediately as before. A full,
  unpaused backlog force-advances to admit a new caption; a full, paused backlog drops the
  incoming one instead. Pause freezes the shown caption's remaining hold time; Clear
  removes only it; Fast-forward publishes it immediately. Editing cannot reach Live
  unmoderated, and auto-resumes on Submit.
- Output controls update the dashboard preview continuously before Save.
- The output monitor renders the real 1920 × 1080 canvas scaled to the card and shows the
  published caption on Live; Settings › Output keeps a sample above its editor.
- The primary operator viewport is 1920 × 1080, with dashboard content capped at a
  readable 1160px rather than stretched across the full display.
- Every screen reflows without horizontal scrolling from 320px through desktop
  widths, including the 680px and 980px layout boundaries.
- On phones the Live screen stacks into one column; the pinned control bar keeps Pause,
  Clear screen and End session reachable and drops its hint text to save space.
- The dashboard theme does not override the independently configured OBS caption colour
  or highlight.
- Pause stops AI requests, clears OBS, and Resume retains the reusable URL and expiry.
- Clear survives overlay reload; idle-or-paused test captions make no AI request.
- Safe margins are bounded, saved, restored, and propagated live.
- An overlay can reconnect and recover the latest public caption.
- End and expiry clear OBS while preserving the reusable URL; Rotate invalidates it.
- A per-session mobile link supports late join, Pause/Resume, and current-caption updates
  without source/history leakage; replacement, End, expiry, and takeover revoke it while
  leaving the OBS credential unchanged.
- Second starts fail with `channel_in_use`; confirmed takeover rejects stale controllers.
- Reload with the same tab controller recovers in a safe paused state.
- Production operator mutations fail closed without valid Access configuration.
- Audio is never persisted. Source/history is saved only with immutable pre-session opt-in;
  content expires seven days after End/expiry and numeric usage separately after 30 days.

Pilot acceptance still requires evidence from synthetic or explicitly approved tests:

- acceptable accuracy for every supported language and agreed accents;
- correct handling of representative biblical names and references;
- acceptable end-to-end latency and dropped-chunk rate for a full session;
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
the transcript text, and a **New text · Return to live** control when the reader has
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
**Save selected settings as default** beside the checkbox to have it pre-ticked (or
cleared) at each Start and to save the output buffer wait; the choice stays visible and
changeable until Start. Saved records expire
seven days after End/expiry. Archive pages expose private original source, separate
corrections, source-linked reader paragraphs, and any operator notes. Confirmed Remove
passage excludes its source IDs and invalidates summaries without deleting originals. If
the current live caption uses one of those IDs, removal also requests its clearing; it
never rewrites OBS.
Confirmed Delete requires End, removes content and the archive index, and rejects late jobs.

Optional **Session details** (Topic and Speaker up to 120 characters each, Description up
to 1,000 characters, and an optional session date/time) sit under a **Session details**
disclosure on Live's Start settings card and, during a session, in **Quick fixes** with
**Save session details**. They are saved only with opted-in history. They remain editable by any signed-in workspace operator while the seven-day
archive exists. They are record-keeping only: they are not sent to translation or summary
models, do not extend retention, and are deleted with the archive.

The paired `/operator/mobile` phone remote offers **Pause**, **Resume** and **Clear
screen**; Resume stays disabled while the capture system is disconnected,
and each action reads as pending until the capture system acknowledges it. The remote
stays scoped to those live commands: saved transcripts are reviewed on the
dashboard's Transcripts screen, which any signed-in operator may open on any device.

Up to 32 Access identities may hold a watcher credential for one session, and up to 32 may
hold a paired-phone credential, matching the 32 watcher sockets the room accepts. Past
that ceiling the oldest identity is dropped and must register again.

Manual summaries use opted-in, ended history with a frozen source revision. Settings › AI
summary holds the saved defaults for output language, short/detailed length and up to
2,000 characters of guidance; **Save for everyone** stores them. Every summary uses the
default Workers AI model; there is no model choice. **Generate summary** on a transcript sends those defaults and names
them with a **Change defaults** link; it has no per-request overrides. The Usage history
disclosures explain that nothing is listed until usage is
loaded. Server-owned TB2 grounding rules cannot be edited. Bounded
source sections and final synthesis produce points linked to source IDs; failures at
context, call or daily budgets are visible. Source membership validation is not semantic
proof. Operators must review the private draft before JSON export. Transcript JSON export
is also available; generating or regenerating never extends retention.

The same settings page has **Make a summary draft automatically after each session** (off
by default, part of the church setup). When on, ending a session with saving on queues the
same summary job from the saved summary defaults; it appears in Transcripts marked as
generated automatically, still needs review before export, and is skipped if a summary
already exists. See [ADR 0019](decisions/0019-automatic-post-service-summary.md).

Exact TB2 text, licensed retrieval, an editable structured summary, section-selection UI,
workspace roles, multiple providers and autonomous agent tools are not implemented.
Summaries must not manufacture scripture or claim a generated paraphrase is an exact quote.

## Usage history and optional AI

A separate numeric ledger spans sessions for a rolling 30 days. It records admissions
before provider dispatch, deduplicates outcomes and preserves unknown consumption.
End, Clear, refresh, takeover, source removal and archive deletion never reset it.
Settings › Usage shows the session count and today's remaining requests, with breakdowns under
**Usage by day (UTC)**, **Usage by session** and **Usage by AI service**. It is not an
account billing meter or a calendar-month allowance, and it offers no capacity estimate.

Optional Workers AI requires `CAPTION_OPTIONAL_AI_ENABLED=true`; it defaults off.
Per-session ceilings are 200 reader and 60 summary calls. Conservative reservations permit
at most 9,000 estimated neurons per UTC day, including a 6,000 reader ceiling; uncertain
calls remain charged. No paid fallback is implemented. Verify actual plans, content
settings, availability and approved semantic quality before enabling it for transcripts.

## Remaining decisions before a live pilot

1. TB2 is selected; which authorized text source/licence permits exact passage retrieval?
2. Who approves church-specific theological terminology?
3. What caption latency and error rate are acceptable for each language?
4. Is live manual correction required before captions reach OBS?
5. Should translation failure skip the caption or deliberately fall back to source text?
6. What is the device-disconnect and internet-loss operating procedure?
7. Approve the participant notice and rehearse the implemented opt-in, seven-day retention,
   corrections/exclusions, JSON export and deletion behavior.
8. How many simultaneous sessions, operators, and overlay viewers are expected?
9. What provider-account monitoring or external hard cap is required beyond the
   session counters, 30-day deployment ledger and optional-AI reservation guards?

A native app is out of scope. Building one would require a new owner decision covering
cost, publisher, signing, privacy, export compliance, testing, and distribution scope.
