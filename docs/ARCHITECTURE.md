# Architecture

This document describes the current Phase 1 cloud prototype. Proposed archive and
summary components are intentionally separated at the end so they are not mistaken for
implemented behavior.

## System context

```text
Microphone or audio interface
  -> operator browser (Cloudflare Access protected)
  -> four-second audio file over HTTPS
  -> Cloudflare Worker / OpenNext API
  -> Groq Whisper transcription
  -> Groq Llama contextual translation, unless source equals target
  -> deterministic glossary and public moderation pipeline
  -> authenticated live-session API
  -> SQLite-backed Durable Object
  -> token-authenticated WebSocket
  -> OBS Browser Source
```

The operator's Mac captures audio in the browser but does not run transcription or
translation models. The prototype has no application database, object storage, sermon
archive, or summary service.

## Components

### Operator browser

The Next.js client provides:

- microphone and browser-visible audio-interface enumeration;
- explicit microphone permission and a live input meter;
- source language, target language, glossary, filter, and caption styling controls;
- a live control bar for pause/resume, clear, synthetic test, and confirmed end;
- a `MediaRecorder` that creates independent four-second audio chunks;
- a two-chunk in-memory queue to bound latency and memory use;
- protected source and moderated public-caption previews;
- active-session time, transcription request count, dropped chunk count, and last
  post-recording cloud processing latency;
- an OBS URL copy action and protected session end action; and
- display-preference persistence in browser `localStorage`.

Glossary text, filter text, audio, captions, and session usage are not persisted by the
browser after the active page/session. The UI has no manual correction, caption history,
archive, or summary controls today. Pause stops browser capture, discards queued chunks,
and keeps the existing room and expiry. The session clock continues while the
transcription-request count does not.

### Cloudflare Worker and OpenNext

`custom-worker.ts` routes `/overlay` and `/api/live/*` to the live runtime before the
generated OpenNext handler. Next.js serves the dashboard and `/api/ai/*` routes. The
Worker environment provides the Durable Object binding, Access configuration, and
server-only Groq credential.

Production protection is layered:

- Cloudflare Access gates the dashboard and all operator/API paths at the edge;
- readiness, transcription, translation, and live-session mutation handlers also verify
  the signed Access JWT in application code;
- `/api/ai/health` returns configuration booleans and model names but no secret; it
  relies on the deployment's edge Access policy;
- `/overlay*` and `/api/live/overlay*` are narrowly bypassed at the Access layer and
  expose no inference or operator mutations; and
- the WebSocket endpoint validates the session credential inside the Durable Object.

Access verification checks issuer and audience against Cloudflare's remote JWKS. JWKS
loaders are cached by team domain at module scope.

### AI provider layer

Phase 1 uses GroqCloud:

- `whisper-large-v3-turbo` for transcription; and
- `llama-3.1-8b-instant` for translation.

The browser talks only to same-origin APIs and never receives the Groq key. The server
performs a model-availability check before starting a session.

Transcription is bounded to a 3 MB audio chunk, at most 40 keyword hints, 100 characters
per hint, and a 900-character provider prompt. The prompt asks Whisper to preserve
biblical names, Bible books, verse numbers, and church terms.

Translation is skipped when source and target are the same. Otherwise the model receives
the current source caption, up to four recent source captions, at most 60 preferred-term
mappings, and an explicit Simplified or Traditional Chinese output instruction. It is
told to return translation only and not invent scripture, doctrine, facts, or meaning.
Provider calls have browser and server timeouts.

`TranscriptionProvider` and `TranslationProvider` keep the client independent of a
specific vendor response shape. Summary interfaces will be introduced only when the
archive and review design is approved.

### Deterministic caption pipeline

After AI translation, application code:

1. preserves the source text as the protected browser preview;
2. applies approved glossary mappings to the translated display form;
3. applies whole-term public moderation rules; and
4. publishes only the resulting public text to the live room.

The current UI supports mask rules. The pipeline keeps moderation separate from the
protected source form so a public filter never silently rewrites what was spoken. No
protected transcript is sent to OBS or stored in the Durable Object.

### Durable Object and OBS overlay

Creating a session produces a UUID, a 256-bit random token, and a maximum 90-minute
expiry. The URL stores `sessionId.token` in its fragment. Because fragments stay in the
browser, the self-contained overlay script extracts the values and supplies the token as
a WebSocket subprotocol.

The Durable Object stores:

- the SHA-256 token hash;
- session expiry;
- current caption style;
- paused state and the last accepted sequence number; and
- the latest moderated public caption.

It accepts monotonically increasing caption sequence numbers, limits public caption
length, and broadcasts captions, clears, and style changes to connected overlays. Room
storage transactions serialize caption/control mutations: a caption either commits
before Pause and is then cleared, or arrives afterward and is rejected. A new or
reconnected overlay receives the current style and latest caption. Ending the session or
the expiry alarm closes sockets and deletes all room storage.

