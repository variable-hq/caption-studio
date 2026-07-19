# Church Live Caption

Real-time AI transcription and translation for church services, designed for a configurable OBS browser overlay.

## Project status

Phase 1 free-cloud live-caption prototype. The operator dashboard records four-second
browser audio chunks, sends them to protected cloud inference, and publishes only the
moderated public caption to a tokenized OBS overlay. AI inference and live caption
coordination run outside the operator's computer.

## Intended user journey

1. An operator opens the web app and starts a service session.
2. The operator selects a microphone or audio-interface input.
3. The app transcribes speech in the chosen source language.
4. The app translates captions into the chosen target language.
5. Church-specific names, biblical terms, and configured keywords improve recognition and translation.
6. A configurable moderation filter masks selected words in the public captions.
7. The operator adjusts 10–72px font size, font family, text color, background
   transparency, and horizontal or vertical placement.
8. OBS loads a read-only browser-source URL and displays the live captions.
9. If recording is enabled, the sermon transcript is stored and can produce a reviewable summary with biblical context.

## Confirmed Phase 1 languages

- English
- Indonesian
- Japanese
- Korean (`ko-KR`; "South Korean" is not a separate language)
- Tagalog
- Chinese with Simplified or Traditional transcript output
- Vietnamese

Every language can be selected as the spoken audio input or translation target.
For Chinese speech, script is an output preference rather than a different acoustic
language. Phase 1 assumes Mandarin; Cantonese requires a separate future decision.

## MVP scope

- Operator dashboard for audio input, languages, glossary, filtering, and display controls
- Live transcription for every confirmed Phase 1 source language
- Translation into one selected target language per session
- Church glossary and keyword boosting
- Configurable public-caption word filtering
- Transparent, reconnecting OBS browser overlay with a revocable session token
- Optional sermon transcript archive and AI-assisted summary
- Human review controls for captions, summaries, and biblical references

## Proposed stack

- Next.js and TypeScript
- Browser audio capture
- Cloudflare Workers free plan for the Next.js app and server-side provider proxy
- GroqCloud free plan with `whisper-large-v3-turbo` for multilingual speech
- GroqCloud `llama-3.1-8b-instant` for contextual translation
- Provider interfaces for later paid or realtime upgrades
- Cloudflare Durable Objects with hibernating WebSockets for ephemeral live delivery
- Supabase is deferred until approved transcript retention and summaries are built
- OBS Browser Source for the stream overlay

See [Product specification](docs/PRODUCT_SPEC.md), [Architecture](docs/ARCHITECTURE.md), and [Roadmap](docs/ROADMAP.md).
The current cloud decision and its tradeoffs are recorded in
[ADR 0002](docs/decisions/0002-free-cloud-first-ai.md). It supersedes the earlier
local-machine proposal in [ADR 0001](docs/decisions/0001-free-local-first-ai.md).

## Develop the operator prototype

Requirements: Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Local development is only for building and testing the
web app; deployed AI inference runs in GroqCloud. Generate Cloudflare binding types
after changing `wrangler.jsonc`:

```bash
npm run cf-typegen
```

The live session button performs an authenticated Groq model check before requesting
microphone permission. A session stops after 90 minutes, on quota exhaustion, or when
the operator ends it.

Useful checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Free cloud deployment

1. Create a free GroqCloud project and API key.
2. Enable Zero Data Retention in GroqCloud Data Controls before using real sermon audio.
3. Create a Cloudflare Workers project connected to this GitHub repository.
4. Enable Cloudflare Access for the Worker and allow only approved operator emails.
5. Add `GROQ_API_KEY` as an encrypted Worker secret, never as a public environment variable.
6. Add the Access `AUD` and team-domain values as `CLOUDFLARE_ACCESS_AUD` and
   `CLOUDFLARE_ACCESS_TEAM_DOMAIN` deployment variables.
7. Keep the operator app and inference routes protected by the approved-email Access policy.
8. Add more-specific Access bypass applications for `/overlay*` and
   `/api/live/overlay*`. These paths expose no inference capability and validate the
   session token inside the Worker; without the bypass, OBS cannot perform interactive login.
9. Use `npm run deploy`, or configure Workers Builds to run the same deployment command.

The first Durable Object deployment creates the SQLite-backed `CaptionRoom` namespace
through the migration in `wrangler.jsonc`. Live rooms store only the latest public
caption and expire automatically. They do not store audio or protected source text.

## OBS browser source

1. Start a caption session in the protected operator dashboard.
2. Copy the generated OBS browser-source URL. The bearer token is in the URL fragment,
   so it is not sent in normal page requests.
3. Add an OBS Browser Source at 1920 × 1080 and paste the URL.
4. End the operator session to revoke the link immediately.

Anyone holding an active overlay URL can view its public captions. Do not post or reuse
the URL; create a new session for every service.

Cloudflare's Zero Trust onboarding currently asks for payment details even on the
free plan; its documentation states that the free selection is not charged.

The free plans are suitable for a controlled prototype, not guaranteed unlimited
production service. The current Groq free plan publishes 20 speech requests per minute,
2,000 per day, and 28,800 audio seconds per day. Four-second chunks use 15 requests per
minute and at most about 1,350 requests for the enforced 90-minute session. Cloudflare
currently includes 100,000 Worker and Durable Object requests per day; outgoing overlay
WebSocket messages are not billed as requests. The app has no paid fallback. Provider
limits can change, so verify them before a live service.

## Important safeguards

- API keys must remain server-side and must never be committed.
- Cloudflare Access must protect the Worker so anonymous users cannot exhaust AI quota.
- Raw audio is processed in short-lived requests and is not stored by this app.
- Groq Zero Data Retention must be enabled before approved real-sermon testing.
- An OBS token grants read-only access to one ephemeral public-caption room and expires
  after at most 90 minutes.
- Sermon recording and retention must be opt-in and visible to operators.
- AI-generated summaries and biblical references require human review before publication.
- Biblical context is configurable guidance, not a claim of theological authority.
- Bible text and translations may have licensing restrictions; only approved sources may be imported.
- Public filtering and archival retention are separate controls so display moderation does not silently alter the historical transcript.

## Collaboration

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Work should be proposed through short-lived branches and pull requests into main.

This private repository intentionally has no open-source license at this stage.
