# Security policy

Reviewed 1 November 2026 against merged PR #91 (`1e9a58d`). The 13 September deployment
retry of `20597d8` succeeded;
[Deployment](docs/DEPLOYMENT.md) records the version and remaining runtime gates.

Caption Studio is a pre-release prototype. Security fixes are supported only on
the current `main` branch; no production security or availability SLA is offered.

## Report a vulnerability

Do not open a public GitHub issue for a vulnerability, exposed credential, or active
overlay URL. Until a dedicated private reporting address exists, contact the repository
owner through an agreed private channel and include only the minimum synthetic evidence
needed to reproduce the issue.

Do not attach real service audio, transcripts, member details, passwords, API keys,
Cloudflare Access JWTs, or overlay tokens. If a credential may have been exposed, tell
the owner which credential and environment are affected without sending the credential
itself.

## Security boundaries

The deployment separates operator authentication from scoped audience credentials:

| Surface | Expected protection | Capability |
| --- | --- | --- |
| Dashboard and Next.js app | Cloudflare Access | Operator UI |
| `/api/ai/health` | Deployment-level Cloudflare Access | Non-secret configuration status |
| `/api/ai/readiness` | Access JWT plus server-side Groq secret | Provider model-availability verification |
| `/api/ai/transcribe`, `/api/ai/translate` | Access JWT, active controller, one-time reserved attempt per stage, and server-side Groq secret | Bounded AI inference |
| `/api/live/channel*` | Cloudflare Access JWT | Create, retrieve, control, take over, end, and rotate the Main channel |
| `/overlay*` | Public network path; no operator capability | Self-contained OBS page |
| `/api/live/overlay*` | Reusable channel token and read-only WebSocket | Current public caption stream |
| `/view*` | Public network path; no operator capability | Self-contained mobile viewer page |
| `/api/live/viewer*` | Per-service viewer token and read-only WebSocket | Current moderated translation and service status |
| `/api/live/channel/observer` | Cloudflare Access JWT | One read-only caption-stream credential for the signed-in workspace operator |
| `/operator/mobile`, remote experience APIs | Access plus explicitly paired remote credential | Pause/Resume/Clear and acknowledgement status |
| `/api/live/experience/*` | Access; controller required for active-service operations | Private history, summaries and numeric usage |
| `/read`, `/_next/static/*` | Public document/static assets | Reader UI, no embedded credentials |
| `/api/live/reader` | Separate service reader credential | Published translated paragraphs only |

