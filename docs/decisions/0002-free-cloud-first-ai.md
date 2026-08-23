# ADR 0002: free cloud-first AI providers

- Status: accepted for Phase 1 prototype
- Date: 2026-07-19
- Reviewed: 2026-08-23
- Supersedes: ADR 0001

## Context

The operator's Mac must not host transcription or translation models. The team still
wants a no-cost starting point, multilingual speech support, biblical vocabulary,
server-side secrets, and an upgrade path when a controlled pilot proves the value of
paid capacity or quality.

No cloud provider guarantees unlimited, always-available AI inference for zero cost.
The Phase 1 target is therefore a quota-bounded pilot with visible failures and no
automatic paid overage.

## Decision

Phase 1A uses:

- Cloudflare Workers Free to host the Next.js app and same-origin API routes;
- Cloudflare Access Free to restrict the Worker to approved operators;
- GroqCloud Free with `whisper-large-v3-turbo` for multilingual transcription;
- GroqCloud Free with `openai/gpt-oss-20b` for one contextual translation target;
- selectable 6-, 9-, or 12-second audio windows, with six seconds as the default and
  quota floor;
- a short Whisper prompt containing approved biblical names and keyword hints;
- recent finalized captions and approved glossary mappings in the translation prompt;
- deterministic preferred-term enforcement and public-display filtering after AI output;
- provider-neutral interfaces so models or vendors can change without rebuilding the UI.

The Groq key is an encrypted deployment secret. Browsers and OBS never receive it.
Raw audio is forwarded in memory and is not stored by the application. Groq Zero Data
Retention must be enabled before real sermon audio is approved for testing.

Inference routes verify the Cloudflare Access JWT and fail closed when Access is not
configured. OBS and mobile viewers cannot use interactive operator authentication, so
their four exact document/WebSocket paths require narrow Access bypasses plus separate
read-only tokens enforced by the Worker. Access-plan eligibility and billing
configuration must be verified in the active Cloudflare account rather than inferred
from this decision record.

## Initial disposable-room implementation (2026-07-20, superseded)

The first Phase 1A live path used a protected operator request to create a
maximum 90-minute Durable Object room and a random overlay credential. The token is
placed in the generated URL fragment, supplied to the WebSocket as a subprotocol,
validated against a stored SHA-256 hash, and was revoked on operator end or expiry. The
reusable-channel amendment below replaces that credential lifecycle. The deployment
still requires more-specific Access bypass applications for `/overlay*`
and `/api/live/overlay*`; no other operator or inference route may share that bypass.

The original implementation also enforced four-second chunks, one target language, a
bounded client queue, and no automatic paid fallback. Its indicator covered only the
active browser session. The reusable-channel amendment below superseded that browser-local
counter, and the 2 August migration amendment superseded the cadence and attempt ceiling.

## Reusable-channel amendment (2026-08-01)

The per-service room credential is superseded by one reusable Main-channel URL. A
server-only `OBS_CHANNEL_ENCRYPTION_KEY` encrypts the recoverable OBS token, while its
hash still validates the public read-only WebSocket. Each live service receives a
different tab-scoped controller credential and retains the 90-minute limit. End and
expiry clear service/public state but preserve the OBS URL; only explicit confirmed
rotation revokes it. A confirmed takeover atomically replaces controller ownership.

This uses the existing SQLite Durable Object binding and constant-size storage. It adds
no paid resource, account-wide usage meter, sermon archive, or paid fallback. The Access
bypass remains limited to `/overlay*` and `/api/live/overlay*`; all Main-channel
retrieval, control, takeover, End, and rotation routes remain Access protected.
The amendment also moved the active-service attempt counter into the Durable Object so it
survives reload and confirmed takeover.

## Translation-model migration amendment (2026-08-02)

Groq announced that Free and Developer access to `llama-3.1-8b-instant` will shut down
on 16 August 2026 and recommends `openai/gpt-oss-20b` as its replacement. The default
translation model is therefore migrated before that deadline. All translation requests
use a 256-token completion ceiling; GPT-OSS requests additionally use low reasoning
effort. Prompts include only glossary mappings relevant to the current caption or up to
the four most recent retained source captions.

