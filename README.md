# Church Live Caption

Real-time AI transcription and translation for church services, designed for a configurable OBS browser overlay.

## Project status

Phase 1 free/local-first technical prototype. The operator app is being scaffolded
around interchangeable AI providers so a later paid-model upgrade does not change
the dashboard or OBS integration.

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
- A local AI companion using `whisper.cpp` with multilingual Whisper for speech
- MADLAD-400-3B-MT for the first local translation evaluation
- Provider interfaces for a later optional OpenAI paid-model upgrade
- Supabase for authentication, settings, sessions, transcripts, and storage
- Vercel for web hosting
- OBS Browser Source for the stream overlay

See [Product specification](docs/PRODUCT_SPEC.md), [Architecture](docs/ARCHITECTURE.md), and [Roadmap](docs/ROADMAP.md).
The model decision and its tradeoffs are recorded in [ADR 0001](docs/decisions/0001-free-local-first-ai.md).

## Run the operator prototype

Requirements: Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The dashboard can test a browser-approved microphone,
configure every Phase 1 language, edit church terms and moderation words, and preview
caption styling. `Start caption session` remains disabled until the separately installed
local AI companion reports that its Whisper and MADLAD models are ready. Model files are
not downloaded by `npm install` and must never be committed.

Useful checks:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## Important safeguards

- API keys must remain server-side and must never be committed.
- Sermon recording and retention must be opt-in and visible to operators.
- AI-generated summaries and biblical references require human review before publication.
- Biblical context is configurable guidance, not a claim of theological authority.
- Bible text and translations may have licensing restrictions; only approved sources may be imported.
- Public filtering and archival retention are separate controls so display moderation does not silently alter the historical transcript.

## Collaboration

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Work should be proposed through short-lived branches and pull requests into main.

This private repository intentionally has no open-source license at this stage.
