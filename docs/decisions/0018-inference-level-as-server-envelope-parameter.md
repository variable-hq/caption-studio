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

### Final disposition of an indecipherable word is level-dependent

The universal unclear-word rule corrects likely transcription errors and brackets a
partial guess (e.g. `[name]`) where one is possible. For a word with no guess at all
possible, it hands the final disposition to the active inference level's own rule
rather than fixing one outcome for every level. Low, Balanced, and High may each omit
that single word, keeping the rest of the sentence natural and complete, instead of
always falling back to a visible marker. Every level still marks the word as
`OMITTED_CONTENT_MARKER` (`[...]`, `src/ai/translation-prompt.ts`) in the one case where
omitting would leave nothing at all: when the indecipherable word is the entire caption.
This keeps the rule useful (word-level omission reads more naturally than a sentence
stitched around a visible marker) without ever producing an empty completion. The same
marker is reused for profanity/slurs, so the model has one consistent way to signal
"intentionally not shown" instead of a different convention per case.

A whole *line* that stays highly ambiguous even after High's bolder inference is a
different case: `translateWithGroq` (`src/ai/server/groq.ts`) has no way to represent an
intentional "too ambiguous to caption" result — an empty completion is classified
`incomplete` and skipped with the same operator-facing failure message as a real error.
High therefore renders the clearest partial caption from what was actually said in that
case, matching the operator prompt's existing muddled-speech convention, rather than
asking for a response the pipeline would only ever read as a failure. Omitting the line
outright would need a way for the pipeline to tell that apart from a real failure, which
doesn't exist yet.

## Amendment — ordered resolution for unclear and sound words

Date: 27 October 2026.

The original unclear-word instruction paired a partial-guess example (`[name]`) with a
prohibition on leaving unclear words verbatim, without defining what the brackets contain.
That let a source-language sound word or expressive spelling such as `berkok-kok` be
repeated inside brackets. Replace that conflicting instruction with one ordered cascade:
normalize stretched, hyphenated, repeated-for-effect, mispronounced, or likely
mistranscribed real words and translate them; render sound words and imitations naturally
in the target language or as a short description; bracket only a target-language partial
guess or category placeholder; and only then hand a word with no guess to the active
Inference Level. Brackets never contain untranslated source-language words.

The existing rule against verbatim unclear words (including inside quotations), the
scripture/lyrics non-invention rule, the explicit-foreign-term exception, and all three
Inference Level omission rules remain in force. Constructed-prompt regression tests now
cover the ordered cases and bracket meaning. No real-model evaluation was run for this
amendment; the G03 synthetic review remains required before release.

## Amendment — Sanitization as a separate envelope setting

Date: 27 October 2026.

Inference owns meaning: intent, ambiguity and unclear words. Sanitization owns cleanup
that removes no-meaning speech: filler sounds and words, explicit self-corrections (keep
only their final version), and transcription gibberish. Gibberish is removed only by the
deterministic transcription guard, never by a model rule. Sanitization is a separate
immutable envelope parameter, default Off, saved with shared translation defaults and
applied through the same translation refresh confirmation as Inference. A pre-change live
snapshot without `sanitizeLevel` normalizes to Off; the storage version stays unchanged.

The deterministic guard consumes Groq `verbose_json` segment metrics. It drops a segment
when `no_speech_prob` and `avg_logprob` both cross the selected thresholds, or when
`compression_ratio` crosses its threshold. Off bypasses the guard. Initial thresholds are:
Low `0.8 / -1.2 / 3.0`, Balanced `0.6 / -1.0 / 2.4`, High `0.5 / -0.8 / 2.4` (no-speech,
average log probability, compression ratio). Do not lower compression below 2.4; it targets
machine loops and lower values risk deliberate repetition. High has greater false-drop risk
for quiet or whispered speech, including prayer. The live service shows only a numeric count
of filtered segments; dropped text is not logged or saved. An all-dropped window creates no
source caption and makes no translation request. If source and target languages match, the
guard still applies while translation is skipped.

Low's model rule omits non-word filler sounds. Balanced adds contextually empty filler words
and explicit self-corrections; High adds empty openers and tags while preserving direct
address and congregation call-and-response. All levels preserve other repetition, quoted or
acted-out speech, meaningful content, names and scripture. Profanity remains governed by
its existing rule; Sanitization neither mentions nor filters it. Sound words and expressive
real-word forms remain meaningful content for Inference. Balanced Inference no longer has a
filler/junk-phrase rule: with Sanitization Off, Balanced no longer cleans those phrases.

## Tradeoffs and verification

- `buildInferenceLevelRule` (`src/ai/translation-prompt.ts`) is a simple switch over the
  three levels, defaulting to `balanced` for any unrecognized value — the same
  fail-safe pattern `normalizeInferenceLevel` uses, so an invalid or missing level never
  reaches the model as an unhandled case.
- Two base-prompt rules apply at every inference level, not gated behind the parameter:
  an ordered resolve-before-bracketing cascade for unclear words, and recognition of the
  speaker's tone/register (informative, conversational, biblical, formal, illustrative).
  Sanitization is a separate optional rule; its deterministic transcription guard never sends
  dropped segment text to translation or stores it.
- `src/ai/server/groq.test.ts` asserts the envelope text differs by level (including the
  invalid-value fallback), that the scripture-recognition and tone-recognition clauses
  are present regardless of level, that every level can omit a single indecipherable
  word, that none of them can produce an empty caption from doing so, and that High's
  whole-line fallback renders a partial caption rather than an empty one.
- Translation-quality impact cannot be verified by unit tests and is pending a
  live/sample review, the same gate `docs/GAP_ANALYSIS.md` G03 calls for before a
  quality-affecting prompt change ships. That review should cover the compounding edge
  cases, not just the common case: multiple unclear words in one caption, an unclear
  word that's also profane, and the single-indecipherable-word-caption fallback landing
  at each level — the unclear-word handling is now a multi-step cascade running at
  `reasoning_effort: "low"` on a 20B model (`src/ai/server/groq.ts`), which is more
  likely to silently drop a step under compounding ambiguity than to fail loudly.
- Profanity/slur suppression is enforced only through the prompt instruction above, with
  no deterministic runtime backstop — unlike the glossary/filter pipeline
  (`src/pipeline/moderation.ts`), which is enforced after translation regardless of
  model behavior. A model that doesn't apply the rule would publish the term with
  nothing else in the codebase to catch it. Acknowledged as a defense-in-depth gap for a
  future pass, not addressed in this change.