The protected control endpoint accepts Pause, Resume, Clear, and Show test. Pause and
Resume clear the display, Pause blocks live-caption writes, and Show test is permitted
only while paused. Test content comes from bounded application constants and never calls
the AI provider.

The overlay document has no Next.js asset dependency, provider credential, operator
control, history request, or archive capability. It renders a transparent 1920 × 1080
friendly canvas and reconnects with bounded exponential delay.

The overlay retries abnormal connection closures five times with delays of 2, 4, 8, 10,
and 10 seconds. A revoked or otherwise unreachable URL can therefore show a reconnecting
message for roughly 34 seconds before it settles on its terminal unavailable message.

## Language representation

The product locale is kept separate from Groq's speech code:

| Product selection | Locale | Speech code |
| --- | --- | --- |
| English | `en` | `en` |
| Indonesian | `id` | `id` |
| Japanese | `ja` | `ja` |
| Korean | `ko-KR` | `ko` |
| Tagalog | `tl-PH` | `tl` |
| Chinese (Simplified) | `zh-Hans` | `zh` |
| Chinese (Traditional) | `zh-Hant` | `zh` |
| Vietnamese | `vi` | `vi` |

Chinese script is a text-output preference rather than a separate acoustic language.
Automatic Chinese detection resolves to the Simplified product locale; operators should
select the source explicitly when script-specific handling matters.

## State and retention

| Data | Location | Lifetime |
| --- | --- | --- |
| Raw audio chunk | Browser, Worker request, Groq inference | One active inference request |
| Recent source context | Browser memory | Active page/session |
| Protected source preview | Browser memory | Active page/session |
| Moderated public caption | Browser and Durable Object | Active page; latest item until session ends/expires |
| Caption style | Browser local storage and Durable Object | Browser preference; active room |
| Paused state and last sequence | Durable Object | Active room, maximum 90 minutes |
| Token | URL fragment and browser/OBS memory | Active room, maximum 90 minutes |
| Token hash | Durable Object | Active room, maximum 90 minutes |
| Session usage counters | Browser memory | Active page/session |

Groq may retain provider-side data according to the active organization's Data Controls.
Zero Data Retention is a deployment prerequisite for approved sermon audio; provider
usage metadata remains outside this application's control.

## Limits and failure behavior

- The session ends after 90 minutes and allows at most 1,400 caption events.
- Four-second chunks produce at most about 1,350 transcription attempts in one complete
  session, before skipped/silent results are considered.
- The dashboard latency metric starts after a four-second chunk finishes recording. It
  measures upload, transcription, translation, processing, and publication; approximate
  spoken-to-screen time is four seconds plus that value and rendering delay.
- When two chunks are already queued, a new chunk is dropped and the operator is warned.
- Pausing deliberately discards queued audio without counting it as a dropped chunk;
  paused time still counts toward the 90-minute room expiry.
- Safe margins are bounded to 0–20% per axis and use viewport-relative units in OBS.
- A transcription quota, authentication, language-detection, or session-expiry error
  ends the session.
- Other transient provider errors are shown while the next queued chunk may retry the
  normal flow; no caption is fabricated.
- Translation currently has no source-language fallback. A translation error is visible
  to the operator and that chunk is not published.
- The overlay reconnects and restores only the latest public caption, not missed history.
- Ending or expiring a session invalidates the URL and clears room data.
- There is no automatic paid provider or overage path.

Current UI usage is session-local. Groq organization limits and Cloudflare account limits
can be consumed by other applications or concurrent sessions, so provider dashboards are
the authoritative account-wide meters.

## Deferred architecture

Archive and AI summary work is not part of the live prototype. Before adding it, the
project needs explicit decisions and a separate threat/privacy design for:

- church workspaces, roles, and row-level authorization;
- consent and recording state visible to operators and participants;
- source, translated, corrected, and public transcript forms;
- approved Bible versions, licensing, and reference metadata;
- summary grounding, uncertainty flags, and human approval;
- retention, export, deletion, backup, and audit behavior; and
- storage/provider cost caps.

Supabase or another database remains an option, not a current dependency or decision.

## Validation priorities

Before a controlled live pilot, validate with synthetic or approved recordings:

- every source and target language, accents, mixed-language speech, and Chinese scripts;
- biblical names, Bible references, numbers, glossary mappings, and filter boundaries;
- latency and dropped-chunk behavior for an entire service;
- Groq `429`, timeout, invalid-model, and network-loss behavior;
- device disconnect and microphone permission failure;
- Access rejection, bypass route scope, token theft, revocation, and expiry;
- OBS initial connection, reconnection, styling, and browser-source compatibility; and
- actual Cloudflare and Groq account usage against the intended Free plans.
