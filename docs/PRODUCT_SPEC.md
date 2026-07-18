# Product specification

## Product vision

Help churches provide accessible, multilingual live captions without requiring a specialist translation team, while respecting theological context, privacy, and the practical needs of live-stream operators.

## Primary users

- AV operator: configures audio, languages, overlay styling, and session status
- Translator or reviewer: monitors output and corrects important terms
- Pastor or ministry leader: approves church vocabulary, biblical references, retention, and summaries
- Viewer: reads captions in the venue or on a live stream

## Goals

- Produce readable live captions with low enough latency for worship services and sermons.
- Translate church speech while preserving names, biblical terminology, book names, and ministry vocabulary.
- Provide a browser overlay that works reliably as an OBS Browser Source.
- Let each church control vocabulary boosting, public word filtering, display style, and transcript retention.
- Create reviewable sermon summaries grounded in the actual transcript and approved biblical reference material.

## Non-goals for the first release

- Replacing a human interpreter for pastoral care, doctrine, legal matters, or safety-critical communication
- Automatically deciding which theological interpretation is correct
- Training a custom foundation model from private sermons
- Publishing sermon transcripts or summaries without an explicit operator action
- Supporting unlimited simultaneous target languages in the first release

## Confirmed Phase 1 language decision

The Phase 1 source-audio and target-language set is English, Indonesian, Japanese,
Korean, Tagalog, Chinese, and Vietnamese. Korean covers South Korean usage; there
is no duplicate "South Korean" option. Chinese supports Simplified and Traditional
text output. Both Chinese text choices use Chinese speech recognition and Phase 1
assumes Mandarin rather than Cantonese.

The operator can use automatic source detection or explicitly select any supported
spoken language. Explicit selection is recommended for live services because it
reduces ambiguity. One translation target is active per session in the MVP.

## Core service flow

### Before the service

1. Sign in and select a church workspace.
2. Create or select an event.
3. Select the audio input and verify the input level.
4. Choose the spoken source language or automatic detection.
5. Choose the caption target language.
6. Select an approved church glossary and Bible-reference profile.
7. Configure display style, keyword boosts, moderation rules, recording, and retention.
8. Copy the private OBS browser-source URL into OBS and run a caption test.

### During the service

1. Start the session.
2. Capture small audio segments or a realtime stream.
3. Produce interim and final transcript segments.
4. Apply glossary hints and speaker-approved corrections.
5. Translate final or stable segments using surrounding context.
6. Apply the public-display filter without modifying the protected source transcript.
7. Publish caption events to the OBS overlay.
8. Show connection, latency, and failure status to the operator.
9. Allow the operator to pause, clear, correct, or end captions.

### After the service

1. Finalize and store the transcript only if recording was enabled.
2. Generate a draft summary using the transcript and approved biblical reference profile.
3. Flag uncertain names, verses, quotations, and theological claims for review.
4. Let an authorized reviewer edit, approve, export, or delete the transcript and summary.
5. Apply the workspace retention policy automatically.

## Functional requirements

### Audio input

- Enumerate browser-approved microphones and audio interfaces.
- Require an explicit permission and input test.
- Display input level, mute state, connection state, and selected device.
- Recover gracefully when a device disconnects or the browser changes devices.
- Never begin long-term recording merely because live captions were started.

### Transcription

- Support a configured source language and an optional auto-detect mode.
- Emit interim captions for responsiveness and final captions for translation and storage.
- Keep timestamps and confidence or uncertainty indicators when available.
- Use configurable hints for pastor names, locations, Bible books, biblical names, church terms, and recurring ministry vocabulary.
- Preserve the source transcript separately from translated and display-filtered text.

### Translation

- Translate using recent transcript context rather than isolated words.
- Preserve names, verse references, numbers, and church glossary mappings.
- Allow one target language per session in the MVP; multi-language fan-out is a later phase.
- Mark low-confidence or context-sensitive translation segments for operator review.
- Do not invent scripture citations or doctrinal conclusions.

### Biblical context