The OBS and mobile-viewer paths need exact, more-specific Cloudflare Access bypasses
because viewers cannot complete operator sign-in. Keep existing overlay/viewer bypasses
narrow; add `/read`, `/api/live/reader` and `/_next/static/*` only as specified in
[Deployment](docs/DEPLOYMENT.md#access-paths). Never bypass the dashboard, remote,
experience, inference or operator channel routes.

The local Worker now verifies Access before atomically claiming a reserved attempt for
each inference stage. Direct or replayed transcription requests cannot skip this claim;
noncanonical inference-path aliases are rejected before Next.js routing. Paused,
expired, stale-controller, duplicate, unreserved, and over-ceiling requests fail closed.
Pause and confirmed refresh invalidate earlier reservations even after Resume. Legacy
state invalidates all pre-existing reservations because their dispatch history is unknown.
These controls pass local checks and await deployed verification; see [G01](docs/GAP_ANALYSIS.md).

The [12 September investigation](docs/DEPLOYMENT_REHEARSAL_READINESS.md) is historical.
Current deployment identity is in the [runbook](docs/DEPLOYMENT.md); physical rehearsal,
account-plan/data controls and exact public route behavior still require verification.
Successful packaging/deployment is not an application-auth or semantic-quality test.

## Overlay credential model

- The single Main channel receives a cryptographically random 256-bit OBS token.
- The reusable URL keeps `main.token` in its fragment, which is not sent in the initial
  document request. Overlay JavaScript sends the token only as a WebSocket subprotocol.
- The Durable Object keeps the token hash for validation and an AES-GCM-encrypted copy
  for retrieval by Cloudflare Access-approved collaborators. The encryption key is a
  separate Worker secret that must be encrypted and never reach the browser.
- Starting a service creates a different 256-bit controller credential. Its hash gates
  captions, style changes, and live controls; the raw value stays in tab `sessionStorage`
  and expires with the 90-minute service.
- A confirmed takeover atomically replaces the controller hash. Stale operations fail
  and the displaced browser stops capture when it receives that response.
- End and expiry clear public content and controller state while retaining the OBS URL.
  Only confirmed rotation changes the OBS token, closes sockets, and revokes the old URL.

The reusable overlay URL is a long-lived bearer credential. Anyone who receives it can
read public captions whenever the channel publishes them. Do not post it, log it, put it
in analytics, or show it in screenshots. If it may have leaked, end the active service,
rotate the link, and replace the Browser Source URL in OBS.

The 12 September read-only check found production `OBS_CHANNEL_ENCRYPTION_KEY` stored
as `plain_text`, contrary to that requirement. Its value was not extracted or reused,
and production was not changed. An isolated rehearsal needs a fresh encrypted secret;
production remediation must account for the existing encrypted OBS credential. See the
[readiness record](docs/DEPLOYMENT_REHEARSAL_READINESS.md).

## Mobile viewer credential model

- Every successful service start creates a new cryptographically random 256-bit mobile
  viewer token, separate from both the OBS and controller credentials.
- The link keeps `main.token` in the URL fragment. The self-contained page sends it only
  as the `church-caption-viewer-v1` WebSocket subprotocol; the token is never placed in a
  page request or query string.
- The Durable Object stores only the viewer-token SHA-256 hash. The raw link remains in
  the operator tab's `sessionStorage`; it is not recoverable by another operator tab.
- A viewer can receive only the current moderated target-language caption and live,
  paused, or ended status. It receives no source text, history, style, controller, OBS
  token, inference access, or mutation capability.
- Confirmed replacement revokes connected viewers immediately without changing OBS.
  End, service expiry, and takeover delete the viewer hash and revoke the old link.
- Service start records the starting operator's Access email on the channel. It is
  returned only by Access-protected operator surfaces, is dropped at End, expiry and
  takeover, and never reaches the overlay, mobile viewer or reader.
- A workspace operator who does not hold the controller may register one watcher token
  for the running service. It is minted per signed-in Access identity, stored only as a
  SHA-256 hash, capped at 32 identities per service, and carries exactly the mobile
  viewer's read-only capability on the same WebSocket. Start, End, expiry and takeover
  delete every watcher hash; replacing the audience link does not, because the watcher
  credential is separate from it. Source text still reaches a watcher only through the
  Access-protected archive of a service that opted into saved history.
- The page is `no-store`, `noindex`, non-frameable, uses a no-referrer policy, disables
  sensitive browser permissions, renders text with `textContent`, and retries abnormal
  disconnects at most eight times with backoff capped at 30 seconds (the OBS overlay
  stops after twelve). The `/read` and `/operator/mobile` documents carry equivalent
  `no-store`, no-referrer, `DENY` and permissions headers through `next.config.ts`.

Treat the mobile link as a short-lived bearer credential. Share it only with intended
viewers, never place it in logs, analytics, screenshots, or public posts, and replace it
immediately if it is mis-shared.

## Data handling

Treat these as sensitive even when the app does not persist them:

- provider keys, Access tokens, OBS URLs, and mobile viewer links;
- raw or processed audio;
- source, translated, or public service text;
- summaries and biblical-reference annotations;
- member identities, church roles, and unpublished service details;
- private glossary terms, public-filter drafts, and custom translation prompts; and
- audit, quota, and usage records.

Current behavior:

- raw audio is captured in a selected or pause-driven 6- to 14-second browser window, forwarded for
  active inference,
  and not stored by this application;
- protected source and translated text remain in active browser memory; explicit
  pre-service opt-in also stores private source and corrections for seven days after End;
- the Access email of the operator who started the running service is kept on the Main
  channel so the rest of the workspace can see who holds the microphone, and is deleted
  at End, expiry and takeover;
- only the latest moderated public caption is kept in the Main room's durable storage
  until Clear, Pause, refresh, End, expiry or rotation removes it; a paused synthetic test
  or operator-typed manual caption occupies that same slot instead, unmoderated, since
  neither is transcribed audience speech;
- caption-style preferences, a custom operator prompt, default summary configuration, a
  default translation setup, a history-saving default, the automatic-summary opt-in and
  theme explicitly saved by the operator
  are stored in the `OperatorPreferences` Durable Object: the theme in the operator's own
  record, and everything else in one church setup record (`workspace:setup`) that every
  signed-in operator can read and change
  ([ADR 0022](docs/decisions/0022-shared-church-setup-and-words-list.md)). Setups saved
  per operator before then stay in that operator's record,
  addressed by the SHA-256 of the lower-cased Access email (the email itself is not
  stored) and retained until the operator resets or deletes them; the same values keep an
  unencrypted browser `localStorage` copy as a fallback when the account store is
  unavailable;
  other translation drafts remain in React/page memory and disappear on reload. A sidebar
  width or tutorial dismissal saved before
  [ADR 0021](docs/decisions/0021-live-sermons-settings-operator-layout.md) is dropped from
  that record on its next save; any browser copy stays in `localStorage` until site data
  is cleared, unread;
- during an active service, the active language, terminology, filter, recording window,
  Inference, Sanitization, and inappropriate-language filter settings, and prompt snapshot
  are stored in that tab's unencrypted `sessionStorage` solely for same-tab recovery, then
  removed on End, takeover, or idle cleanup. The output buffer queue and
  filtered-segment count are not stored there or anywhere else; they exist only in that tab's
  React state. Dropped segment text is never logged or saved;
- the active translation prompt crosses the protected API/Groq boundary and is not
  stored in the room or sent to audience clients. The journal receives glossary/filter
  context for reader work; opted-in checkpoints retain that bounded context while needed.
- Live drafts re-use the protected inference routes with ordinary reserved attempts. Draft
  source and public forms remain only in the controlling tab's memory and are never stored
  in the journal, room, session snapshot, or audience surfaces;
  Summary settings/guidance are separately retained with opted-in private summary jobs;
- acknowledged translation usage is reduced to bounded numeric token totals plus the latest
  sanitized Groq daily-request/per-minute-token headroom. These service counters are
  stored in the active Main Durable Object and returned only through the Access-protected operator channel
  read; an active controller must claim its reserved attempt before inference, and the
  response waits for usage acknowledgement. Incomplete output is stripped and returned as
  `422 translation_incomplete` after its available usage is persisted; missing or failed
  acknowledgement remains terminal. OBS and mobile-viewer
  documents/WebSockets never receive it;
- a translation-session refresh clears unfinished/queued audio, recent translation
  context, and current public output without rotating the controller, viewer, or OBS
  credentials or extending the original service expiry; and
- opted-in transcript archives store original source, reviewed corrections, exclusions,
  reader paragraphs, and summary drafts. These are workspace-wide, not per-operator: one
  Access tenant is one workspace, and every signed-in operator may read, correct, export
  and delete any saved transcript in it. They stay unreachable from the
  overlay, mobile viewer and reader. Numeric usage has independent 30-day retention. No
  audio bucket or third-party analytics store is introduced.

Anyone with access to the same unlocked browser profile, or any same-origin script that
runs in that profile, may be able to read `localStorage` and active-tab `sessionStorage`.
Use only synthetic or approved translation guidance, never put credentials or confidential
pastoral information in any translation field, and clear site data and close active tabs
when a shared operator machine changes hands.

The custom operator prompt is bounded to 4,000 characters and rejects unsupported control
characters. The application places it after a server-owned envelope that the operator
cannot edit; the model is explicitly instructed to prioritize that envelope's source and
target languages, Chinese output script, untrusted-data handling, non-invention rules, and
one-caption output contract. This reduces accidental prompt-policy changes but is not a
hard enforcement boundary, does not make model output authoritative, and does not eliminate
prompt-injection or translation-quality risk; church-approved review remains required.

The same envelope pattern also structures the optional reader-join and summary prompts,
which have no operator-editable text of their own. Independently of that input-side
envelope, an output-side check screens each AI response for distinctive refusal-style
phrasing (for example "as an AI") and for the envelope's own boilerplate text leaking back
into the response, before the response is trusted. It is a heuristic safety net, not a
guarantee: only its construction has been tested, not its effectiveness against a live
model, and a sufficiently subtle prompt-injection attempt could still pass both checks.

Groq Zero Data Retention must be enabled before approved real-service testing. Groq's
published policy says non-content usage metadata is still retained. Verify the active
organization's Data Controls rather than assuming a key inherits another account's ZDR
setting.

## Deployment requirements

- Keep deployment credentials and runtime secrets in Cloudflare. GitHub stores source
  and pull requests only; the repository has no GitHub Actions deployment workflow.
- Treat the connected Cloudflare build as the production publisher and verify its
  deployed revision after every merge to `main`.
- Store `GROQ_API_KEY` and `OBS_CHANNEL_ENCRYPTION_KEY` only as encrypted Worker secrets.
- Generate the OBS encryption value with at least 32 random characters. If it is lost
  or changed, use the authenticated rotation recovery path and update OBS.
- Never expose secrets through `NEXT_PUBLIC_` variables or client bundles.
- Configure and verify both the Access audience and team domain in production.
- Fail closed when Access is absent or invalid; the local `CAPTION_LOCAL_AUTH_BYPASS`
  setting is never a production configuration.
- Restrict the Access allow policy to approved operator identities and remove former
  collaborators promptly.
- Keep the Worker on the intended plan and do not introduce paid fallback without an
  explicit owner decision.
- Preserve all four SQLite Durable Object bindings and v1/v2/v3 migrations in
  `wrangler.jsonc`, plus AI and assets. Optional AI remains disabled until configured.
- Keep logs free of audio, captions, prompts, glossary terms, JWTs, OBS URLs, and mobile
  viewer links. Workers observability logging is enabled in `wrangler.jsonc`, so any
  `console` output is retained by Cloudflare.
- Review Cloudflare routes after every domain or Access-application change.
- Test takeover, controller replacement, End-with-link-retention, explicit rotation,
  service expiry, the server-owned ceilings of 1,800 reserved transcription attempts and
  1,400 caption events, service-local translation-usage deduplication/reset, the
  250-viewer socket ceiling, malformed channel IDs,
  cross-protocol tokens, invalid origins, oversized bodies, and provider failures with
  synthetic data before a live pilot.

## Dependency and code hygiene

- Commit the npm lockfile and review dependency changes in pull requests.
- Run `npm audit`, tests, type checking, lint, build, and `git diff --check` before a
  release; assess findings rather than applying unreviewed force upgrades.
- Run strict unused-local/parameter checks and an export/dependency audit; remove unused
  packages, exports, and dead provider code instead of leaving dormant attack surface.
- Verify convention-loaded build entry points before deleting anything reported only by
  static analysis. `open-next.config.ts` is loaded by the Cloudflare build CLI.
- Validate request size from the received body before parsing JSON or multipart data,
  not only from `Content-Length`.
- Keep provider prompts, recent context, glossary entries, and output sizes bounded.
- Live notes are operator-entered prompt text, capped at 500 characters and kept in the controlling tab's `sessionStorage` for the matching service only. They are sent only to the translation provider, never logged, archived, or shared with audience surfaces. Recent outputs stay in that tab's memory and are not sent to a provider or stored in the journal.
- Session metadata is operator-entered record-keeping data in the same saved-service journal and seven-day retention window as its archive. It is not included in translation or summary prompts and is not logged.
- Keep the translation-session revision check fail closed so a provider response started
  before refresh cannot publish under the newly active settings.
- Avoid raw exception details in public responses.

On 13 September 2026, `npm audit --omit=dev` and full `npm audit` each reported zero
known vulnerabilities; see [cleanup QA](docs/CLEANUP_DEPLOY_QA.md). Compatible lockfile updates include Nano ID 3.3.18, JS-YAML 4.3.2,
Wrangler 4.125.0, Miniflare 5.20260820.0-alpha, and Undici 7.29.0. Continue to assess
findings before updates and never apply `npm audit fix --force` without a compatibility
review.

On 25 October 2026, compatible updates (Next.js 16.4.3, the `sharp` override raised to
0.35.5, Wrangler 4.152.0, OpenNext 1.20.13 and transitive patches) brought
`npm audit --omit=dev` back to zero. The full audit still reports seven development-only
findings with no compatible fix: Undici inside Miniflare's local simulator (the offered
fix downgrades Wrangler to 4.35, a breaking change) and `glob` inside a build-time
minifier, whose advisory concerns only its CLI flags. Neither ships in the deployed Worker.

