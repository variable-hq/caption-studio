# Deployment runbook

Reviewed 4 November 2026 against merged PR #112 (`87b37dd`). This describes the current
repository configuration.
Dated deployment and QA evidence is in [cleanup QA](CLEANUP_DEPLOY_QA.md).

## Connected Cloudflare build

GitHub stores source and PR review. Cloudflare Workers Builds watches `main` only; there
is no GitHub Actions workflow. Use these settings for the connected Worker:

| Setting | Value |
| --- | --- |
| Worker | `caption-studio` (origin `https://caption-studio.lukas-ka.workers.dev`) |
| Root | `/` |
| Production branch | `main` |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `OPEN_NEXT_DEPLOY=true npx wrangler deploy` |
| Settings › Builds › Previews Base: Builds for Preview branches | Off (since 28 October 2026) |

Keep preview-branch builds off. With them on, every PR branch ran `npm run build` and then
`npx wrangler preview` (open beta), which always failed with "Your Wrangler configuration
needs a `previews` block to run this command" and warned that Durable Objects are not
included in previews. This app depends on Durable Objects, Workers AI and Cloudflare Access,
so per-branch previews are unsupported; local validation (`npm run validate`, `npm run qa`)
is the pull-request gate. Re-enable only together with a `previews` configuration that
covers the Durable Objects, AI and Access.

The equivalent repository command after building is `npm run deploy:worker`.
For an explicitly authorized manual build and deployment, `npm run deploy` runs both.
To validate packaging without uploading:

```sh
npm ci
npm run build:cloudflare
npm run deploy:check
```

`wrangler.jsonc`'s `name` must match the connected Worker; a mismatched manual deploy
creates a separate, unprotected Worker. Renaming the Worker also changes its workers.dev
hostname, so every Access application (operator and bypass) must be moved to the new
hostname in the same change. The October 2026 rename from `church-live-caption` left the
new hostname without Access, and every operator API call then failed with
"Authentication is required." On 26 October the Access application was moved to
`caption-studio.lukas-ka.workers.dev`, renamed, and given the missing public bypass paths;
operator sign-in was confirmed afterwards.

Do not substitute a Next.js build alone: `custom-worker.ts` imports the generated
`.open-next/worker.js` and Wrangler uploads `.open-next/assets`.

## Why the deploy command sets OPEN_NEXT_DEPLOY

On 13 September, PR #26's Next.js and OpenNext builds passed, then deployment failed.
Wrangler 4.125.0 detected OpenNext and delegated plain `wrangler deploy` back to
`opennextjs-cloudflare deploy`. OpenNext 1.20.1 called `getPlatformProxy` to collect
environment variables. The new AI binding caused that helper to open a remote preview
session against the Access-protected domain. CI had no Access service credentials.

`OPEN_NEXT_DEPLOY=true` is Wrangler/OpenNext's own recursion guard. Setting it for the
already-built Worker skips delegation and lets Wrangler package and upload directly.
It does not disable Access, remove the AI binding, enable inference, or change runtime
authentication. Wrangler still needs its normal deployment credential in Cloudflare Builds.
[Wrangler delegation source](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/deploy/open-next.ts).

