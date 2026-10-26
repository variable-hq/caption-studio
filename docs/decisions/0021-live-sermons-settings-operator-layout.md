# ADR 0021: Live, Sermons and Settings operator layout

Date: 26 October 2026. Status: Accepted; supersedes [ADR 0004](0004-first-visit-operator-tutorial.md).

## Decision

The operator dashboard is organised for rotating volunteers who may use it once a month,
following [Brand guidelines](../BRAND_GUIDELINES.md):

- Three tabs replace the grouped sidebar: **Live** (`#live`), **Sermons** (`#sermons`) and
  **Settings** (`#settings=<section>`), plus a short **Help** page (`#help`). Settings
  sections are This computer, Languages & timing, Words, Caption look, OBS & links, AI
  translator, AI summary and Usage. Old `#workspace=…` bookmarks land on the matching
  screen.
- **Live** holds everything needed during a service: what was heard (operator only) beside
  what the audience sees, the microphone level, one Start card, a readiness checklist whose
  failing items link straight to the Settings section that fixes them, sharing links, and,
  while running, quick fixes and this service's figures.
- While a service runs, Pause/Resume, Clear screen and End service sit in a bar pinned to
  the bottom of the Live screen.
- A change to languages, words or translator instructions during a service shows one
  banner with **Apply now** and **Undo changes**. The separate review and confirm steps
  are gone; the banner states the effect (current caption and queue clear, the service
  keeps running).
- The six-step first-visit tutorial, the resizable sidebar, the Service controls side
  panel, the Master Controls strip, the status footer and the decorative spotlight are
  removed. The Help page and the readiness checklist carry the guidance instead.
- A sermon's summary uses the saved AI summary defaults; per-request overrides are gone
  from the Sermons screen.

## Tradeoffs and verification

- First-time operators lose the guided tour. The checklist names what is missing and the
  Help page is one click from every screen, which suits operators who return monthly and
  would otherwise dismiss the tour once and never see it again.
- **Apply now** acts without a second confirmation. Refreshing translation never ends the
  service, extends it, or replaces any link, so the banner's description is the safeguard.
- `sidebarWidth` and `tutorialDismissed` stay in the `OperatorPreferences` schema but are no
  longer written or read by the dashboard. Saved data is otherwise unchanged; merging the
  word lists into one Words list and replacing per-operator defaults with one shared church
  setup are separate decisions.
- Verified with `npm run typecheck:strict`, `lint`, the unit suite, `build`, and `npm run
  qa` (operator and sermon flows at 1920, 1200, 390 and 320px in both themes, with zero Axe
  violations). On the machine used, headless Chromium's fake capture device never
  resolved, so the operator flow ran with the opt-in `CAPTION_QA_STUB_MIC=1` microphone
  stub.
