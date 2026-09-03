# Church Live Caption

Cloud-hosted, near-live transcription and translation for church services, with a
configurable OBS Browser Source overlay and a read-only mobile translation viewer.

Documentation reviewed 23 August 2026.

## Status

The current codebase implements the Phase 1 cloud prototype:

- browser microphone and audio-interface selection with an input meter;
- a selectable 6-, 9-, or 12-second speech buffer that can be revised during a service;
- Groq Whisper transcription and contextual Groq translation;
- biblical and church vocabulary hints plus preferred translations;
- deterministic public-caption word masking;
- live-editable language, terminology, public-filter, buffer, and operator-prompt drafts,
  applied together through an explicit translation-session refresh;
- source and public-caption previews;
- 10–72px caption size, font, colour, per-line highlight, transparency, and
  horizontal or vertical alignment;
- 0–20% horizontal and vertical OBS safe margins;
- shared Main-channel style plus a browser-local fallback preference;
- minimal monochrome operator shell with guided two-column Setup and a compact Live
  layout, using dependency-free React Bits adaptations for navigation and restrained
  visual feedback while keeping appearance controls beside the live-updating preview;
- Start, Pause/Resume, Clear, idle-or-paused synthetic test, confirmed End, and
  confirmed takeover controls;
- a Live AI consumption dashboard for service time, transcription attempts, successful
  translation calls/tokens, and the latest provider-reported quota headroom;
- one reusable, explicitly rotatable OBS URL backed by a Durable Object WebSocket; and
- one replaceable per-service mobile link showing only the latest moderated translation.

The repository retains a deferred iPhone/iPad feasibility experiment under
[`ios/`](ios/README.md). Paid Apple distribution is not part of the current product
plan. The browser/Cloudflare application is the only active client and release path.

Audio and AI inference do not run on the operator's Mac beyond browser capture.
The app does not yet store sermons, generate summaries, support manual correction,
or aggregate usage across services and provider accounts. Those are later phases that require
retention, consent, review, and cost decisions.

PR #18 merged GPT-OSS 20B translation, six-second capture, and the ceiling of 900 reserved
transcription attempts into `main` at `e680576` on 2 August 2026. The 20 July production
smoke test remains useful evidence for the earlier four-second, disposable-room journey
and Access boundaries, but it does not prove the currently merged revision, a real
GPT-OSS response, or the reusable Main-channel lifecycle. Current automated and
local-build evidence supports a controlled stakeholder test; deployed Durable Object,
shared-link, takeover, real-OBS, latency, and language-quality checks remain rollout
gates. See the
[validation report](docs/VALIDATION_REPORT.md) and follow the
[stakeholder test guide](docs/STAKEHOLDER_TEST_GUIDE.md).

The 4 August native experiment remains unsigned, unshipped, and outside current
acceptance. Its evidence is preserved in the [validation report](docs/VALIDATION_REPORT.md)
without implying an active App Store or TestFlight plan.

## High-level architecture

```mermaid
flowchart LR
  Repo["Private GitHub repository<br/>source and pull requests only"] -->|"main push"| Build["Cloudflare Workers Builds<br/>OpenNext build and deploy"]
  Build --> Worker
  Mic["Microphone or audio interface"] --> Browser["Operator browser<br/>MediaRecorder, queue, preview"]
  Access["Cloudflare Access<br/>approved operators"] --> Worker["Cloudflare Worker<br/>Next.js and protected APIs"]
  Browser -->|"6, 9, or 12-second audio chunks over HTTPS"| Worker
  Worker --> Whisper["Groq Whisper<br/>transcription"]
  Whisper --> Translate["Groq GPT-OSS 20B<br/>contextual translation"]
  Translate --> Pipeline["Glossary and moderation<br/>deterministic public form"]
  Pipeline --> Room["Main-channel Durable Object<br/>controller lease and latest public caption"]
  Room -->|"reusable tokenized WebSocket"| OBS["OBS Browser Source<br/>self-contained transparent overlay"]
  Room -->|"per-service tokenized WebSocket"| Viewer["Mobile browser<br/>latest translation only"]
```

GitHub stores and reviews the source code but does not build or deploy it. The repository
intentionally has no GitHub Actions workflow. A push to `main` is consumed by the
connected Cloudflare Workers build, which owns the production OpenNext build and deploy.
The iOS Xcode project is generated and validated separately; neither a Cloudflare build
nor the presence of an `.xcarchive` signs or distributes an Apple app.