## Incident response

If a secret or token is exposed:

1. Stop capture. Replace an exposed latest-viewer or reader link, revoke/re-pair an
   exposed remote, or rotate an exposed OBS link while idle. End revokes the latest
   viewer and remote but leaves a 30-minute reader grace; replace the reader link while
   active or delete an ended saved archive to revoke that reader immediately.
2. Rotate the Groq or OBS encryption key, or invalidate the affected Cloudflare Access
   session, as appropriate. Rotating the encryption key also requires rotating the OBS URL.
3. Check Worker and provider logs for time, routes, and usage metadata without copying
   service content into the incident record.
4. Remove the exposed material from the source location and repository history where
   necessary; deletion from the latest commit alone may be insufficient.
5. Document the root cause, affected window, remediation, and follow-up controls in a
   private incident record.

## Plan 1 history and optional inference

The approved Plan 1 privacy and threat review is recorded in
[the implementation decision](docs/decisions/0011-service-history-and-optional-inference.md).
Transcript archives are shared among this app's authorized operators, not isolated by email.
History consent is explicit before Start and cannot be enabled retroactively. Content
expires seven days after End/expiry; reader access ends after a 30-minute grace period.
Read-time checks enforce expiry even if cleanup alarms are delayed. Original source is
never sent to audience readers. Raw audio remains unstored.

