# Architecture

Reviewed against merged PR #33 (`abae57b`), 14 September 2026. Cloudflare deployed
`20597d8` after the proxy fix; later merges have no recorded deployment yet. See the
[runbook](DEPLOYMENT.md). Deployment success does not establish
physical-device, provider-output or semantic acceptance.

## Components and trust boundaries

| Component | Responsibility |
| --- | --- |
| Capture browser | Audio selection, 6/9/12/15/18-second MediaRecorder chunks, two-chunk queue, source preview, terminology, moderation, controls and same-tab recovery |
| Next.js / OpenNext | Operator, remote and reader UI; health, readiness, transcription and translation handlers |
| `custom-worker.ts` | Experience and live dispatch before OpenNext; Access-before-inference claims; exports all Durable Object classes |
| `CaptionRoom` | Main channel and reusable OBS credential, active controller, service limits, attempt claims, live public output, reader identity, remote commands and archive index |
| `SermonJournal` | One service's source/corrections/exclusions, reader paragraphs, lifecycle checkpoints and manual summary jobs |
| `AiUsageLedger` | Deployment-wide numeric admissions, deduplication, optional AI budgets and rolling 30-day expiry |
| Groq | Whisper transcription and contextual GPT-OSS 20B translation |
| Workers AI | Optional shared reader phrasing and bounded manual summaries |

The browser is the sole active client platform. The [native shell](../ios/README.md)
is a deferred experiment, not an alternative live AI pipeline. There is no audio object
store, D1, Queues, Supabase, analytics SDK, local model runtime or paid fallback.

