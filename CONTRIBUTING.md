# Contributing

Thank you for helping build Church Live Caption.

## Working agreement

- Use an issue to describe significant features, product decisions, or bugs.
- Create a short-lived branch from main.
- Use focused commits with clear messages.
- Open a pull request into main.
- Keep pull requests small enough to review.
- Require review before merging whenever repository settings allow it.
- Prefer squash merging so main has a readable history.
- Never commit credentials, real private sermon data, or unapproved Bible text.

## Branch names

Use a short prefix:

- feature/short-description
- fix/short-description
- docs/short-description
- chore/short-description

Automated work may use agent/short-description.

## Pull requests

A pull request should explain:

- what changed
- why it changed
- user or operator impact
- privacy, security, theological-context, and OBS implications
- tests or checks performed
- screenshots or recordings for visible behavior
- remaining risks or follow-up work

Draft pull requests are encouraged for early collaboration.

## Product decisions

Changes that affect languages, Bible data, theology profiles, content retention, filtering, public URLs, user roles, or AI behavior must record the decision and its tradeoffs in an issue or pull request.

## Data rules

Use synthetic or explicitly approved test audio and transcripts. Remove names and sensitive details from bug reports. Do not paste production keys into issues, logs, screenshots, or chat.

## Review checklist

- The change matches an approved issue or documented requirement.
- Secrets remain server-side.
- Workspace data remains isolated.
- Recording and retention behavior is explicit.
- Public captions cannot access protected archive data.
- AI output has a human-review path where appropriate.
- New behavior includes failure and recovery states.
- Relevant checks pass.

## Local development

Application setup commands will be added after the technical prototype is scaffolded.
