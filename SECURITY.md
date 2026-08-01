# Security policy

Church Live Caption is a pre-release prototype. Security fixes are supported only on
the current `main` branch; no production security or availability SLA is offered.

## Report a vulnerability

Do not open a public GitHub issue for a vulnerability, exposed credential, or active
overlay URL. Until a dedicated private reporting address exists, contact the repository
owner through an agreed private channel and include only the minimum synthetic evidence
needed to reproduce the issue.

Do not attach real sermon audio, transcripts, member details, passwords, API keys,
Cloudflare Access JWTs, or overlay tokens. If a credential may have been exposed, tell
the owner which credential and environment are affected without sending the credential
itself.

## Security boundaries

The deployment has two intentional access classes:

| Surface | Expected protection | Capability |
| --- | --- | --- |
| Dashboard and Next.js app | Cloudflare Access | Operator UI |
| `/api/ai/health` | Deployment-level Cloudflare Access | Non-secret configuration status |
| `/api/ai/readiness`, `/transcribe`, `/translate` | Access JWT plus server-side Groq secret | Provider verification and AI inference |
| `/api/live/channel*` | Cloudflare Access JWT | Create, retrieve, control, take over, end, and rotate the Main channel |
| `/overlay*` | Public network path; no operator capability | Self-contained OBS page |
| `/api/live/overlay*` | Reusable channel token and read-only WebSocket | Current public caption stream |

The OBS paths need a more-specific Cloudflare Access bypass because OBS cannot complete
interactive sign-in. Do not broaden that bypass to the dashboard, inference routes, or
operator channel routes.

## Overlay credential model

- The single Main channel receives a cryptographically random 256-bit OBS token.
- The reusable URL keeps `main.token` in its fragment, which is not sent in the initial
  document request. Overlay JavaScript sends the token only as a WebSocket subprotocol.
- The Durable Object keeps the token hash for validation and an AES-GCM-encrypted copy
  for retrieval by Cloudflare Access-approved collaborators. The encryption key is a
  separate encrypted Worker secret and never reaches the browser.
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

## Data handling

Treat these as sensitive even when the app does not persist them:

- provider keys, Access tokens, and overlay URLs;
- raw or processed audio;
- source, translated, or public sermon text;
- summaries and biblical-reference annotations;
- member identities, church roles, and unpublished service details;
- private glossary terms; and
- audit, quota, and usage records.

Current behavior:

- raw audio is captured in four-second browser chunks, forwarded for active inference,
  and not stored by this application;
- protected source and translated text remain in active browser memory;
- only the latest moderated public caption is retained ephemerally in the live room;
- display preferences are saved in browser `localStorage`; glossary and filter inputs
  are not saved; and
- no sermon archive, summary database, analytics store, or audio bucket exists.

Groq Zero Data Retention must be enabled before approved real-sermon testing. Groq's
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
- Fail closed when Access is absent or invalid; local authentication bypass is never a
  production configuration.
- Restrict the Access allow policy to approved operator identities and remove former
  collaborators promptly.
- Keep the Worker on the intended plan and do not introduce paid fallback without an
  explicit owner decision.
- Use the SQLite-backed Durable Object binding declared in `wrangler.jsonc`.
- Keep logs free of audio, captions, prompts, glossary terms, JWTs, and overlay URLs.
- Review Cloudflare routes after every domain or Access-application change.
- Test takeover, controller replacement, End-with-link-retention, explicit rotation,
  service expiry, the server-owned 1,350-request ceiling, malformed channel IDs, invalid
  tokens, oversized bodies, and provider failures with synthetic data before a live pilot.

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
- Avoid raw exception details in public responses.

## Incident response

If a secret or token is exposed:

1. End the active service and rotate the OBS link if its URL may be exposed.
2. Rotate the Groq or OBS encryption key, or invalidate the affected Cloudflare Access
   session, as appropriate. Rotating the encryption key also requires rotating the OBS URL.
3. Check Worker and provider logs for time, routes, and usage metadata without copying
   sermon content into the incident record.
4. Remove the exposed material from the source location and repository history where
   necessary; deletion from the latest commit alone may be insufficient.
5. Document the root cause, affected window, remediation, and follow-up controls in a
   private incident record.

Persistent sermon storage and AI summaries must undergo a separate privacy and threat
review before implementation, including consent, authorization, retention, export,
deletion, grounding, and human approval.