The initial design should use retrieval and prompting, not automatic model training:

- Church glossary: approved terms, spelling, pronunciation hints, and translations
- Bible reference profile: approved Bible versions, language, and licensing metadata
- Ministry profile: church name, service vocabulary, preferred terminology, and optional denomination or tradition notes
- Retrieval: relevant approved terms and passages are supplied only when useful
- Review: generated summaries and scripture references remain drafts until approved

The system must distinguish a direct Bible quotation from a paraphrase, an inferred reference, and general theological language.

### Keyword boosting

Each keyword entry may include:

- canonical spelling
- spoken or phonetic variants
- source language
- preferred translation by target language
- category such as person, place, Bible book, ministry, or event
- priority
- active date range
- workspace-wide or event-only scope

### Public word filtering

- Modes: off, mask, replace, or hide the affected caption segment
- Rules can be workspace-wide or session-specific.
- Filtering applies to public display after translation.
- The operator can choose whether protected archival text stores the original, filtered text, both, or neither.
- Audit records should show that a rule was applied without exposing restricted text to unauthorized viewers.
- Filtering must avoid substring mistakes inside harmless words.

### OBS overlay

- Provide a read-only, session-scoped URL or token.
- Support transparent background, custom background, font family, font size, color, outline or shadow, alignment, safe margins, line count, and transition timing.
- Use a stable layout that does not resize the OBS canvas.
- Reconnect automatically after a temporary network interruption.
- Never expose operator controls, API keys, or archived sermons through the overlay URL.

### Sermon archive and summary

- Recording is opt-in per session unless an administrator explicitly sets another policy.
- Store source transcript, translated transcript, timestamps, corrections, and summary status separately.
- Generate structured summary sections such as main theme, outline, key points, mentioned passages, applications, and review warnings.
- Summaries must be grounded in the transcript. Retrieved Bible material may clarify a reference but must not be presented as words spoken by the preacher.
- Provide export and deletion controls.
- Enforce role-based access and retention.

## Roles

- Owner: workspace administration, billing, members, policies, and deletion
- Admin: church settings, approved reference profiles, and retention
- Operator: service sessions, audio, captions, and display controls
- Reviewer: transcript corrections and summary approval
- Viewer: overlay-only access to the current public caption stream

## Non-functional requirements

- Graceful degradation: show source captions if translation fails, and clear status if transcription fails.
- Reliability: reconnect audio and overlay streams without duplicating finalized captions.
- Observability: capture latency, failure category, and session health without logging secret or unnecessary sermon content.
- Accessibility: dashboard supports keyboard navigation and adequate contrast.
- Security: server-side secrets, least-privilege roles, expiring overlay tokens, and auditable changes.
- Privacy: consent, retention, export, and deletion are designed before production recording.
- Cost controls: per-session usage limits, visible usage, and safe shutdown behavior.

## MVP acceptance criteria

- An operator can select an input, source language, and target language.
- Spoken audio appears as live source and translated captions.
- A glossary term is recognized and translated according to its configured mapping.
- A configured moderation rule changes the public caption but not the protected source transcript.
- Style changes appear in the OBS overlay without restarting the session.
- Temporary overlay disconnection recovers automatically.
- Recording-disabled sessions do not persist sermon content.
- Recording-enabled sessions can produce a clearly labeled draft summary for human approval.
- An unauthorized user cannot access operator controls or archived sermons from the overlay URL.

## Decisions still required before later production phases

1. Which Bible versions are preferred in each target language, and does the church have permission to use their text?
2. Should biblical terminology follow a denomination or church-specific tradition? Who approves that profile?
3. What is the acceptable caption latency during a live service?
4. Does the operator need live manual correction before captions reach OBS?
5. Should the protected archive preserve unfiltered text, filtered text, both, or neither?
6. What consent notice, retention period, export policy, and deletion process does the church require?
7. How many simultaneous services, operators, and viewers are expected?
8. What should happen when confidence is low: show the best result, delay it, mark it, or hide it?
