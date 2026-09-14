# Plan 1 validation

13 September 2026. Synthetic fixtures only; no real sermon, provider call, or production
deployment is part of this evidence. Tested branch head: `ce49bd4` (merged in PR #26
as `20597d8`). Related issue: #25. The later successful Cloudflare retry is recorded
separately in [Deployment](DEPLOYMENT.md) and [cleanup QA](CLEANUP_DEPLOY_QA.md).

## Automated checks

- 217 tests pass across 19 files, with Vitest restricted to one worker.
- Strict unused-local/parameter TypeScript checks and ESLint pass.
- Next.js and OpenNext Cloudflare production builds pass.
- Production-only and full npm audits both report zero vulnerabilities.
- Wrangler binding types regenerated and reviewed; diff whitespace check passes.

Recovery coverage includes Clear races, old epochs, remote pause and host acknowledgement,
controller replacement, interrupted reader fallback, two-stage summaries, deletion during
inference, original-source preservation, exclusion, independent archive pagination,
failed Start release, usage admission/deduplication, unknown outcomes, conservative daily
budgets, seven-day content expiry, and independent 30-day usage expiry.

## Browser review

Applied the repository's `web-design-guidelines` skill to the operator, reader, remote,
archive, usage and latest-caption viewer. All browser API responses are synthetic, with
external traffic blocked. Chromium runs alone; browser tooling is installed outside the
repository.

| Script | Coverage | Result |
| --- | --- | --- |
| `scripts/operator-ui-qa.mjs` | Setup sections, appearance preview, private OBS link, focus, Start/Pause/Clear/End, draft isolation | Pass at 1920, 1200, 390 and 320 pixels |
| `scripts/tutorial-qa.mjs` | Tutorial navigation, keyboard controls and responsive layouts | Pass at all four widths |
| `scripts/experience-ui-qa.mjs` | Latest viewer, appending reader, pause preservation, removals, expiry, remote acknowledgements, corrections, evidence links, review-gated export, confirmation focus, usage capacity | Pass at all four widths |

No horizontal overflow, browser exceptions, or Axe WCAG 2 A/AA, 2.1 AA or 2.2 AA findings
in the passing runs. Screenshots use synthetic content:

- [Operator archive, 1920px](review-assets/live-session-plan-1/archive-1920.png)
- [Reader, 390px](review-assets/live-session-plan-1/reader-390.png)
- [Operator remote, 390px](review-assets/live-session-plan-1/remote-390.png)

Guideline findings resolved:

- `src/app/globals.css:346` — shared page/card/control spacing, narrow layouts, focus,
  safe areas and long-record rendering.
- `src/components/operator/ServiceExperiencePanel.tsx:1` — native confirmation dialog,
  labelled fields, independent paging, source focus, reviewed export and retry IDs.
- `src/components/operator/TranslationSettingsEditor.tsx:1` — form metadata and explicit
  language-scoped vocabulary action.
- `src/live/viewer-document.ts:1` — shared typography, palette and control radii.

Automated accessibility checks do not establish screen-reader or physical-device
compatibility. Review with Safari and the actual capture computer and phone before use.

## Runtime rehearsal

The standard OpenNext preview attempts a remote connection for the Workers AI binding
and requires Wrangler credentials. Local runtime checks therefore use a temporary
configuration with AI omitted, optional inference disabled, synthetic encryption key,
local-only Access bypass, and isolated persistence under `/private/tmp`.

The production bundle serves `/read`, `/operator/mobile` and `/view` locally with
`no-store`, `no-referrer`, and microphone-denying permissions headers. The custom Worker
exports allow local execution of the Main room, sermon journals and usage ledger.
`scripts/experience-runtime-qa.mjs` passes against the actual local Durable Objects:
remote Pause blocks leases before host ACK, Clear rejects stale publication, an alarm
commits the reader fallback, committed paragraphs survive Clear, End revokes remote
access while preserving reader grace, and removal/deletion remove public content and
the archive index. The usage ledger remains empty: zero provider calls. Local alarm
scheduling was variable, so the harness allows 90 seconds; this is not a measured
production latency guarantee.

To reproduce the isolated runtime check after `npm run build:cloudflare`:

```bash
python3 - <<'PYCONFIG'
import json
from pathlib import Path
root = Path.cwd()
config = json.loads((root / "wrangler.jsonc").read_text())
config.pop("ai", None)
config["name"] = "caption-plan-1-local-qa"
config["main"] = str(root / "custom-worker.ts")
config["assets"]["directory"] = str(root / ".open-next/assets")
config["vars"] = {
    "CAPTION_LOCAL_AUTH_BYPASS": "true",
    "OBS_CHANNEL_ENCRYPTION_KEY": "synthetic-local-qa-key-0000000000000000000000",
    "CAPTION_OPTIONAL_AI_ENABLED": "false",
}
Path("/tmp/caption-plan-1-local.json").write_text(json.dumps(config))
PYCONFIG
npx wrangler dev --config /tmp/caption-plan-1-local.json --local --port 8787 \
  --persist-to /tmp/caption-plan-1-preview-state
# In a second terminal, against only that isolated server. CAPTION_QA_ORIGIN
# defaults to http://127.0.0.1:8787; set it if the port differs.
npm run qa:runtime
```

The local bypass is never added to production configuration. No account settings, model
calls, preview deployment, or paid resources are created for these checks.

## Release gates and practical limits

- Deploy the v2 migration and verify narrow Access bypasses for the new reader and its
  public assets. Keep all experience APIs and operator pages protected.
- Verify the account Free plan and content settings before enabling optional Workers AI.
  Reader fallback works while this switch is off; summaries visibly fail as unavailable.
- Rehearse cloud alarms, network loss, real microphone acknowledgement, controller
  replacement, expiry and deletion in a protected deployment.
- Evaluate church-approved Indonesian speech, Saul/name ambiguity, chunk boundaries,
  grounding and prompt-injection cases. No real audio/model quality claims are made here.
- Exact TB2 verse text is not imported. Long summaries can stop at context/call/budget
  limits; drafts require human review. Usage capacity is an estimate under stated
  provider limits, not an account-wide billing allowance.