Cloudflare Access protects the dashboard, inference APIs, and operator channel APIs.
The OBS and mobile-viewer document/WebSocket paths bypass interactive Access; the Worker
requires a purpose-specific random bearer token before opening either read-only stream.
Tokens stay in URL fragments and are passed as WebSocket subprotocols rather than in page
requests or query strings. The OBS token is reusable and encrypted for approved-operator
recovery. The mobile token and controller credential are separate and service-scoped.

See [Architecture](docs/ARCHITECTURE.md) for trust boundaries and failure behavior,
[Product specification](docs/PRODUCT_SPEC.md) for implemented and deferred scope,
and [Roadmap](docs/ROADMAP.md) for the next phases. Stakeholder testers should start
with the [controlled test guide](docs/STAKEHOLDER_TEST_GUIDE.md).

## Supported languages

Every listed language can be selected as the spoken source or translation target:

- English
- Indonesian
- Japanese
- Korean (`ko-KR`; “South Korean” is not a separate language)
- Tagalog
- Chinese (Simplified)
- Chinese (Traditional)
- Vietnamese

Simplified and Traditional Chinese share the same Chinese speech-recognition code;
the selected script is enforced in translated output. The prototype assumes Mandarin,
not Cantonese. Explicit source selection is recommended for a live service, although
automatic detection is available.

## Biblical terminology

The prototype does not train a custom theological model. It provides a reviewed, bounded
operator prompt that can be edited for local translation style, plus glossary mappings to
preserve biblical names, Bible books, verse references, church names, and preferred
translations. A separate server-owned envelope is immutable: it fixes the requested
language direction and Chinese script, treats caption/context/terms as untrusted data,
forbids invented content, and requires exactly one translated caption. The operator field
cannot edit or remove that envelope, and conflicting custom text is explicitly instructed
to yield to it. This is prompt-layer risk reduction, not a hard security boundary: model
output remains untrusted and requires review. No agent wrapper or tool loop is involved.

This guidance improves consistency but is not theological authority. Important terms
still require church-approved testing and human oversight.

The custom operator prompt is saved to that browser's unencrypted `localStorage` only
when the operator explicitly selects **Save prompt**. Otherwise, edits remain in page
memory. Its active value is sent through the protected translation route to Groq, but is
not stored in the Durable Object or exposed to the mobile viewer or OBS. Do not put
credentials, private pastoral details, or other secrets in it.

## Local development

Local development is for building and testing the web app; deployed inference remains
cloud-hosted. Requirements: Node.js 22.12 or newer and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. This validates the dashboard and Next.js AI routes, but the
custom live-channel routes and internal Durable Object cannot run end to end through the
current OpenNext local preview. Use a protected Cloudflare test deployment for channel
and OBS integration tests. Production must have Cloudflare Access configured; never set
the Worker's local authentication bypass in a deployed environment.

Available checks:

```bash
npm run validate
npm audit --omit=dev
npm audit
npm run preview
```

`npm run validate` runs unit tests, strict TypeScript checks, ESLint, the Next.js and
OpenNext Cloudflare production builds, and `git diff --check`. Both the production-only
and full dependency audits are currently clean after compatible transitive patches; see
the dated [validation report](docs/VALIDATION_REPORT.md).

There is no GitHub Actions fallback. Contributors must run the relevant checks locally
before review; a successful Cloudflare deployment is not a substitute for those checks.

For operator-layout or caption-style changes, use 1920 × 1080 as the primary operator
viewport, then verify a 1200px intermediate viewport and 390px and 320px mobile viewports
in a real browser. Confirm that the preview responds while each appearance control is
adjusted, controls remain reachable, and no viewport has horizontal overflow. Test the
separate `/view` page at the mobile widths too.

The monochrome theme applies only to the operator console. Caption text, highlight,
transparency, and OBS placement remain independently configurable for the stream output.
The React Bits-inspired components are maintained as local, dependency-free adaptations;
their attribution and licence conditions are recorded in
[Third-party notices](THIRD_PARTY_NOTICES.md).

`npm run preview` still verifies the OpenNext/Worker bundle and non-Durable-Object routes.
Wrangler is expected to warn that this internal Durable Object is unavailable locally.

After changing Cloudflare bindings, regenerate their types:

```bash
npm run cf-typegen
```

## Deferred native experiment

Apple distribution was deferred on 10 August 2026 because the current phase must remain
free of paid developer-program requirements. The [`ios/` README](ios/README.md) preserves
the experimental implementation and its safety boundary; it is not part of the active
build, validation, deployment, or stakeholder-test path.

