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
| `/api/live/session*` | Cloudflare Access JWT | Create, publish, style, and revoke a session |
| `/overlay*` | Public network path; no operator capability | Self-contained OBS page |
| `/api/live/overlay*` | Expiring session token and read-only WebSocket | Current public caption stream |

The OBS paths need a more-specific Cloudflare Access bypass because OBS cannot complete
interactive sign-in. Do not broaden that bypass to the dashboard, inference routes, or
operator session routes.

## Overlay credential model

- A session receives a cryptographically random token and a UUID.
- The generated URL holds both in its fragment. URL fragments are not sent in the
  initial HTTP request.
- Overlay JavaScript passes the token as a WebSocket subprotocol; the Worker hashes and
  compares it before accepting the connection.
- The token grants read-only access to one room, expires after at most 90 minutes, and
  is revoked when the operator ends the session.
- The Durable Object stores only the token hash, expiry, style, and latest public
  caption; it deletes the room at expiry or revocation.

An active overlay URL remains a bearer credential. Anyone who receives it can read that
session's public captions. Do not post it, log it, put it in analytics, reuse it, or show
it in screenshots. OBS and browser history on the streaming computer may retain the URL,
so use a newly generated URL for every service.

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

- Store `GROQ_API_KEY` only as an encrypted Worker secret.
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
- Test revocation, expiry, malformed IDs, invalid tokens, oversized bodies, and provider
  failures with synthetic data before a live pilot.

## Dependency and code hygiene

- Commit the npm lockfile and review dependency changes in pull requests.
- Run `npm audit`, tests, type checking, lint, build, and `git diff --check` before a
  release; assess findings rather than applying unreviewed force upgrades.
- Remove unused packages and dead provider code instead of leaving dormant attack
  surface.
- Validate request size from the received body, not only `Content-Length`.
- Keep provider prompts, recent context, glossary entries, and output sizes bounded.
- Avoid raw exception details in public responses.

## Incident response

If a secret or token is exposed:

1. End the affected live session if an overlay URL is involved.
2. Rotate the Groq key or invalidate the affected Cloudflare Access session as needed.
3. Check Worker and provider logs for time, routes, and usage metadata without copying
   sermon content into the incident record.
4. Remove the exposed material from the source location and repository history where
   necessary; deletion from the latest commit alone may be insufficient.
5. Document the root cause, affected window, remediation, and follow-up controls in a
   private incident record.

Persistent sermon storage and AI summaries must undergo a separate privacy and threat
review before implementation, including consent, authorization, retention, export,
deletion, grounding, and human approval.
