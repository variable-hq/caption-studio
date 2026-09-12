# Deployment rehearsal readiness

Checked 12 September 2026 using local source, Wrangler 4.125.0, read-only
Cloudflare API calls, and unauthenticated HTTP probes. No deployment, provider
inference, cloud configuration change, or production channel mutation occurred.
Secret values, account identifiers, bearer links, and user content are omitted.

The user has authorized an isolated test deployment in principle. Execution is
blocked by the concrete account, Access, and credential prerequisites below,
not by a missing generic deployment approval.

## Verified state

| Item | Evidence and implication |
| --- | --- |
| CLI access | `wrangler whoami` succeeds with an OAuth session and Workers write/account read permissions. Deployment tooling is authenticated. No direct Cloudflare or Groq connector is available in this session. |
| Worker inventory | The authenticated account contains exactly one Worker, `church-live-caption`, and no separate test Worker. Its known origin is `https://church-live-caption.lukas-ka.workers.dev`. |
| Deployed version | Deployment `e338468f-c745-4cb7-9da9-f47a9db06ee0` assigns 100% to version `0998e416-60e5-4878-b639-d938ed5249bd` (version 27), deployed at `2026-09-10T12:20:22.78081Z`. Its source is `wrangler`. Returned version/deployment annotations contain no Git SHA; the deployed source revision remains unproven. |
| Local provenance | Inspection began at Git HEAD `aa3ddf26966abc6a482e67630b0a39211af97809` on `codex/ux-benchmark-review`, with uncommitted changes. This identifies a base commit, not the complete candidate artifact. Record the final reviewed commit or an explicit artifact manifest after validation. |
| Groq credential | Production has a `GROQ_API_KEY` binding of type `secret_text`. `.env`, `.env.local`, and `.dev.vars` are absent locally; no process `GROQ_API_KEY` is present. The encrypted production secret cannot be recovered through `wrangler secret list`. A test credential must be supplied through the normal secret provisioning path. |
| OBS encryption | Production `OBS_CHANNEL_ENCRYPTION_KEY` is nonempty but stored as `plain_text`, contrary to the documented encrypted-secret setup. Only its name, type, and presence were reported. Do not extract or reuse it for testing; use a new test-only encrypted secret. Correcting the production binding is separate work and must preserve the current key value to avoid invalidating existing ciphertext. |
| Access configuration | Production has nonempty `CLOUDFLARE_ACCESS_AUD` and `CLOUDFLARE_ACCESS_TEAM_DOMAIN` variables. However, `/accounts/{account}/access/apps` reports zero applications in the authenticated account. The intended policy owner, approved operator access, and exact public-route bypasses are not verified. Variable presence alone does not establish those policies. |
| Unauthenticated probes | `GET /api/live/channel` and `POST /api/ai/readiness` both return HTTP 403 with `error code: 1010` from Cloudflare. `/`, `/api/ai/health`, `/overlay`, `/view`, and malformed public WebSocket paths return the same denial. Requests are blocked before the intended application journey can be assessed. These results do not prove the intended Access flow or public-viewer availability. |
| Billing evidence | Worker and account settings report the `standard` usage model. `GET /accounts/{account}/subscriptions` fails with HTTP 403, code 10000, `Authentication error`. The Free-plan requirement is not verified. No Groq account plan, usage, remaining daily tokens, or ZDR setting was accessible. |
| Browser and hardware | No enabled browser-connector session is present. Native Safari is available but was being used for another task, so no authenticated operator session was verified. OBS is installed locally. Audio inventory includes BlackHole 2ch and the built-in microphone; `say`, `afconvert`, and `ffmpeg` are available. None establishes the intended church mixer, OBS scene, physical audience phones, or successful audio routing. |

