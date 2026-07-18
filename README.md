# Church Live Caption

Real-time AI transcription and translation for church services, designed for a configurable OBS browser overlay.

## Project status

Phase 1 free-cloud technical prototype. The web app, secure API routes, and AI
inference are designed to run outside the operator's computer. Interchangeable
provider contracts keep a later paid-model upgrade from changing the dashboard or
OBS integration.

## Intended user journey

1. An operator opens the web app and starts a service session.
2. The operator selects a microphone or audio-interface input.
3. The app transcribes speech in the chosen source language.
4. The app translates captions into the chosen target language.
5. Church-specific names, biblical terms, and configured keywords improve recognition and translation.
6. A configurable moderation filter masks selected words in the public captions.
7. The operator adjusts font size, text color, background, line count, and placement.
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
- Transparent, low-latency OBS browser overlay
- Optional sermon transcript archive and AI-assisted summary
- Human review controls for captions, summaries, and biblical references

## Proposed stack

- Next.js and TypeScript
- Browser audio capture
- Cloudflare Workers free plan for the Next.js app and server-side provider proxy
- GroqCloud free plan with `whisper-large-v3-turbo` for multilingual speech
- GroqCloud `llama-3.1-8b-instant` for contextual translation
- Provider interfaces for later paid or realtime upgrades
- Supabase for authentication, settings, sessions, transcripts, and storage
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
web app; deployed AI inference runs in GroqCloud. The dashboard can test a
browser-approved microphone, configure every Phase 1 language, edit church terms and
moderation words, and preview caption styling. `Start caption session` remains disabled
until the server-side `GROQ_API_KEY` secret is configured.

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
7. Use `npm run deploy`, or configure Workers Builds to run the same deployment command.

Cloudflare's Zero Trust onboarding currently asks for payment details even on the
free plan; its documentation states that the free selection is not charged.

The free plans are suitable for a controlled prototype, not guaranteed unlimited
production service. The current Groq free plan publishes 20 speech requests per minute,
2,000 per day, and 28,800 audio seconds per day. Four-second chunks use 15 requests per
minute and about 1,350 requests for a 90-minute service. The app must stop cleanly or
continue source captions when any quota is reached. Cloudflare currently includes
100,000 Worker requests per day. Provider limits can change, so verify them before a
live service.

## Important safeguards

- API keys must remain server-side and must never be committed.
- Cloudflare Access must protect the Worker so anonymous users cannot exhaust AI quota.
- Raw audio is processed in short-lived requests and is not stored by this app.
- Groq Zero Data Retention must be enabled before approved real-sermon testing.
- Sermon recording and retention must be opt-in and visible to operators.
- AI-generated summaries and biblical references require human review before publication.
- Biblical context is configurable guidance, not a claim of theological authority.
- Bible text and translations may have licensing restrictions; only approved sources may be imported.
- Public filtering and archival retention are separate controls so display moderation does not silently alter the historical transcript.

## Collaboration

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Work should be proposed through short-lived branches and pull requests into main.

This private repository intentionally has no open-source license at this stage.
