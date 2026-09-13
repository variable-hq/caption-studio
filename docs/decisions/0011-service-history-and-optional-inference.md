# Service history, reader phrasing, and optional inference

Accepted implementation design, merged in PR #26 and deployed 13 September 2026.
[Deployment](../DEPLOYMENT.md) records the corrected build. Real-sermon acceptance remains
subject to protected runtime rehearsal and church-approved Indonesian evaluation.

## Decision

Keep the fast Groq caption pipeline. Add one SQLite Durable Object (`SermonJournal`)
per service and one numeric usage object (`AiUsageLedger`) per deployment. The existing
Main room remains the controller and remote-command authority. These bindings avoid
introducing D1, Queues, object storage, or a second secret-bearing provider integration.
Durable Object alarms run bounded shared paragraph work and manual summary stages.

Use Cloudflare Workers AI for optional phrasing and summaries, with explicit
`CAPTION_OPTIONAL_AI_ENABLED=true` configuration. Until enabled, the reader commits
existing moderated translations and summaries report that optional AI is unavailable.
Keep this switch off until the account's Free plan, model availability, content-handling
settings, and synthetic quality evaluation have been checked. No paid fallback exists.

The allowlist is Llama 3.3 70B FP8 Fast and Llama 3.1 8B FP8. Reader phrasing uses 8B;
operators select a summary model. A single service permits at most 200 reader calls and
60 summary calls. The deployment reserves at most 9,000 estimated neurons per UTC day,
with a 6,000 reader ceiling. Reservations use UTF-8 input bytes and maximum output tokens,
remain charged on uncertain outcomes, and deliberately underestimate available capacity.
This app-level guard cannot account for other apps sharing the Cloudflare allowance.

Cloudflare publishes a 10,000-neuron daily free allocation and different model rates.
Verify the account plan; paid accounts can incur overage outside this application's guard.
[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

The provider's published policy does not use customer content for training or improving
models without consent. Verify that configuration and terms remain suitable before real
sermon processing. [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).
Gemini unpaid processing was not selected because its content-use terms require a
separate privacy decision. [Gemini API terms](https://ai.google.dev/gemini-api/terms).

## Content and access

- Saving is an explicit, immutable choice before Start; default off. No audio is stored.
- With saving on, original recognized source, reviewed corrections, exclusions, moderated
  reader paragraphs, summary settings, and drafts remain private for seven days after
  End or expiry. Authorized operators of this app share archive access; there is no
  per-operator ownership or multi-church tenant boundary.
- With saving off, source is discarded and reader text stays in object/browser memory.
  An eviction can lose unreceived paragraphs. Persistent metadata contains no sermon text.
- The reader receives only published translated paragraphs using a separate fragment
  credential. It never receives raw source or credentials for other surfaces. Its token
  expires 30 minutes after End and is immediately revoked on takeover or replacement.
- `/operator/mobile` requires both Cloudflare Access and an explicitly paired service
  credential. It can only Pause, Resume, Clear, or read acknowledgement status.
- Clear advances a boundary and drops unfinished reader work. Committed paragraphs remain.
  Remove passage requires confirmation, removes public content, excludes its source IDs,
  and invalidates summaries. It preserves private originals. Archive deletion requires End
  and confirmation; a tombstone rejects late writes and lifecycle messages.

The first TB2 vocabulary profile contains names, not copyrighted passage text. Approved
recognition aliases match whole words. The reported `swauf` alias is not silently enabled.
The operator may explicitly review `Saul|swauf => Saul`. Neither hints nor aliases train
Whisper or resolve which biblical person the speaker intended. Exact TB2 reference text
requires separately authorized access; summaries must not reconstruct or invent it.

## Recovery, accounting, and limits

Provider dispatch requires a persisted usage admission. A failed acknowledgement never
causes automatic redispatch. Numeric rows contain provider, model, stage, service ID,
time, known tokens/audio, conservative reservations, and pending/unknown status. They
expire individually after 30 days, independently of all caption and archive actions.
They are not an account billing record or a renewable monthly token pool.

Journal lifecycle changes use persisted retries. A failed Start releases its controller
before returning an error. Reader work keeps a checkpoint when saving is enabled; an
interrupted call falls back without another inference. Summary checkpoints fail visibly
on interruption. Clear, exclusion, and deletion are rechecked before storing late results.

Sources are bounded to 900 IDs per service. Pages contain at most 50 source records or
paragraphs. Reader batches contain at most five chunks. Summary stages use approximately
10 KB of source at a time and at most 14 KB of accumulated evidence notes. Context or daily
budget exhaustion returns a visible failure; the operator can export the private
transcript for review. Final summary points must reference supplied segment IDs. This
validates reference membership, not semantic truth: human review remains required before
export, and generated text is never automatically published.

## Deployment and release gates

1. Verify the deployed `v2` SQLite migration and `SERMON_JOURNALS`, `AI_USAGE`, and `AI`
   bindings during the runtime rehearsal; the corrected upload includes them.
2. Preserve Access protection on `/`, `/operator/mobile`, `/api/ai/*`, and
   `/api/live/experience/*`. Add public bypass only for `/read` and `/api/live/reader`,
   alongside existing output paths. Never bypass `/api/live/*` wholesale.
3. Confirm same-origin Next static assets remain loadable for unauthenticated `/read`
   visitors. If Access protects assets, add a narrowly scoped `/_next/static/*` bypass;
   those bundles contain no controller credential or provider secret.
4. Check the Free plan and disable content logging. Enable optional AI only after
   synthetic model/grounding evaluation. Do not introduce paid fallback.
5. Rehearse real Durable Object alarms, controller replacement, phone reconnect,
   microphone acknowledgement, reader expiry, summary deletion races, and retention in
   a protected test deployment. Browser mocks and local unit tests cannot prove these.
6. Obtain church-approved Indonesian audio cases for Saul, ambiguous names, chunk
   boundaries, and TB2 references. Exact verse text remains unavailable until authorized.
