# Proposed architecture

This document records a starting architecture, not a locked implementation. Model and provider choices will be validated with a working latency and accuracy prototype.

## Live data flow

Audio device
  -> operator web app
  -> authenticated server session
  -> speech transcription
  -> context and glossary processing
  -> translation
  -> public-display filter
  -> realtime caption channel
  -> read-only OBS browser overlay

Final transcript segments
  -> protected sermon archive, when enabled
  -> grounded summary generation
  -> human review and approval

## Components

### Operator web app

- Audio device selection and level test
- Session start, pause, resume, and end controls
- Source and target language selection
- Glossary, keyword, filter, and display configuration
- Live source and translated preview
- Manual correction and health indicators

### Server layer

- Authenticates users and enforces workspace roles
- Keeps provider credentials server-side
- Creates short-lived transcription and overlay sessions
- Applies context, glossary, translation, and moderation policies
- Persists only the data permitted by the session retention settings
- Produces audit and health events without unnecessary transcript logging

### AI services

- Speech-to-text or realtime transcription for audio
- Context-aware translation
- Grounded sermon summarization
- Optional embedding or retrieval over approved glossary and reference data

Exact OpenAI models will be selected during implementation based on current API capabilities, latency, language quality, and cost.

### Supabase

Proposed responsibilities:

- authentication
- Postgres records for churches, members, settings, sessions, glossary entries, captions, and summaries
- row-level security
- realtime caption distribution or session-event coordination
- protected object storage only if audio retention is later approved

### OBS overlay

- Separate minimal route from the operator dashboard
- Session-scoped, read-only access
- Transparent canvas and configurable caption styling
- Realtime event subscription with reconnect and duplicate protection
- No access to secrets, member data, historical sermons, or operator actions

## Proposed entities

- workspace
- workspace_member
- event
- caption_session
- language_profile
- glossary_entry
- moderation_rule
- display_profile
- transcript_segment
- translation_segment
- correction
- sermon_summary
- bible_reference_profile
- audit_event

Every persistent record should be scoped to a workspace. Session content should carry explicit retention and visibility attributes.

## Caption lifecycle

1. Interim transcript is shown to the operator.
2. Stable transcript is finalized with timestamps.
3. Translation uses recent finalized context and approved glossary data.
4. Moderation creates a public-display form.
5. The overlay receives a monotonically ordered caption event.
6. If recording is enabled, authorized transcript forms are stored.
7. Corrections create a new revision rather than silently erasing history.

## Failure behavior

- Audio lost: stop sending audio, keep the session open briefly, and prompt reconnection.
- Transcription unavailable: display a clear operator error and do not fabricate captions.
- Translation unavailable: optionally continue source-language captions with a visible operator warning.
- Realtime channel lost: overlay reconnects and requests the current caption state.
- Database unavailable: continue only within a bounded, non-recording live mode if security and consistency can be maintained.
- Cost or duration limit reached: warn before stopping and end cleanly.

## Security boundaries

- Browser receives no long-lived provider secrets.
- Overlay tokens are random, revocable, scoped to one active session, and expire.
- Row-level security protects every workspace-scoped table.
- Archived sermon content is unavailable to public overlay clients.
- Logs exclude raw audio and transcript text by default.
- Deleted content is removed according to a documented retention and backup policy.

## Validation plan

Before implementing the full product, build a narrow prototype and measure:

- end-to-end caption latency
- transcription quality for Indonesian, English, and the chosen Chinese script
- biblical names and mixed-language speech
- translation consistency across sentence boundaries
- glossary effectiveness
- OBS reconnection behavior
- browser and audio-interface compatibility
- per-hour operating cost