Numeric usage admissions and outcomes expire individually after 30 days and survive all
content deletion and controller actions. Unknown outcomes remain unknown. Provider
admission fails closed if accounting is unavailable, and uncertain calls are not replayed.

`/api/live/reader` accepts only a separate service reader token. It never initiates AI.
`/api/live/experience/*` requires Access; scoped remote credentials additionally authorize
only Pause, Resume, Clear and command status. Pairing needs Access but not the
controller, so each of the workspace's operators can hold one phone credential for the
same service, capped at 32 identities and bound to that service. Pairing never grants
inference or source access. Keep protected paths out of broad Access bypass policies.

Optional Workers AI generation is disabled until explicitly configured. Reader output is
moderated again; summaries use a fixed grounding policy and validate evidence IDs. These
checks cannot prove semantic faithfulness. Operators must review summaries before export.
Deletion and source revisions invalidate pending jobs; persistent tombstones prevent
late responses from recreating deleted content. No exact TB2 reference corpus is present.
Complete the protected rehearsal and approved content evaluation before enabling this
workflow for real services.

An operator who opts in to automatic summaries ([ADR 0019](docs/decisions/0019-automatic-post-service-summary.md))
gets the same Workers AI summary job queued when they end a saved service, from their
account's saved defaults. It uses the same ledger and caps, stays in the private archive,
and still requires review before export. No new processor or recipient is involved.
