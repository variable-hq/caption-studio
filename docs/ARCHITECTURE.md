# Proposed architecture

This document records the cloud-first starting architecture. Model and provider choices
must be validated with approved recordings before a live-service pilot.

## Live data flow

```text
Audio device
  -> operator browser
  -> short audio chunk over HTTPS
  -> same-origin Cloudflare Worker API
  -> Groq Whisper transcription
  -> church context and glossary processing
  -> Groq contextual translation
  -> deterministic preferred terms and public filter
  -> hibernating Durable Object WebSocket channel
  -> read-only OBS browser overlay
```

```text
Final transcript segments
  -> protected sermon archive, only when enabled
  -> grounded draft summary
  -> human review and approval
```

No transcription or translation model runs on the operator's Mac. The browser still
captures the selected microphone because that is the source of the live audio.

## Components

### Operator web app

- Audio device selection and level test
- Session start, pause, resume, and end controls
- Source and target language selection
- Glossary, keyword, filter, and display configuration
- Live source and translated preview
- Manual correction, quota, latency, and connection indicators
- Four-second `MediaRecorder` chunks with a bounded two-chunk queue

### Cloudflare Worker server layer

- Hosts the Next.js dashboard and same-origin API routes
- Keeps the Groq API key in an encrypted server-side secret
- Verifies a Cloudflare Access JWT before every inference request
- Validates language, audio size, prompt size, and request shape
- Sends short-lived inference requests without storing audio
- Normalizes provider responses into application contracts
- Passes rate-limit failures to the operator without exposing provider details
- Authenticates operators and issues revocable 90-minute overlay credentials

Cloudflare Workers Free currently publishes 100,000 requests per day and 10 ms CPU per
invocation. The server layer must remain a thin proxy and be measured in the actual
Workers runtime. Static files do not consume the same dynamic request allocation.

### AI services

Phase 1A uses GroqCloud Free:

- `whisper-large-v3-turbo` for multilingual transcription
- `llama-3.1-8b-instant` for contextual translation to one target language

The Whisper prompt includes a bounded set of approved biblical names, Bible books,
church names, and event vocabulary. Translation receives the current caption, up to
four recent finalized captions, target script requirements, and bounded preferred-term
mappings. It is explicitly told not to invent scripture or doctrine.

Provider contracts isolate the application from vendors:

- `TranscriptionProvider`: same-origin cloud API now; realtime or paid adapters later
- `TranslationProvider`: same-origin cloud API now; higher-quality adapters later
- `SummaryProvider`: deferred until consent and retention are implemented

The model is not a theological authority. Approved glossary mappings and human review
govern biblical terminology. The deterministic caption pipeline applies preferred terms
and moderation after provider output.

### Free-tier quota behavior

At the 2026-07-19 decision point, Groq publishes these relevant free limits:

- Whisper: 20 requests/minute, 2,000 requests/day, 7,200 audio seconds/hour, and
  28,800 audio seconds/day
- Llama 3.1 8B Instant: 30 requests/minute, 14,400 requests/day, 6,000 tokens/minute,
  and 500,000 tokens/day

Four-second chunks use 15 speech requests per minute and about 1,350 requests for a
90-minute service. This leaves little room to shorten chunks, so caption latency and
quota use must be evaluated together. Actual account limits are authoritative and may
change.

The browser must react to `429` responses using `Retry-After`. If transcription quota is
exhausted, stop cloud captions and show a clear operator error. If only translation is
unavailable, continue source captions when configured. Phase 1A has no automatic paid
overage.

## Language representation

The application stores a product locale separately from the provider's language code.
English (`en`), Indonesian (`id`), Japanese (`ja`), Korean (`ko-KR`), Tagalog
(`tl-PH`), and Vietnamese (`vi`) map directly to a spoken language. Chinese Simplified
(`zh-Hans`) and Chinese Traditional (`zh-Hant`) both map to Chinese speech recognition,
followed by an explicit script instruction during translation.

### Deferred Supabase responsibilities

- authentication
- Postgres records for churches, members, settings, sessions, glossary entries, captions, and summaries
- row-level security
- realtime caption distribution or session-event coordination
- protected object storage only if audio retention is later approved

Supabase is not required for the first inference test. It is introduced only when the
OBS channel, workspace authentication, or approved storage needs it.

### OBS overlay

- Separate minimal route from the operator dashboard
- Session-scoped, read-only access
- Transparent canvas and configurable caption styling
- Hibernating WebSocket subscription with reconnect and sequence protection
- No access to secrets, member data, historical sermons, or operator actions

Cloudflare Access protects the operator app and inference routes. OBS cannot complete
an interactive operator login, so `/overlay*` and `/api/live/overlay*` use more-specific
bypass applications. The Worker validates a random, revocable, read-only session token
before accepting the WebSocket. Tokens stay in URL fragments and WebSocket subprotocols,
not query strings.

Each room uses a SQLite-backed Durable Object available on Workers Free. It stores the
token hash, expiry, and latest public caption only. An alarm revokes the room after 90
minutes, and ending the operator session deletes its storage immediately. Four-second
caption events remain far below the current 100,000 daily free request and write limits.

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

Every persistent record is scoped to a workspace. Session content carries explicit
retention and visibility attributes.

## Caption lifecycle

1. The browser records a short audio chunk.
2. The server sends it to transcription with a bounded keyword prompt.
3. Stable transcript text is finalized with timestamps.
4. Translation uses recent finalized context and approved glossary data.
5. Deterministic terminology and moderation produce the public form.
6. The overlay receives a monotonically ordered caption event.
7. If recording is enabled, only authorized transcript forms are stored.
8. Corrections create a new revision rather than silently erasing history.

## Failure behavior

- Audio lost: stop sending audio, keep the session open briefly, and prompt reconnection.
- Internet lost: show the operator that cloud captions are stopped; never fabricate text.
- Transcription unavailable: stop publishing new captions and surface a clear error.
- Translation unavailable: optionally continue source-language captions with a warning.
- Free quota reached: respect provider reset timing and do not switch to paid usage.
- Realtime channel lost: overlay reconnects and requests the current caption state.
- Database unavailable: continue only within a bounded, non-recording live mode if safe.

## Security and privacy boundaries

- Browser and OBS clients receive no long-lived provider secrets.
- Anonymous callers cannot reach inference routes or consume the free Groq quota.
- Raw audio is not logged or stored by the app and is sent only for active inference.
- Groq Zero Data Retention is required before approved real-sermon tests.
- Without ZDR, Groq documents limited reliability or abuse logs that can persist up to
  30 days; the operator must not assume that default inference is zero-retention.
- Overlay tokens are random, revocable, scoped to one active session, and expire.
- Row-level security protects every workspace-scoped table when storage is introduced.
- Archived sermon content is unavailable to public overlay clients.
- Logs exclude raw audio and transcript text by default.

## Validation plan

Before implementing the full product, measure:

- end-to-end caption latency with four-second chunks
- transcription quality for every confirmed source language
- biblical names, Bible references, accents, and mixed-language speech
- translation consistency across sentence and chunk boundaries
- Simplified versus Traditional Chinese output
- glossary effectiveness and public-filter correctness
- Groq request, token, and audio quota use for a 90-minute service
- Cloudflare Worker CPU behavior and audio proxy reliability
- internet-loss and `429` recovery behavior
- OBS reconnection, browser, and audio-interface compatibility
- comparison cost and quality for any later paid-provider candidate