Hardware clarification from the user: the microphone AUX feed connects through a USB
audio interface to the caption/operator computer, and OBS runs on a separate computer
using the hosted Browser Source. The USB audio interface model, computer details, and audience phones remain
unspecified. Local OBS installation is not evidence about that separate machine.
The [stakeholder guide](STAKEHOLDER_TEST_GUIDE.md#confirmed-rehearsal-setup) records the
selected topology and input-isolation checks; no physical test has run.

The local readiness route calls `requireCloudAccess` before provider verification.
The live channel route also authenticates before accessing channel state. The
HTTP probes above establish edge rejection only; local source order is not a
substitute for an authenticated test of the deployed candidate.

After implementation, the [local validation report](VALIDATION_REPORT.md) records the
completed 176-test validation, dry bundle, and short real local-room/socket check.
The [inference-candidate manifest](../test-results/ux-review/id-en-candidate-manifest.json)
hashes that earlier candidate relative to the base commit; it predates the subsequent
operator tutorial. Freeze the reviewed PR head as the next candidate identity before
deployment. The candidate was uncommitted at the time of that check and remains
undeployed; the earlier manifest does not identify the final PR contents. Both temporary inference-test servers were stopped after that
test; a separate local dev server may be used to review the tutorial.

Useful read-only commands already verified:

```bash
./node_modules/.bin/wrangler whoami
./node_modules/.bin/wrangler deployments list --name church-live-caption --json
./node_modules/.bin/wrangler versions list --name church-live-caption --json
./node_modules/.bin/wrangler secret list --name church-live-caption
```

When recording evidence, reduce these outputs to the necessary version IDs,
timestamps, and secret names/types. Do not capture raw Worker settings: plaintext
bindings can contain credentials.

## Prerequisites for the isolated candidate

1. Verify the actual Workers subscription and current usage in the authorized
   account. The `standard` model is not Free-plan proof: Cloudflare documents it
   with Workers Paid pricing. Do not change the plan to resolve uncertainty.
   [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
   (accessed 2026-09-12).
2. Establish the intended Cloudflare Access application for
   `church-live-caption-rehearsal.lukas-ka.workers.dev` before exposing the Worker.
   Verify approved operators and narrowly scoped bypasses for `/overlay*`,
   `/api/live/overlay*`, `/view*`, and `/api/live/viewer*`. Keep dashboard,
   `/api/ai/*`, and `/api/live/channel*` protected. Obtain the corresponding test
   audience and team domain; never enable `CAPTION_LOCAL_AUTH_BYPASS` in cloud.
3. Supply a valid Groq key to the test Worker's encrypted secrets through an
   authorized account session. Confirm the organization's plan, model limits,
   available usage, and ZDR setting. Public limit tables do not establish actual
   account headroom; Groq limits are shared at organization level.
   [Groq rate limits](https://console.groq.com/docs/rate-limits),
   [data controls](https://console.groq.com/docs/your-data) (accessed 2026-09-12).
4. Finish candidate validation, freeze its source identity, then create the
   isolated configuration. Use a fresh OBS encryption key stored as `secret_text`.
   Do not copy production channel state, tokens, or its encryption key.

## Exact configuration options after validation

Preferred: create a separate `wrangler.rehearsal.jsonc` in the repository root
with the following configuration, replacing only the Access placeholders with
verified test values. This file has not been created or deployed.

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "church-live-caption-rehearsal",
  "main": "custom-worker.ts",
  "compatibility_date": "2026-07-18",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "preview_urls": false,
  "routes": [],
  "keep_vars": false,
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "observability": { "enabled": false },
  "vars": {
    "CLOUDFLARE_ACCESS_AUD": "<VERIFIED_REHEARSAL_AUDIENCE>",
    "CLOUDFLARE_ACCESS_TEAM_DOMAIN": "<VERIFIED_ACCESS_TEAM_ORIGIN>"
  },
  "durable_objects": {
    "bindings": [{ "name": "CAPTION_ROOMS", "class_name": "CaptionRoom" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["CaptionRoom"] }]
}
```

The new Worker name and absence of a production `script_name` create a separate
Durable Object namespace. The proposed public hostname must already have its
Access policies before `workers_dev: true` is deployed. Version preview URLs stay
disabled. No production route, shared storage binding, or new runtime dependency
is needed. Cloudflare documents isolated Durable Object bindings and their
non-inheritance between named environments.
[Durable Object environments](https://developers.cloudflare.com/durable-objects/reference/environments/)
(accessed 2026-09-12).

Alternative: add a named `env.rehearsal` to the existing config, repeating its
Access variables and the local `CaptionRoom` binding, then consistently select
`--env rehearsal`. That publishes `church-live-caption-rehearsal`; bindings and
variables do not inherit automatically. The separate file is easier to inspect
without changing the production configuration.
[Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
(accessed 2026-09-12).

After prerequisites pass, the installed CLIs support these commands. They are
proposed operations, not actions completed by this investigation:

```bash
# Validate the isolated bundle locally; do not upload.
./node_modules/.bin/wrangler deploy --config wrangler.rehearsal.jsonc --dry-run

# Upload only the reviewed test Worker after Access and account checks pass.
./node_modules/.bin/opennextjs-cloudflare deploy --config wrangler.rehearsal.jsonc

# Provision test-only secrets through the secure interactive prompts.
./node_modules/.bin/wrangler secret put GROQ_API_KEY --config wrangler.rehearsal.jsonc
./node_modules/.bin/wrangler secret put OBS_CHANNEL_ENCRYPTION_KEY --config wrangler.rehearsal.jsonc

# Reconcile the final deployed version after secret provisioning.
./node_modules/.bin/wrangler deployments list --name church-live-caption-rehearsal --json
./node_modules/.bin/wrangler secret list --name church-live-caption-rehearsal
```

The initial protected test deployment can fail closed while secrets are missing;
do not start services until both are provisioned. Secret updates may create newer
Worker versions, so record the final version as well as the reviewed source and
artifact identity. The current app does not expose a deployed Git revision.

## Safe 90-minute rehearsal method

Use two distinct tests; do not claim one proves the other.

**Channel endurance without provider inference:** On the isolated Worker, use
the normal authenticated channel/service APIs and controller credential. Publish
fixed synthetic captions such as `Synthetic rehearsal 001` every six seconds
through `/api/live/channel/caption`; observe the real overlay and mobile
WebSockets. Keep credentials in memory and omit response bodies and bearer URLs
from evidence. Do not call `/api/ai/*` or reserve transcription attempts. Verify
AI counters stay zero, pause/resume clears output, observer reconnect recovers
the latest caption, a refresh rejects the old revision, and viewer replacement
revokes the old link. Preserve the original service for the full 90-minute wall
clock duration to verify expiry; test takeover and a second service afterward.
This exercises channel state and duration, not capture, transcription, translation,
or language quality. It still uses Cloudflare resources, so account checks apply.

**Synthetic audio and AI:** After Groq setup and headroom are verified, use a
short locally generated speech file with neutral test sentences. Select a
dedicated fake capture stream or verified BlackHole route so no ambient microphone
audio enters the test. Run a short sample first and estimate token consumption
from observed usage before committing to a 90-minute AI run. Stop on budget or
provider limits; no automatic paid fallback. Synthetic speech can validate
pipeline operation and recovery, but church-language quality still requires the
separately approved corpus and bilingual review. Test the intended mixer and
physical audience devices separately from simulated capture and viewport checks.

For the confirmed two-computer setup, test the microphone AUX feed at the caption
computer and the hosted overlay on the separate OBS computer together. During the
controlled rehearsal, interrupt only the OBS computer's connection, record what the
caption computer continues doing and the actual display recovery time, then test the
caption computer's connection separately. This distinguishes capture/processing failure
from delivery failure. Record observed results; a local preview does not prove either
physical path.

Record only revision/version identifiers, timestamps, sequence counts, status
transitions, bounded usage totals, error codes, and pass/fail results. The
current blockers are unresolved plan evidence, Access setup/usable login, and
the test Groq credential; no full deployed rehearsal has run.
