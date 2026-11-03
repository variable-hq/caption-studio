# ADR 0035: Workspace presets

Date: 3 November 2026. Status: accepted; the term placeholders, the preset schema with built-in whole-message overrides, starting defaults and built-in model context, the Settings chooser with its preview and Apply preset, the top bar format, and the per-session format with its snapshot on the audience pages are implemented.

## Context

Caption Studio's wording is generic (ADR 0033), but an organization often wants its own words for a session, its speakers and its audience, starting defaults that suit its format, and model context that describes its kind of event. A format such as a sermon, a talk show or a keynote should change those things without touching identifiers, routes, stored fields or the safeguards in the model prompts. Presets are the mechanism for this.

## Decision

### Presets are data

- A preset is declarative data, never code. `normalizePreset()` in `src/experience/presets.ts` is the only parse path for built-in presets, the custom editor and any import. It rejects unknown fields, an unknown `schemaVersion`, out-of-bounds values and control characters.
- Preset ids are `builtin:<name>` for shipped presets and `custom:<uuid>` for presets saved in a workspace. A future shared preset would use `market:<publisher>/<slug>`. Installing a shared preset copies it into the workspace as a custom preset. The Worker never fetches presets at runtime.
- The General preset (`builtin:general`) is the base. With no preset chosen, the base wording applies and nothing else changes.
- Presets never change identifiers, routes, stored field names, message keys, CSS classes or the AI safeguards.

### Wording mechanism

- Base catalog sentences use term placeholders. The placeholders are `{term_session}`, `{term_speaker}`, `{term_audience}` and `{term_transcripts}`, with plural forms `{term_sessions}`, `{term_speakers}` and `{term_audiences}`. The capitalized forms (`{Term_session}` and so on) are derived by uppercasing the first letter.
- A preset's `defaults` (caption wait, inference, sanitization, output buffer, summary length and focus, and starter Terms) fill only settings the workspace has not saved, and only as drafts; the schema checks each value against its setting's options.
- A preset supplies each term's singular and plural per language. `translate` and the provider's `t()` merge the active preset's term values into the message parameters, so callers do not pass them.
- Base sentences do not put "a" or "an" before a term, so any term set reads correctly. A built-in may supply a whole-string override for a sentence that cannot read well.
- `messageOverrides` (built-in presets only; a `custom:` id is rejected) replace a whole message per language. An override may use fewer placeholders than the base message, never a placeholder the base lacks, because a preset with no term for an example placeholder replaces it wholesale. `transcriptionPrefix`, `translationRule` and `summaryFraming` are built-in-only model-facing fields; a `custom:` id is rejected for each.
- Term lookup in language L is: the preset's L set, then General's L set, then the preset's English set, then General's English set.
- Display names are per language. The format words appear only in preset ids and display text.

### Where a choice is stored

- The shared setup record gains `profile`, holding a preset id. An absent or unknown value means `builtin:general`. It is saved with the existing "Save for everyone" action.
- The browser caches the choice so the page does not show General wording before the setup loads.
- A session stores its own preset choice when it starts, and that choice is locked for the session. A preset changes wording and model context only, never defaults.

### Applying a preset

- Choosing a preset shows a preview first. "Apply preset" saves the profile and fills only the fields the workspace has not saved, as drafts in the existing Apply now and Undo flow. A saved value is kept.
- Nothing reaches a running session, and nothing is saved as a default, until the operator uses Apply now or Save for everyone.
- Caption style, languages, translator instructions, summary language, automatic summaries and transcript saving are never seeded by a preset.

### Model-facing text

- A request carries only a preset id. The server validates it (a known built-in, else General) and resolves the text from the preset definition. Request text never supplies preset content. While a session runs, the id a request carries is the session's; before one starts, it is the Start bar's choice. A summary reads the session's format from its journal.
- Each non-General built-in may add a transcription prefix, one conditional translation rule and a summary framing line with its guidance. The base safeguards against inventing or quoting source text come first and are unchanged. Every addition stays inside the existing instruction and transcription budgets.

### Session snapshot

- A session stores the preset id, its version and a resolved copy of the terms and the few strings the audience pages show. Audience pages and saved transcripts keep their wording after the preset is edited or deleted. Sessions without a stored preset read as General. The reader returns the snapshot and the viewer socket sends it on connect, so each page renders its few term messages from the session's copy.

## Tradeoffs and verification

- Keeping presets as data means a built-in's values can change without a logic change, and the same validator covers built-ins, custom presets and imports. The cost is a small schema that must be extended deliberately when a new field is needed.
- Placeholders keep the catalogs as the single source for wording. The catalogs must keep the same term placeholders in both languages; the i18n tests check this, and that every placeholder is filled by the General term set.
- Indonesian preset wording is a draft until a native speaker reviews it (ADR 0030).
- The General wording is checked by a snapshot of every resolved message. Six English sentences changed wording: five drop "a" or "an" before a term (or replace it with "the"), and `shell.banner.needsAttention` drops "The" so its capitalized term starts the sentence. One Indonesian sentence dropped a suffix attached to the term. Those changes are the only differences from the wording before the placeholders.
- The model-facing rules need a per-preset evaluation with synthetic speech before a built-in is shipped as a default. That check is deferred until the presets that use it are implemented.

## Related

- [ADR 0030](0030-operator-interface-localization.md): localized operator wording and the terminology rules.
- [ADR 0033](0033-generic-vocabulary-and-identifiers.md): the neutral vocabulary and the identifier migration that presets build on.
