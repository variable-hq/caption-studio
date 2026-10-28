# ADR 0023: Live note and recent outputs

Date: 28 October 2026. Status: Accepted and implemented; adds an operator-authored prompt input and an observation strip to the Live screen.

> Clarification, 28 October 2026: "Quick override" below never existed as a control. Live › Quick fixes has Quick block (**Hide any caption containing a word**), which hides a whole caption; exact word replacements live only in Settings › Words. Recent outputs is shown under **Recent captions** in Live's captions card ([PR #75](https://github.com/variable-hq/caption-studio/pull/75)).

## Decision

- **Live note** is a 500-character maximum situational hint. It lives in the controlling tab, is restored from `sessionStorage` only for the matching service, and clears at Start, End and takeover. It is outside `TranslationSessionSettings`, so edits apply to the next translation request without **Apply now**, a fingerprint change or a context reset.
- Put the note in a second JSON-fenced trusted guidance block beside standing translator instructions. Add one short conditional envelope rule that limits the note to current-passage context and preserves all server rules. The live note cannot change language direction, output format, or justify invented/completed content. It cannot repair a misheard word; exact corrections remain Quick override or Words.
- **Recent outputs** retains the last 3 successful room publishes in the controlling tab, including source/public text, publication time, hidden state and whether buffering was enabled. It is display-only, hidden in observer tabs, persists through Pause and Clear, and resets at Start, End and takeover. It is never sent back to a model, OBS, the viewer, journal, or summary.

## Tradeoffs and verification

- The model can use a short situational note without resetting translation context, but the note still consumes system-message budget. The conditional rule is kept to one short paragraph.
- Exact corrections stay deterministic and live in Quick override; persistent exact rules stay in Words. A situational prompt cannot guarantee correction of a source transcription error.
- Recent output display duplicates a small bounded amount of caption text in browser memory to make operator review immediate. It is not shared across tabs or persisted.
- The UI and provider prompt are covered by synthetic-input tests. Manual verification uses synthetic audio only: edit a note during a service and verify the next caption uses it without a refresh, reload restores it for the same service, and End/takeover clears it.

ADR 0016's client-side ownership decision is extended by the same-tab Live note and Recent outputs; both remain private to the controlling operator tab.