This path is appropriate for the current default `defineCloudflareConfig()`: the app
does not configure an incremental/tag cache, cache preload, or skew-protection deployment
mapping. Revisit it if any of those are added; their initialization belongs in the
deployment path. Recheck the dry run when upgrading Wrangler or OpenNext because this
guard is an integration detail, not an application setting.
[OpenNext cache configuration](https://opennext.js.org/cloudflare/caching).

The workaround concerns deployment only. OpenNext preview still needs a remote AI proxy.
For provider-free local Durable Object QA, use the temporary configuration in
[Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md#runtime-rehearsal).
Setting `ai.remote: false` is not a supported local AI simulator.
[Cloudflare local bindings](https://developers.cloudflare.com/workers/local-development/).

## Runtime configuration

Preserve `custom-worker.ts` as the entry point and all bindings in `wrangler.jsonc`:

| Binding | Purpose |
| --- | --- |
| `CAPTION_ROOMS` / `CaptionRoom` | Main channel, controller, inference claims and remote commands |
| `TRANSCRIPT_JOURNALS` / `TranscriptJournal` | Per-session reader, opted-in history and summary jobs |
| `AI_USAGE` / `AiUsageLedger` | Numeric provider admissions and rolling usage |
| `OPERATOR_PREFERENCES` / `OperatorPreferences` | Shared church setup (one workspace record) and each operator's theme, keyed by hashed Access email |
| `AI` | Optional Workers AI inference |
| `ASSETS` | OpenNext static assets |

`observability.enabled` is also set, so Worker logs are retained by Cloudflare; keep
captions, tokens and links out of `console` output.

Keep all four SQLite migrations: v1 creates CaptionRoom; v2 adds SermonJournal and
AiUsageLedger; v3 adds OperatorPreferences; v4 renames SermonJournal to TranscriptJournal
(`renamed_classes`). Do not rename/delete established migration tags to repair a build.

The v4 rename is one-way. Workers Builds deploys `main` on merge, so the merge is the deploy:
merge it only after the build with session names (PR #100) has finished deploying and with no
live session running. Once v4 is applied, a build from before it cannot
bind `TRANSCRIPT_JOURNALS` / `TranscriptJournal`, so rolling back to an earlier build is not
supported. After the deploy, check that the Worker's Durable Object bindings include
`TRANSCRIPT_JOURNALS` / `TranscriptJournal` and that the v4 migration is applied, then open a
reader link saved before the deploy and check that it and its summary still load.

Encrypted Worker secrets: `GROQ_API_KEY` and `OBS_CHANNEL_ENCRYPTION_KEY`.
Generate the latter with at least 32 random characters; changing it requires controlled
OBS token recovery/rotation. Never copy its value into logs or plaintext configuration.

Required runtime variables: `CLOUDFLARE_ACCESS_AUD` and
`CLOUDFLARE_ACCESS_TEAM_DOMAIN`. Optional model overrides and the disabled-by-default
`CAPTION_OPTIONAL_AI_ENABLED` switch are documented in [the environment template](../.env.example).
`keep_vars: true` preserves dashboard-managed variables; it does not configure them.
Manual and automatic summaries ([ADR 0019](decisions/0019-automatic-post-service-summary.md))
both need `CAPTION_OPTIONAL_AI_ENABLED=true`; without it, End queues nothing.
Never deploy `CAPTION_LOCAL_AUTH_BYPASS`.

`WORKSPACE_PLAN` sets the workspace's plan limits (`src/experience/entitlements.ts`). Unset, or any
value the table does not list, allows 5 custom presets; `free` allows none. Built-in formats are never
limited. Set it in the Worker's variables (dashboard or a deploy-time variable), not in the setup
record, which every signed-in operator can edit. A lowered limit never deletes a preset; it only
blocks creating new ones.

## Access paths

Keep `/`, `/operator/mobile`, `/api/ai/*`, `/api/live/channel*`, and
`/api/live/experience/*` operator-protected. Application handlers also validate Access
JWTs for protected operations; the remote additionally requires its paired credential.

Public documents/data need narrowly scoped bypasses:

- `/overlay` and `/api/live/overlay*`: reusable OBS token.
- `/view` and `/api/live/viewer*`: separate latest-viewer token.
- `/read` and `/api/live/reader`: separate service reader token.
- `/_next/static/*`: public JavaScript/CSS needed by the Next.js reader page.

Existing `/overlay*` and `/view*` applications may cover their respective documents.
Never broaden a bypass to `/api/live/*`, `/api/ai/*`, or `/operator/*`.
A document/static bundle carries no operator or provider credential; its data endpoint
must still reject absent, wrong-purpose, expired or replaced tokens.

## Session names and pages loaded before a deploy

There is no skew protection, so a page or a paired phone opened before a deploy keeps
its earlier names. The server therefore accepts both name sets until they are removed,
which is not planned:

- Request bodies accept `sessionId` and fall back to `serviceId`.
- The channel start/end route, the transcript routes and the internal start/end route
  accept both spellings and reach the same handlers.
- Responses carry `sessionId` and `serviceId` (and `sessions` and `services` in the
  history list). Error responses keep `code` (`service_paused`, `service_inactive`) and
  add `sessionCode` (`session_paused`, `session_inactive`). The current client reads
  `sessionCode` and falls back to `code`.
- The ended headers carry `x-ended-session` and `x-ended-service`.
- A WebSocket connection offers either subprotocol set and the server echoes the one offered.
- Stored configurations and usage records written before this change are read through the
  normalizing helpers; the next normal write stores the new names.

A session's format (`preset` on the stored configuration and on the journal state) is an
optional field. Records written before it existed have none and read as General, so the
deploy needs no migration, and rolling back leaves the field unread.

A build from before this change reads only the old names, so it cannot see a session or
usage record written under the new names. Roll back only before the first session starts
after the deploy, and deploy when no live session is running.

## After a merge

1. Check both build and deploy stages. A successful compilation does not publish a Worker.
2. Record the merged Git SHA, successful build ID and final Worker version. Secret changes
   can create newer versions, so reconcile the final deployment.
3. Verify the four Durable Object bindings, AI binding, v4 migration and runtime variables
   without revealing secret values. Keep optional AI off until its account/privacy/quality gates pass.
4. Check authenticated operator and unauthenticated reader boundaries, then run the
   [stakeholder rehearsal](STAKEHOLDER_TEST_GUIDE.md) with synthetic or approved data.
5. Check retention, phone acknowledgement, Clear/End/replacement, and usage before real use.

The original PR #26 build `41f0f3b4-1bd0-41fe-999a-14b5eb9b5483` failed at deploy.
The connected deploy setting was corrected and the merged build retried. Build
`89991f51-3a53-4d1e-a96f-4faad55de6aa` completed successfully at 08:05 UTC on
13 September, for Git `20597d8840f6ae5a88414ef124c85579118c4774`. Cloudflare's deployments
API verified Worker version `fd21393f-be16-4a63-a2ff-8933b2641474` serving 100% of traffic.
The previous version was `8112a330-6986-480c-be82-88bcd5d73477`.

| Merge | Content | Recorded deployment |
| --- | --- | --- |
| `20597d8` (#26) | Plan 1 | Build `89991f51…`, Worker `fd21393f…`, verified |
| `5a7a115` (#28) | Deploy guard and documentation cleanup | Not recorded |
| `26cc8e1` (#30) | Dashboard navigation | Not recorded |
| `cf8b8c0` (#32) | Collapsible service panel | Not recorded |
| `abae57b` (#33) | Export hygiene | Not recorded |
| #35–#74 | Settings, shared setup, Live/Transcripts/Settings dashboard, `caption-studio` rename | Individual builds not recorded |
| `080e6ca` (#75) | Live equal-height cards | Workers Builds check success; production deployment 2026-10-28T18:27Z |

`wrangler deployments list --name caption-studio` shows production deployments of the
renamed Worker at 2026-10-26T16:18Z, 2026-10-27T15:47Z, 2026-10-28T16:49Z and
2026-10-28T18:27Z, all from Workers Builds on `main`; the last is `080e6ca`. Build IDs and
Worker version IDs were not recorded, and earlier merges on the old Worker name were never
checked. Complete step 2 above for the latest merge before the next rehearsal.

All three Durable Object bindings then configured, AI and assets were present in the
successful #26 upload.
Only the connected deploy command was changed; Access policies and runtime settings were
preserved. No microphone, caption control or provider call was used for this verification.
Deployment success does not establish the full runtime, physical-device or semantic gates.
