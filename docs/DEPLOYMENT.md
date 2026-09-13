# Deployment runbook

Reviewed 13 September 2026. This describes the current repository configuration.
Dated deployment and QA evidence is in [cleanup QA](CLEANUP_DEPLOY_QA.md).

## Connected Cloudflare build

GitHub stores source and PR review. Cloudflare Workers Builds watches `main`; there is
no GitHub Actions workflow. Use these settings for the connected Worker:

| Setting | Value |
| --- | --- |
| Root | `/` |
| Production branch | `main` |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `OPEN_NEXT_DEPLOY=true npx wrangler deploy` |

The equivalent repository command after building is `npm run deploy:worker`.
For an explicitly authorized manual build and deployment, `npm run deploy` runs both.
To validate packaging without uploading:

```sh
npm ci
npm run build:cloudflare
npm run deploy:check
```

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
| `SERMON_JOURNALS` / `SermonJournal` | Per-service reader, opted-in history and summary jobs |
| `AI_USAGE` / `AiUsageLedger` | Numeric provider admissions and rolling usage |
| `AI` | Optional Workers AI inference |
| `ASSETS` | OpenNext static assets |

Keep both SQLite migrations: v1 creates CaptionRoom; v2 adds SermonJournal and
AiUsageLedger. Do not rename/delete established migration tags to repair a build.

Encrypted Worker secrets: `GROQ_API_KEY` and `OBS_CHANNEL_ENCRYPTION_KEY`.
Generate the latter with at least 32 random characters; changing it requires controlled
OBS token recovery/rotation. Never copy its value into logs or plaintext configuration.

Required runtime variables: `CLOUDFLARE_ACCESS_AUD` and
`CLOUDFLARE_ACCESS_TEAM_DOMAIN`. Optional model overrides and the disabled-by-default
`CAPTION_OPTIONAL_AI_ENABLED` switch are documented in [the environment template](../.env.example).
`keep_vars: true` preserves dashboard-managed variables; it does not configure them.
Never deploy `CAPTION_LOCAL_AUTH_BYPASS`.

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

## After a merge

1. Check both build and deploy stages. A successful compilation does not publish a Worker.
2. Record the merged Git SHA, successful build ID and final Worker version. Secret changes
   can create newer versions, so reconcile the final deployment.
3. Verify the three Durable Object bindings, AI binding, v2 migration and runtime variables
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

All three Durable Object bindings, AI and assets were present in the successful upload.
Only the connected deploy command was changed; Access policies and runtime settings were
preserved. No microphone, caption control or provider call was used for this verification.
Deployment success does not establish the full runtime, physical-device or semantic gates.
