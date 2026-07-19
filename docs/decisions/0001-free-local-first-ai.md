# ADR 0001: free/local-first AI providers

- Status: superseded by ADR 0002
- Date: 2026-07-19

## Context

The project needs multilingual live captions without committing the church to API
spend before real sermon recordings establish quality and latency requirements.
The design must still permit a paid upgrade without rebuilding the operator or OBS
experiences.

## Decision

Phase 1A uses a local AI companion on the operator computer:

- multilingual Whisper `small` through `whisper.cpp` for transcription;
- MADLAD-400-3B-MT for the first translation evaluation;
- one selected translation target per live session;
- explicit source-language selection or automatic detection;
- deterministic glossary enforcement and public-display moderation;
- provider-neutral application contracts from the first implementation.

The prototype accepts English, Indonesian, Japanese, Korean, Tagalog, Chinese, and
Vietnamese speech. Chinese output can be Simplified or Traditional. Phase 1 treats
Chinese speech as Mandarin; Cantonese is not implied by the script choice.

Phase 1B may introduce paid adapters after the team compares quality, latency,
reliability, hardware use, and hourly cost with the local baseline. Local Whisper
remains a desirable offline fallback.

## Consequences

- There are no transcription or translation API charges in Phase 1A, but the church
  supplies compute, electricity, disk, and model-download bandwidth.
- The local translation model may be too slow or inconsistent on some computers.
  It must be benchmarked on the actual operator machine and church audio.
- Biblical language is governed by approved glossary data and human review. The
  model is not fine-tuned on private sermons and is not a theological authority.
- The first hosted release needs a secure browser-to-local-companion connection;
  a cloud server cannot call the operator's localhost.
- Model files are downloaded separately and are never committed to Git.

## Upgrade boundary

The superseded design anticipated transcription, translation, and later summary
provider contracts. The current cloud implementation retains transcription and
translation interfaces only; a summary contract will be designed with the future
archive, consent, and review workflow rather than kept as unused code.

## Supersession

The project owner later confirmed that AI inference must run outside the operator's
Mac. [ADR 0002](0002-free-cloud-first-ai.md) replaces this decision. The local
companion is not part of the current implementation plan.
