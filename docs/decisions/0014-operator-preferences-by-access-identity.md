# ADR 0014: operator preferences bound to the Access identity

15 September 2026. Status: accepted, implemented in source.

## Context

Operator configuration (the custom translation prompt, summary defaults, caption style,
translation setup and the tutorial dismissal flag) lived only in one browser's
unencrypted `localStorage`. Operators who switch computers, browsers or profiles lost it.
Every operator signs in through Cloudflare Access, whose JWT carries an `email` claim,
so the application already has a stable identity without accounts of its own.

## Decision

- Add an `OperatorPreferences` SQLite Durable Object (binding `OPERATOR_PREFERENCES`,
  migration v3). One object per operator, addressed by `operator:` plus the SHA-256 of
  the trimmed, lower-cased Access email. The email itself is not stored anywhere.
- Expose `GET`, `POST` (merge; `null` clears a field) and `DELETE` on
  `/api/live/experience/preferences` behind the existing Access check. Local runs without
  Access share one `local` identity.
- The record holds only operator-chosen configuration: theme, sidebar width, prompt,
  summary defaults, caption style, default translation setup (languages, buffer,
  terminology, filters) and tutorial dismissal. Every field is normalized with the same
  bounds the live pipeline enforces; malformed values fall back rather than being stored.
  The record is capped at 32,768 bytes.
- The dashboard loads the account record first on every visit and applies it; the
  browser `localStorage` copies remain as a fallback when the account store is
  unavailable (for example `next dev` without Durable Objects). Saving writes both.
- Saved translation defaults prefill drafts only when no service is active; an active
  service's same-tab snapshot still wins.

## Consequences

- Preferences follow the operator across devices, and a shared computer no longer leaks
  one operator's prompt or guidance into another's session once each signs in.
- The application now keeps a small per-operator record indefinitely. Operators can reset
  each field; `DELETE` clears the whole record. Deleting an Access user does not delete
  the object; an owner must call `DELETE` as that identity or purge the namespace.
- Nothing here changes captions, audio, history or usage handling, and no field is sent
  to a provider. Archives and usage remain shared across operators as before.