The replacement's published Free limit is 1,000 requests per day rather than the prior
14,400. The capture cadence increases from four to six seconds, bounding one uninterrupted
90-minute service to 900 reserved transcription attempts and therefore no more than 900
translation calls. This leaves a small request margin but does not guarantee the token
allowance or account-wide quota: silence, same-language captions, other Groq applications,
repeated services, and actual prompt/output token usage all affect the provider totals. A
provider `429` remains fail-closed and ends the service without any paid fallback.

## Context-buffer, prompt, and mobile-viewer amendment (2026-08-23)

The six-second cadence becomes an operator-selectable 6-, 9-, or 12-second speech buffer.
The start-time value is locked for the service; longer windows can reduce chopped phrases
but add equal latency and cannot guarantee a completed semantic unit. The 900-attempt
server ceiling remains derived from the fastest option, so choosing a longer buffer never
increases provider usage. Pause discards an unfinished active window.

Translation uses a fixed system prompt rather than an agent wrapper. The operation is one
bounded model call with no tools, and an agent layer would add latency and failure modes
without allowing the model to wait for audio it has not received. The system prompt asks
for one faithful, idiomatic caption, preserves evident tone and intentional repetition,
and forbids invented or completed scripture, lyrics, quotations, doctrine, facts, or
missing context. Current caption, relevant approved terms, and up to four recent captions
are encoded as structured untrusted data; context may disambiguate only the current text.

Each active service also receives a separate random mobile-viewer credential. Only its
hash enters the Durable Object. `/view*` and `/api/live/viewer*` form a self-contained,
read-only path exposing at most the latest moderated translation and service status. The
viewer token cannot authorize OBS or operator routes. Replacement, End, expiry, and
takeover revoke it, while the reusable OBS credential remains unchanged. Deployment must
add exact Access bypasses for the two viewer paths without broadening protection for
`/api/live/channel*` or any inference route.

## Free-tier envelope at decision time

The published Groq free limits for both Whisper models are 20 requests per minute,
2,000 requests per day, 7,200 audio seconds per hour, and 28,800 audio seconds per day.
Six-second chunks reserve 10 transcription attempts per minute and 900 for a 90-minute
service. The GPT-OSS 20B translation model publishes 30 requests per minute, 1,000
requests per day, 8,000 tokens per minute, and 200,000 tokens per day. Prompts and
completion size remain bounded, but the token limit may stop a content-heavy service
before its request or time ceiling.

Cloudflare Workers Free publishes 100,000 dynamic requests per day with 10 ms CPU per
invocation. External-network wait time is not the same as CPU time, but the OpenNext
build and audio proxy still require production-runtime validation.

These limits were rechecked on 4 August 2026. They are provider policy, not an SLA, and
may change. Before each pilot the
operator must check the account's actual limits. No paid billing fallback is enabled in
Phase 1A.

The migration merged to `main` through PR #18 at `e680576` on 2 August 2026. That merge
is source-control evidence, not proof that Cloudflare deployed the revision or that a real
GPT-OSS request succeeded.

## Consequences

- The Mac only captures audio and displays the web app; AI compute runs in the cloud.
- Internet loss stops cloud transcription. The app must never fabricate captions.
- File-based chunking is near-live rather than a true streaming transcript. The selected
  6-, 9-, or 12-second window implies at least that duration plus upload and inference
  latency.
- One 60–90 minute service fits the published request-count envelope, but the token
  allowance is not guaranteed to cover a complete service. Repeated services, shorter
  chunks, large translation prompts, or other apps in the same Groq organization can
  exhaust it.
- The free translation model needs evaluation for every confirmed language and biblical
  terminology. A human-approved glossary remains authoritative.
- Sermon storage and summaries remain separate, opt-in later phases; choosing cloud AI
  does not grant permission to archive audio or transcripts.

## Upgrade boundary

Quota exhaustion, latency, translation quality, or reliability can justify a paid
provider later. `TranscriptionProvider` and `TranslationProvider` isolate the browser
from Groq response shapes. A summary-provider contract is deliberately deferred until
the project approves transcript consent, retention, grounding, and review behavior.
