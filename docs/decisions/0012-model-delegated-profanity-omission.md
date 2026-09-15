# Delegate profanity/slur handling to the translator, not a blocklist

Date: 14 September 2026. Status: implemented on a feature branch; not yet merged or
deployed. Only prompt-construction is verified; see Tradeoffs below.

## Decision

The immutable translation envelope instructs the model to leave profanity, slurs, or
vulgar language out of its translation output entirely, keeping the rest of the sentence
natural and complete, rather than translating it faithfully at its actual severity and
relying solely on the deterministic public filter (mask/replace/hide-segment, see
[Product specification](../PRODUCT_SPEC.md)) to catch it afterward.

This reverses an initial design that kept the translator strictly faithful — translate
profanity as spoken, never self-censor — and deferred all filtering to that deterministic
layer, which is unchanged and still in place. The reversal was motivated by the
deterministic filter's practical limit: it only catches a term an operator anticipated in
advance, and even the quick-block instant-hide control still needs a person to notice and
react in time. Delegating detection to the model closes that gap for content nobody
configured in advance, in the same call that produces the caption, rather than depending
on operator reaction speed.

Two other remediation strategies were considered and rejected before this one:

- Masking with a `[filtered]` placeholder: visually disruptive mid-sentence, and reuses
  the bracket convention the unclear-word rule already uses for a different purpose
  (marking transcription uncertainty, not content moderation).
- Rewriting to a softened euphemism: a generative, compositional task, more failure-prone
  and less consistent than a simple omission under the low reasoning effort this call
  runs at.

## Tradeoffs and verification

This asks the model to make a content judgment call on live audience speech fed into its
own prompt — the same category of risk the [prompt-injection hardening in this
release](../../SECURITY.md) otherwise tries to minimize by keeping the model's job
mechanical wherever possible. It is a deliberate, informed exception, not an oversight:
deterministic filtering for anticipated terms is unchanged and remains fully auditable;
this only closes the gap for what nobody anticipated, and it errs toward omission
(dropping content) rather than fabrication (inventing content), which is the safer
failure direction relative to the envelope's other fidelity rules.

Only prompt-construction correctness has been verified
(`src/ai/server/groq.test.ts`) — whether the deployed model, at
`reasoning_effort: "low"`, reliably omits such content in practice has not been confirmed
against real Groq responses. Treat this as an open validation gap, not an assumed
guarantee, until real captions have been reviewed.