The files may be revisited later. Their local-only commands are:

```bash
npm run ios:generate
npm run ios:build
npm run ios:test
npm run ios:archive:unsigned
```

These commands remain separate from `npm run validate` and are not current release gates.
Do not resume signing, App Store Connect, or TestFlight work without a new owner decision.

## Cloud configuration

Required deployment configuration:

| Name | Type | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | encrypted Worker secret | Server-side Groq authentication |
| `OBS_CHANNEL_ENCRYPTION_KEY` | encrypted Worker secret | Encrypts the recoverable reusable OBS token; minimum 32 random characters |
| `CLOUDFLARE_ACCESS_AUD` | Worker variable | Expected Access application audience |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Worker variable | Access team domain used for JWT verification |
| `GROQ_TRANSCRIPTION_MODEL` | optional Worker variable | Override `whisper-large-v3-turbo` |
| `GROQ_TRANSLATION_MODEL` | optional Worker variable | Override `openai/gpt-oss-20b`; the retired `llama-3.1-8b-instant` value is ignored |

The dashboard's Service details section reads the configured model identifiers from the
same-origin health route. Starting a service separately verifies that those models are
available to the active Groq account.

Never expose either secret through a `NEXT_PUBLIC_` variable, commit it, paste it into
an issue, or include it in screenshots. `wrangler.jsonc` declares the SQLite-backed
`CAPTION_ROOMS` Durable Object and retains dashboard-managed variables during deploy.

## Deployment checklist

1. Keep the Cloudflare account and Worker on the Free plan if zero spend is required.
2. Add `GROQ_API_KEY` with `wrangler secret put GROQ_API_KEY` or the encrypted dashboard
   secret control.
3. Add `OBS_CHANNEL_ENCRYPTION_KEY` with at least 32 random characters before creating
   the Main channel. Do not change it casually; rotate the OBS link if it is lost.
4. Enable Groq Zero Data Retention before any approved real-sermon test.
5. Add the Access audience and team-domain variables.
6. Protect the dashboard, `/api/ai/*`, and `/api/live/channel*` with an approved-operator
   Cloudflare Access policy.
7. Add more-specific Access bypass applications for exactly `/overlay*`,
   `/api/live/overlay*`, `/view*`, and `/api/live/viewer*`. These routes have no AI or
   operator capability; each WebSocket enforces its own purpose-specific token. Do not
   broaden the bypass to `/api/live/channel*`.
8. Confirm the Cloudflare Workers build is connected to this repository and targets
   `main`. Merge the reviewed change and verify that Cloudflare reports a successful
   build and deployment. Owners may use `npm run deploy` only as a deliberate manual
   recovery path.
9. Verify the deployed revision, dashboard Access, provider readiness, Main-channel
   creation/retrieval, idle test/clear, mobile-viewer late join/replacement/expiry,
   End-with-OBS-URL-retention, takeover, and explicit OBS rotation without copying either
   bearer URL into logs or evidence.

## OBS Browser Source

1. Sign in, complete Setup, and select **Create OBS channel** once.
2. Copy the reusable Main channel URL into a 1920 × 1080 OBS Browser Source.
3. Select **Show test** while idle to verify the transparent overlay, style, alignment,
   and safe margins without microphone capture or a Groq request; then clear OBS.
4. Start captions. Pause stops microphone capture and Groq calls while keeping the URL
   and original 90-minute service expiry. Resume clears synthetic text before capture.
5. End the service after confirming. End clears OBS and releases operator control but
   deliberately keeps the same Browser Source URL for the next service.
6. Use **Rotate OBS link** only if the bearer URL was exposed. Rotation immediately
   invalidates the old source and requires replacing its URL in OBS.

Anyone holding the URL can read public captions whenever the Main channel publishes
them. Treat it as a long-lived bearer credential: do not publish, log, or show it in
screenshots. The URL does not expire automatically; each active service still stops at
90 minutes.

## Mobile translation viewer

1. Start captions, open **Mobile translation viewer**, and copy the mobile link.
2. Share it only with intended viewers. It exposes the current moderated target-language
   caption and status, not source text, history, operator controls, or the OBS credential.
3. Use **Replace mobile link** if it was mis-shared. Connected viewers are revoked
   immediately and OBS continues unchanged.
4. End, expiry, or takeover invalidates the link. A new service creates a new one.

## Changing translation settings during a service

