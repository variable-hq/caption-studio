# Church Live Caption

Real-time AI transcription and translation for church services, designed for a configurable OBS browser overlay.

## Project status

Planning and collaboration foundation. The application has not been scaffolded yet.

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

## MVP scope

- Operator dashboard for audio input, languages, glossary, filtering, and display controls
- Live transcription for Indonesian, English, and Chinese, subject to final language decisions
- Translation into one selected target language per session
- Church glossary and keyword boosting
- Configurable public-caption word filtering
- Transparent, low-latency OBS browser overlay
- Optional sermon transcript archive and AI-assisted summary
- Human review controls for captions, summaries, and biblical references

## Proposed stack

- Next.js and TypeScript
- Browser audio capture
- OpenAI speech and language APIs, with exact models selected during implementation
- Supabase for authentication, settings, sessions, transcripts, and storage
- Vercel for web hosting
- OBS Browser Source for the stream overlay

See [Product specification](docs/PRODUCT_SPEC.md), [Architecture](docs/ARCHITECTURE.md), and [Roadmap](docs/ROADMAP.md).

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