GitHub handles source review. Cloudflare Workers Builds builds OpenNext and deploys
`custom-worker.ts` plus assets after merges to main. There is no GitHub Actions workflow.
Direct deployment uses the existing `OPEN_NEXT_DEPLOY` guard to avoid an unnecessary
remote AI proxy; see [Deployment](DEPLOYMENT.md#why-the-deploy-command-sets-open_next_deploy).
The default OpenNext config has no configured incremental/tag cache or skew protection.

## API and inference sequence

1. An Access-authenticated `POST /api/live/channel/service` starts or explicitly takes
   over the service. It creates a controller, latest-viewer and reader credentials,
   snapshots immutable history consent, and initializes a journal. Failed initialization
   releases the undisclosed controller.
2. The browser reserves an attempt through `POST /api/live/channel/lease`. The room
   enforces active ownership, status, expiry, and the service ceiling.
3. `POST /api/ai/transcribe` carries `x-caption-controller` and
   `x-caption-transcription-attempt`. The Worker verifies Access, then atomically claims
   transcription for that attempt. Numeric usage is admitted before Groq dispatch.
4. With saving enabled, the browser separately sends recognized source to
   `POST /api/live/experience/source`. Original text is retained; approved recognition
   aliases become separate corrections.
5. Non-silent source differing from the target goes to `POST /api/ai/translate` with
   the same header pair. It consumes a separate stage claim and usage admission. The
   response waits for sanitized service usage acknowledgement.
6. The browser applies glossary and public moderation, then sends
   `POST /api/live/channel/caption` with the translation revision and Clear epoch.
   The room broadcasts the fast caption to OBS and the latest viewer and appends the
   public chunk to the journal.
7. A journal alarm batches at most five chunks roughly every 30 seconds. Optional Workers
   AI phrasing is followed by glossary/filter processing again. Fallback joins already
   moderated translations. `GET /api/live/reader` polls existing output; no poll starts AI.
8. `DELETE /api/live/channel/service` ends capture, finalizes history and starts reader
   grace. An Access-protected manual summary request can then queue bounded journal work.
   Every model stage admits/reconciles usage independently.

Canonical inference POST paths are required. Encoded, repeated-slash, trailing-slash and
unsupported `/_next/data/*` aliases cannot bypass claims. Access verification checks
issuer/audience against cached team JWKS. Shared body readers enforce received bytes
before parsing JSON/multipart, not only declared Content-Length.

Claims reject paused, expired, unreserved, duplicate and displaced-controller work.
Pause/refresh invalidate earlier reservations even after Resume. Legacy reservations
with unknown dispatch history are invalidated conservatively. A downstream failure
still consumes its claim; it cannot be replayed to spend again.

### Route inventory

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/ai/health`, `POST /api/ai/readiness` | Access (readiness) | Configured models; readiness also checks Groq model availability |
| `POST /api/ai/transcribe`, `POST /api/ai/translate` | Access + controller + attempt claim | Live inference; 3 MB audio + 16 KB fields, 32,000-byte JSON |
| `GET`/`POST /api/live/channel` | Access | Read or create the Main channel |
| `POST /api/live/channel/service`, `DELETE …/service` | Access | Start/takeover and End |
| `POST …/lease`, `POST …/caption` | Access + controller | Reserve an attempt; publish one moderated caption (8,192 bytes) |
| `POST …/control` | Access + controller | `pause`, `resume`, `clear`, `show-test`, `refresh-translation` |
| `PUT …/style`, `POST …/rotate`, `POST …/viewer/rotate` | Access | Shared style; OBS rotation; viewer replacement (4,096-byte bodies) |
| `GET /api/live/overlay?channel=main`, `GET /api/live/viewer?channel=main` | Token subprotocol | OBS and latest-viewer WebSockets |
| `POST /api/live/experience/source`, `…/gap`, `…/host`, `…/pair`, `…/remote`, `…/reader-rotate` | Access (+ `x-caption-remote` for remote) | Opted-in source, capture gaps, host heartbeat, phone pairing and commands, reader link rotation |
| `GET …/experience/usage`, `GET …/experience/history`, `GET …/sermons/{id}/archive` | Access | Rolling usage, archive index, one sermon's private archive |
| `POST …/sermons/{id}/summary`, `…/remove`, `…/correct`, `…/delete` | Access | Manual summary (16–64 char `requestId`, returns an existing queued job), passage removal, source correction, deletion |
| `GET /api/live/reader` | `x-caption-reader` header | Appending reader paragraphs, 50 per poll |

Experience JSON bodies are limited to 32,768 bytes. Groq calls time out after 30 seconds
for audio and 15 seconds for chat; Durable Object calls after 8 seconds.

## Credentials and public surfaces

| Surface | Credential and capability |
| --- | --- |
| Operator / experience APIs | Cloudflare Access; current controller additionally required for live actions |
| `/operator/mobile` | Access plus a paired service remote token; Pause/Resume/Clear and command status only |
| `/overlay` / overlay WebSocket | Reusable 256-bit OBS token; latest public caption/style only |
| `/view` / viewer WebSocket | Separate 256-bit per-service token; latest moderated target text/status only |
| `/read` / reader API | Separate service reader token; translated paragraphs only |

Bearer links use fragments, not query strings. OBS/latest-viewer sockets send credentials
as purpose-specific subprotocols; the reader sends `x-caption-reader` and the paired
phone sends `x-caption-remote`, beside the capture computer's `x-caption-controller` and
`x-caption-transcription-attempt`.
Wrong-purpose credentials are rejected. Audience clients receive no private source,
summary, usage, controller or provider secrets.

The Main room stores an OBS token hash and AES-GCM-encrypted recoverable copy under the
server-only `OBS_CHANNEL_ENCRYPTION_KEY`. Other raw live credentials stay in the
operator tab's sessionStorage; server state retains hashes. End/expiry preserves the
OBS URL and style. Only explicit idle rotation changes that reusable credential.

The latest viewer is revoked at End, expiry, takeover or replacement. The reader keeps
30 minutes of access after End/expiry; replacement, takeover and archive deletion revoke
it immediately on the server. A disconnected phone reflects revocation only after it
successfully reconnects/polls. Remote pairing ends with the service/controller.

Public documents and their specific data/static paths need narrow Access bypasses;
all operator and inference paths remain protected. See [Security](../SECURITY.md)
and the [exact deployment paths](DEPLOYMENT.md#access-paths).

## Live, remote, and reader lifecycle

The room owns server sequence numbers, translation revisions and Clear epochs. Clear
blanks current output without pausing capture, rejects old publication, and drops pending
reader work. Pause/refresh also create boundaries; committed reader paragraphs remain.
Refresh adopts reviewed drafts without replacing credentials, resetting usage, or
extending the original 90-minute expiry.

The capture computer polls paired remote status about every two seconds. Server-side
remote Pause blocks claims before the host acknowledges physical capture stopping.
Commands use bounded IDs and cached results; duplicate retries do not repeat actions.
The host counts as connected only while its heartbeat is under 15 seconds old; remote
Resume is refused while it is disconnected. One command may be pending at a time, and a
pairing accepts at most 1,400 commands before the phone must pair again. Resume must be
acknowledged by the host. A missing host cannot be reported as confirmed.

The reader polls about every two seconds, pages saved paragraphs, and follows new content
only when near the bottom. It keeps earlier paragraphs/revisions/languages rather than
rewriting the whole sermon. The journal keeps retryable lifecycle metadata and, when
saving is enabled, a reader-flight checkpoint. Interrupted generation falls back without
another model dispatch. Summary-flight interruption fails visibly for manual review.

Remove passage marks the public paragraph removed, excludes its source IDs from future
summary input and invalidates drafts; original private source is preserved. The API also
requests a clear if the current live caption uses one of those source IDs. It never
publishes a replacement caption. Delete requires End and confirmation, removes private/public history and
the archive index, and leaves a tombstone. Revision/deletion checks reject late results.

## Storage and retention

| Data | Store and lifetime |
| --- | --- |
| Raw audio and queued chunks | Browser/request memory only; never archived |
| Draft translation settings | Page memory; active snapshot in tab sessionStorage for recovery |
| Explicitly saved prompt, summary defaults, style, tutorial dismissal | Unencrypted browser localStorage until cleared; shared channel style also persists |
| OBS ciphertext/hash, style and sequence | Main room until explicit rotation/change |
| Controller/viewer/reader/remote hashes, claims, service counters | Service-scoped Main/journal state; reader has bounded post-End grace |
| Latest public caption | Main live state; cleared by controls and End/expiry |
| Source, corrections, exclusions, paragraphs, summaries with saving on | Private per-service journal; expires seven days after End/expiry |
| Reader text with saving off | Object/browser memory; may be lost on eviction; no private source archive |
| Reader rule snapshot/checkpoint with saving on | Bounded glossary/filter and pending public input in journal while needed for processing/recovery |
| Numeric usage and deduplication entries | Separate usage object; each expires 30 days after its original attempt |
| Archive index / deletion tombstones | Content-free lifecycle records; expired index entries cleaned, tombstones reject late writes |

Saving is default-off, explicit before Start, and immutable for that service. All
Access-approved operators share archives; there is no per-email tenancy. Read-time expiry
checks deny access even if alarms run late. Application deletion does not promise
immediate physical erasure of provider recovery copies or recall of exported content.
Provider data policies/settings require separate verification.

## Models, prompting and bounds

The live defaults are `whisper-large-v3-turbo` and `openai/gpt-oss-20b`.
Readiness verifies configured model availability. Stale `llama-3.1-8b-instant`
overrides resolve to the migrated translation default. Other explicit overrides require
normal readiness and quality review.

Transcription accepts WebM/Ogg/MP4, at most 3 MB of audio, and bounded hints. The provider
prompt uses a conservative 224 UTF-8-byte budget. Only canonical names enter ASR hints;
approved whole-word recognition variants are deterministic corrections, not training.

Translation receives current source, at most four retained source captions, relevant
glossary mappings, an immutable server envelope, and up to 4,000 characters of editable
guidance. Completion is capped at 256 tokens; GPT-OSS uses low reasoning effort.
Only nonempty text with finish reason `stop` is publishable. Incomplete output is
stripped but available usage retained; missing usage acknowledgement stops capture.
There is no automatic source-language fallback.

Masking uses native word boundaries for Han/Hiragana/Katakana and Unicode whole-word
matching elsewhere. Missing required segmentation blocks publication. Neither prompts,
filters, nor successful finish reasons establish semantic faithfulness.

Optional Workers AI requires `CAPTION_OPTIONAL_AI_ENABLED=true`. Reader uses Llama 3.1
8B FP8; summaries allow that model or Llama 3.3 70B FP8 Fast. Summary stages use bounded
source sections (about 10 KB) and evidence notes (at most 14 KB), then synthesis.
Immutable TB2 grounding and source-ID membership checks constrain drafts; they do not
prove meaning. No authorized TB2 passage retrieval or autonomous tool loop is present.

Journal bounds: public chunks at most 2,000 characters, filter text 4,000, keyword text
8,000, source IDs at most 900 per service with source text and corrections at most
4,000 characters. Reader and archive pages return 50 records per poll. Reader phrasing
uses at most 600 output tokens and must return at most 2,000 characters or the joined
fallback is used; summaries use at most 2,000 output tokens, a 22,000-byte context guard,
a 45-second timeout, and at most 24 points of 1,200 characters citing up to 100 source
IDs each.

### Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `channel_not_configured` | 404 | Main channel not created |
| `channel_in_use` | 409 | Another controller is active; takeover requires confirmation |
| `controller_replaced`, `service_paused`, `caption_cleared`, `translation_session_refreshed`, `{stage}_attempt_used` | 409 | Stale controller, paused service, superseded caption, stale settings revision, or reused claim |
| `invalid_{stage}_attempt` | 400 | Malformed or unreserved attempt |
| `transcription_limit_reached` | 429 | 900 reserved attempts exhausted; usage admission may also return 409/429 |
| `service_inactive` | 410 | Ended or expired service; reader links return 403/410 |
| `invalid_overlay_key`, `invalid_viewer_key` | 401 (503 when the OBS credential cannot be decrypted) | Wrong-purpose or revoked token |
| `translation_incomplete` | 422 | Provider output skipped; usage retained |
| `*_authorization_unavailable`, `translation_usage_unavailable`, viewer capacity | 503 | Room or ledger unavailable, or 250 viewer sockets reached |

## Limits and remaining validation

Services allow 90 minutes, 900 reserved transcription attempts and 1,400 caption events.
At most one translation follows an eligible chunk. The latest viewer allows 250 sockets.
Two queued audio chunks bound backlog; additional chunks are dropped with operator feedback.

Reader/summary calls are capped at 200/60 per service. The ledger conservatively reserves
up to 9,000 estimated neurons per UTC day, including a 6,000 reader ceiling. Reservations
stay charged on uncertainty. Failed admission blocks dispatch; unknown consumption never
becomes an invented zero. This ledger measures this deployment, not all provider-account
activity or a renewable monthly allowance.

The processing metric excludes recording, queue wait and audience rendering. Real
latency, physical devices/OBS, cloud alarms, long-service behavior, human accessibility
and church-language quality remain [rehearsal gates](STAKEHOLDER_TEST_GUIDE.md).
See [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md), [remaining gaps](GAP_ANALYSIS.md), and
[ADR 0011](decisions/0011-service-history-and-optional-inference.md).
