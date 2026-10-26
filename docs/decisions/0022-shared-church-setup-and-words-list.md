# ADR 0022: Shared church setup, one Words list and fewer choices

Date: 26 October 2026. Status: Accepted; amends [ADR 0014](0014-operator-preferences-by-access-identity.md)
and [ADR 0017](0017-configurable-output-buffer-dwell.md), follows
[ADR 0021](0021-live-sermons-settings-operator-layout.md).

## Context

ADR 0021 changed the operator screens but left the settings model built for one trained
operator: every operator kept their own saved setup, words lived in three typed-syntax
fields, summaries offered a model choice, and the output buffer needed two settings. With
rotating volunteers, the same church could start a Sunday service with a different setup
depending on who signed in.

## Decision

- **One church setup.** `GET`/`POST`/`DELETE /api/live/experience/setup` reads and writes a
  single `OperatorPreferences` record under the fixed key `workspace:setup`, open to every
  signed-in Access operator, as saved sermons already are. It owns the saved prompt,
  summary defaults, caption style, translation defaults, output buffer, transcript-saving
  default and automatic summaries. Only the theme stays in each operator's own record.
  Until anyone saves the church setup, an operator keeps their own earlier values; after
  that, a field the church setup has never set still falls back to the operator's own
  (`effectiveSetup`). The first save carries the saving operator's earlier setup across.
  Automatic summaries read the same effective setup.
- **One Words list.** Settings › Words shows one row per word with one action: help the AI
  recognise it, fix spelling to, always translate as, hide the word, replace on screen
  with, or hide the whole caption. Rows are stored as the existing glossary
  (`canonical|variant => translation`) and public filter (`word`, `word=>replacement`,
  `word=>!hide`) text, so translation, moderation, drafts, refresh and saved setups are
  unchanged and existing values load as rows. Quick block stays a live-only control
  because it applies without a refresh.
- **One summary model.** Summary options always use the default Workers AI model; the
  picker is removed and a previously saved choice is replaced on read.
- **One wait choice.** "Check captions before they show" is Off or Wait 1–5 seconds,
  stored as the existing count and dwell.
- **Removed:** the capacity planner, and the unused `sidebarWidth` and `tutorialDismissed`
  preference fields (dropped from a record on its next save).

## Tradeoffs and verification

- Any signed-in operator can change the setup for everyone. That matches the workspace's
  existing trust model (one Access tenant, shared sermons), and Access policy remains the
  control on who is an operator. There is no per-field history or undo.
- Per-operator setups saved before this decision are no longer edited, only read as
  fallbacks; nothing is deleted.
- Glossary entries that combined several meanings (`Saul|swauf => Saulus`) appear as
  several rows and are written back as one entry. Tests check that existing text
  round-trips to identical parsed glossary and moderation rules.
- Verified with `npm run typecheck:strict`, `lint`, the unit suite (new Words and
  church-setup tests), `build`, and `npm run qa` at 1920, 1200, 390 and 320px with zero Axe
  violations (operator flow with `CAPTION_QA_STUB_MIC=1`, as in ADR 0021).
