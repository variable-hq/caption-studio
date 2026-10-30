# ADR 0029: conservative transcription prompt budget

Date: 30 October 2026. Status: accepted, implemented in source.

## Decision

Groq documents a maximum of 224 tokens for the speech-to-text `prompt` parameter and
describes it as context for style and unfamiliar-word spelling
([Speech to Text](https://console.groq.com/docs/speech-to-text)). Caption Studio does not
add a tokenizer dependency. It uses a conservative 448 UTF-8-byte budget as a proxy for
about half that token limit in Latin-script text, while preserving up to 160 bytes of the
previous transcript's whole-word tail. Each hint is added whole or skipped.

If Groq rejects a transcription request with HTTP 400, retry once with the previous
224-byte total and 96-byte context budgets. A successful fallback selects those legacy
budgets for later transcriptions in that Worker isolate. This is best effort because Worker
isolates are stateless and do not share that choice. The fallback reuses the already-metered
logical attempt.

## Tradeoffs and verification

- A byte proxy avoids tokenizer dependencies and counts multi-byte spellings correctly, but
  bytes are not tokens and the ratio varies by language. The reduced budget and one-time
  fallback limit the impact if Groq's validation behavior differs from its documentation.
- The first 400 response produces no operator error when the legacy-budget retry succeeds.
  If the retry also fails, the existing generic provider error is surfaced without provider
  response details.
- Synthetic tests cover single-byte and multi-byte prompt bounds, whole-hint skipping,
  previous-transcript context, retry count, legacy fallback, isolate-local fallback memory,
  and a single metered dispatch for the retry.
- Manual synthetic-speech checks with a longer Words list and a deliberately oversized
  prompt remain a release rehearsal.
