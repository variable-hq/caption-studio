# Operator dashboard design pass QA

20 September 2026, branch `feat/operator-ui-pass`, based on `bf09d1d`. Local checks only.
This record is written for the next agent or reviewer: what changed, how it was checked,
and what was not checked. It is not a production, semantic-quality or accessibility
certificate. Every capture is synthetic and content-free.

## Scope

A refinement pass over the operator dashboard. Behaviour, copy meaning, routes, API calls
and component structure are unchanged; the work is typography, markers, callouts, target
size and the browser surfaces. The [design system](DESIGN_SYSTEM.md) now records the new
rules.

## What changed

| # | Finding | Change |
| --- | --- | --- |
| 1 | Eleven kickers sat above headings that already named the section, duplicating the rail and the breadcrumb | Removed from the workspace header, the output monitor, the OBS card, the refresh notice, the End dialog, the service panel and the three AI-usage sections. The 1920 × 1080 canvas size moved into the sentence under the monitor. `.eyebrow` stays for labels that carry their own information |
| 2 | Five callouts used a 3 px coloured left rule, the most recognisable AI-UI tell | Content blocks (`.sourceTranscript`, `.readerNote`) now read as a tinted panel with a radius; asides (`.privacyNote`, `.actionFeedback`, `.usageScopeNote`) take a 1px hairline above, and `.privacyNote` gains a drawn shield so a security note still reads as one |
| 3 | Disclosure rows showed the browser's `▶` glyph and the overview tasks used a `→` character, while the rail used drawn icons | Both now draw from the same icon language: a `chevronRight` path in `DashboardIcon` for the overview rows, and a `--chevron-right` CSS mask for every disclosure, rotating when open and static under `prefers-reduced-motion` |
| 4 | The **Service controls** trigger fell to 36 px below 980 px, under the project's own 44 px rule, although it is the only way into the live controls on a phone | Restored to the full control height at every width |
| 5 | The overview's three statistics squeezed into 96 px columns at 390 px | The grid now wraps at 140 px, so the phone shows two columns and the labels read |
| 6 | Text selection, the caret and the scrollbars shipped with browser defaults | Themed from the palette in both themes |

## Method and results

| Layer | Command | Result |
| --- | --- | --- |
| Unit, type, lint, build | `npm test`, `npm run typecheck:strict`, `npm run lint`, `npm run build`, `npm run build:cloudflare`, `npm run deploy:check` | 287 tests pass; all clean |
| Repository browser QA, including axe at 1920/1200/390/320 px | `scripts/operator-ui-qa.mjs`, `scripts/tutorial-qa.mjs`, `scripts/experience-ui-qa.mjs` | Pass, 0 axe violations, 0 page errors |
| Mechanical design detector | `impeccable detect` over the changed UI files | 5 findings before, 0 after |
| Measured pass | Computed contrast, target size, overflow and type at 1440/390/320 px, light and dark | No text below 6.4:1, no target under 44 px, no horizontal overflow |
| Visual pass | 19 captures per run, before and after, at 1440 and 390 px in both themes plus a live dark run | [Committed captures](../review-assets/2026-09-20/README.md) |

Two regressions from the merged watcher work were found by the repository's own QA during
this pass and fixed here: **Pair operator phone** stayed disabled whenever a start
response carried no service id, and the QA fixtures did not know the
`/api/live/channel/observer` route. The fixtures now mock it and assert that a watching
tab names the operator running the service and is never offered **Start captions**.

## Not verified

- The deployed environment, a real Cloudflare Access tenant, OBS, physical phones, Safari,
  screen readers and actual browser zoom.
- Operator task speed. The pass removes repetition and fixes one undersized control; it
  does not measure whether anyone works faster.
- Print, forced-colors and Windows high-contrast rendering.
