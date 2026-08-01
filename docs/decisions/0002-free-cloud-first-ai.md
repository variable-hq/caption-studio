# ADR 0002: free cloud-first AI providers

- Status: accepted for Phase 1 prototype
- Date: 2026-07-19
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
- GroqCloud Free with `llama-3.1-8b-instant` for one contextual translation target;
- four-second audio chunks as the first latency/quota test point;
- a short Whisper prompt containing approved biblical names and keyword hints;
- recent finalized captions and approved glossary mappings in the translation prompt;
- deterministic preferred-term enforcement and public-display filtering after AI output;
- provider-neutral interfaces so models or vendors can change without rebuilding the UI.

The Groq key is an encrypted deployment secret. Browsers and OBS never receive it.
Raw audio is forwarded in memory and is not stored by the application. Groq Zero Data
Retention must be enabled before real sermon audio is approved for testing.

Inference routes verify the Cloudflare Access JWT and fail closed when Access is not
configured. OBS cannot use interactive operator authentication, so its two public paths
require a narrower Access bypass plus a revocable, read-only token enforced by the
Worker. Access-plan eligibility and billing configuration must be verified in the active
Cloudflare account rather than inferred from this decision record.

## Initial disposable-room implementation (2026-07-20, superseded)

The first Phase 1A live path used a protected operator request to create a
maximum 90-minute Durable Object room and a random overlay credential. The token is
placed in the generated URL fragment, supplied to the WebSocket as a subprotocol,
validated against a stored SHA-256 hash, and was revoked on operator end or expiry. The
reusable-channel amendment below replaces that credential lifecycle. The deployment
still requires more-specific Access bypass applications for `/overlay*`
and `/api/live/overlay*`; no other operator or inference route may share that bypass.

The app also enforces four-second chunks, one target language, a bounded client queue,
and no automatic paid fallback. Its usage indicator covers only the active browser
session. It is not an account-wide quota or billing control.

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

## Free-tier envelope at decision time

The published Groq free limits for both Whisper models are 20 requests per minute,
2,000 requests per day, 7,200 audio seconds per hour, and 28,800 audio seconds per day.
Four-second chunks require 15 requests per minute and approximately 1,350 requests for
a 90-minute service. The translation model publishes 30 requests per minute, 14,400
requests per day, 6,000 tokens per minute, and 500,000 tokens per day. Prompts must keep
recent context and glossary data bounded.

Cloudflare Workers Free publishes 100,000 dynamic requests per day with 10 ms CPU per
invocation. External-network wait time is not the same as CPU time, but the OpenNext
build and audio proxy still require production-runtime validation.

These limits are provider policy, not an SLA, and may change. Before each pilot the
operator must check the account's actual limits. No paid billing fallback is enabled in
Phase 1A.

## Consequences

- The Mac only captures audio and displays the web app; AI compute runs in the cloud.
- Internet loss stops cloud transcription. The app must never fabricate captions.
- File-based chunking is near-live rather than a true streaming transcript. Four-second
  chunks imply at least the chunk duration plus upload and inference latency.
- One 60–90 minute service fits the published request envelope, but repeated services,
  shorter chunks, large translation prompts, or other apps in the same Groq organization
  can exhaust it.
- The free translation model needs evaluation for every confirmed language and biblical
  terminology. A human-approved glossary remains authoritative.
- Sermon storage and summaries remain separate, opt-in later phases; choosing cloud AI
  does not grant permission to archive audio or transcripts.

## Upgrade boundary

Quota exhaustion, latency, translation quality, or reliability can justify a paid
provider later. `TranscriptionProvider` and `TranslationProvider` isolate the browser
from Groq response shapes. A summary-provider contract is deliberately deferred until
the project approves transcript consent, retention, grounding, and review behavior.
