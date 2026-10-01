# ADR 0018: Inference Level as a server envelope parameter

Date: 1 October 2026. Status: accepted, implemented in source.

## Decision

The Inference Level setting (Low / Balanced / High) controls how aggressively the
translation model may infer meaning, rephrase, and correct transcription errors versus
sticking close to word-for-word. It is implemented as a fourth parameter to the
immutable server envelope (`buildTranslationEnvelopeRules`), not as content in the
operator-editable system prompt.

Low/Balanced/High are policy about *how literally to translate* — the same category of
thing the envelope already owns (the bracket/unclear-word rule, the profanity rule, the
output contract) — not operator context about a specific service's content, which is
what the editable prompt is for. Folding level-specific text into the editable guidance
slot instead would make an operator's custom prompt implicitly mean different things
depending on which level is selected, and would let an operator's guidance accidentally
conflict with or obscure the level's behavior. Keeping it in the envelope means the
level's behavior is the same regardless of what the operator has written, and the
operator's guidance composes on top of it exactly as it already composes on top of
every other envelope rule.

`buildTranslationEnvelopeRules` takes `inferenceLevel: InferenceLevel`
(`src/ai/contracts.ts`: `INFERENCE_LEVEL_OPTIONS`, `DEFAULT_INFERENCE_LEVEL` =
`"balanced"`, `normalizeInferenceLevel`) and appends one level-specific rule near the
end of the envelope. The setting flows through the same path as every other
translation-quality setting: `TranslationSessionSettings`
(`src/live/translation-settings.ts`) → the live session's translate request
(`use-live-caption-session.ts`) → `TranslationRequest` → `buildTranslationMessages`
(`src/ai/server/groq.ts`). It participates in the Review refresh → Confirm refresh
cycle like language, terminology, filter, recording window, and system prompt do,
since — unlike caption style or the output buffer — it changes what is sent to the
model. It also joins `OperatorPreferences.translationDefaults` as a saved account
default, the same "discrete-choice-controls" treatment (`docs/PRODUCT_SPEC.md`) already
given to recording window, languages, and caption style.

### Biblical-content safety boundary

The envelope now recognizes when a passage is being read or paraphrased as scripture,
so that recognition can be used to translate the words the speaker actually said more
naturally and coherently. This is never permission to retrieve, insert, or complete
scripture text from memory — that would conflict with the envelope's existing rule
("Never invent, complete, retrieve, or hallucinate content, Bible verses, doctrine...")
and with `docs/GAP_ANALYSIS.md` (G03), which requires no unresolved invented scripture
before a pilot. The new behavior is encoded as a clarifying clause appended to the
existing never-invent rule, not as a standalone permission that could be read in
isolation.

## Tradeoffs and verification

- `buildInferenceLevelRule` (`src/ai/translation-prompt.ts`) is a simple switch over the
  three levels, defaulting to `balanced` for any unrecognized value — the same
  fail-safe pattern `normalizeInferenceLevel` uses, so an invalid or missing level never
  reaches the model as an unhandled case.
- Two base-prompt rules apply at every inference level, not gated behind the parameter:
  a two-step resolve-before-bracketing rule for unclear words, and recognition of the
  speaker's tone/register (informative, conversational, biblical, formal, illustrative).
- `src/ai/server/groq.test.ts` asserts the envelope text differs by level (including the
  invalid-value fallback), and that the scripture-recognition and tone-recognition
  clauses are present regardless of level.
- Translation-quality impact (does Balanced still read naturally, does Low actually feel
  faster/more literal, does High's bolder rephrasing stay within guardrails) cannot be
  verified by unit tests and is pending a live/sample review, the same gate
  `docs/GAP_ANALYSIS.md` G03 calls for before a quality-affecting prompt change ships.