Spoken language, target language, terminology, public filters, the 6/9/12-second buffer,
and the operator translation prompt remain editable while a service is live or paused.
Edits are drafts: the active pipeline continues with its current settings until the
operator selects **Refresh translation session** and confirms the reset.

Refresh does not end the service. It preserves the service identity, original timer and
expiry, controller ownership, mobile-viewer link, and reusable OBS link. It discards the
unfinished audio window and queued chunks, clears recent translation context and current
operator/public output, and then applies the draft settings. A server translation revision
rejects late captions produced under the previous settings. If the service was live,
capture continues with the refreshed settings; if it was paused, it stays paused.

The UI's latency value is cloud **processing** time after the selected recording buffer
has completed. Approximate spoken-to-screen time is therefore 6, 9, or 12 seconds plus
the displayed processing time and normal browser/network rendering delay.

## Free-plan guardrails

The app enforces a 90-minute service, one active 6-, 9-, or 12-second speech buffer and
target language per translation revision, a bounded two-chunk queue, a 4,000-character
operator-prompt limit, bounded request sizes, and no automatic
paid-provider fallback. A Groq `429` ends the service rather than purchasing capacity.
Pause, Clear, Resume, and Show test caption use only low-volume Worker/Durable Object
requests. The synthetic test caption does not call Groq.

Before each transcription attempt, the client atomically reserves one of the service's
900 allotted transcription attempts—derived from the fastest six-second option—while
validating its short-lived controller lease in the Main Durable Object. This counter
survives same-tab reloads; a confirmed takeover starts a fresh service with fresh
counters. A successful non-silent chunk can make at most one translation call, so a
service can also make at most 900 translation calls. The extra small Cloudflare request
prevents a replaced operator from continuing Groq usage. Before each actual translation,
a second low-volume Durable Object claim rejects duplicate provider work for the same
reserved attempt. A successful translation is returned to the browser only after its
bounded usage record is acknowledged.

These controls cannot guarantee account-wide free usage: Groq limits apply to the
organization and Cloudflare limits apply to the account, while the consumption dashboard
covers this application's current Main-channel service plus only the most recent Groq
RPD/TPM response-header snapshot. Other applications share those limits, and Groq does
not report remaining daily tokens in those headers. Keep both accounts on their Free
plans and check their provider dashboards before a service.
GPT-OSS 20B currently has a lower daily token allowance than the previous model, so a
content-heavy service can still stop on a provider `429` before all 900 reserved
transcription attempts are used.
Current limits are authoritative in the
[Groq rate-limit documentation](https://console.groq.com/docs/rate-limits) and
[Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
The prototype has no production SLA; exhaustion stops captions.

## Data handling and safeguards

- The app sends short-lived audio chunks to Groq and does not store audio.
- The Main Durable Object keeps constant-size channel configuration: encrypted OBS
  token, token hash, shared style, controller hash while active, sequence, timestamps,
  active-service AI usage totals and the latest sanitized provider-limit snapshot, and at
  most the latest moderated public caption.
- Protected source captions remain in browser memory only during the active service.
- Only the caption-style preference and an explicitly saved custom operator prompt use
  unencrypted browser `localStorage`; ordinary language, terminology, filter, buffer, and
  unsaved-prompt drafts remain in page memory.
- While a service is active, the complete active translation snapshot is kept in that
  tab's unencrypted `sessionStorage` solely for same-tab recovery. It is removed on End,
  takeover, or idle cleanup and is never synchronized to a church account.
- The custom prompt is not placed in the Durable Object, viewer stream, or OBS output;
  the active value is sent only to the protected translation API and Groq.
- The protected AI usage dashboard combines browser-measured elapsed time with
  server-owned active-service transcription attempts and successful translation
  call/token totals. It also shows Groq's latest daily-request and per-minute-token
  response-header snapshot when available. These values reset with the service and are
  not billing or complete account metering.
- Groq ZDR is required for real-sermon testing. Groq still retains non-content usage
  metadata under its published data policy.
- Bible text must not be imported without permission for the chosen translation.
- AI summaries and archives remain disabled until consent, retention, access control,
  deletion, grounding, and human-review behavior are implemented.

Read [SECURITY.md](SECURITY.md) before deployment and
[CONTRIBUTING.md](CONTRIBUTING.md) before changing the project. The native experiment is
documented separately in [`ios/README.md`](ios/README.md) and is currently deferred.

## License

This private repository intentionally has no open-source license. Copyright remains
with the contributors unless the project owners adopt a license in a recorded decision.
