# Collapsible service controls and focused workspace pages

13 September 2026. UI candidate for [issue #31](https://github.com/lukaskawira/church-live-caption/issues/31).
This follows the [initial dashboard redesign](DASHBOARD_UI_QA.md). Local validation does
not establish production deployment or completion of the live-service rehearsal gates.

## Operator behavior

- **Service controls** in the workspace header opens a right-hand panel, initially
  collapsed. It holds pre-service history consent and Start, then service status,
  Pause/Resume, Clear, More, End, usage totals and active configuration during capture.
- At 1280px and above, the panel docks beside the workspace. Below 1280px it becomes a
  native modal drawer with an independently scrolling body. Its close button stays
  reachable. Escape, focus containment/return and crossing the dock/modal breakpoint
  are handled explicitly. A deliberately opened desktop panel stays open across sections.
- Closing the panel leaves capture running and preserves the pre-service history choice
  and translation drafts. While it is closed during a service, a compact sticky bar keeps
  Pause/Resume and Clear within reach. End requires opening the panel and confirming.
- **Preview captions** is an optional disclosure inside service controls. **Appearance**
  alone keeps the output monitor inline beside its editor, or below it on narrow screens.
- **Live outputs** uses expandable OBS, latest-viewer and reader/phone sections. OBS opens
  initially; its credential remains concealed. Sharing and pairing retain their existing
  service requirements.
- Detailed refresh notices appear in **Translation** and **AI instructions**. Other
  sections show a compact link to review unapplied translation changes. Healthy generic
  service notices no longer repeat visually; actual service errors remain visible.

The existing service handlers and parent-owned state are retained. This change adds no
provider, inference call, dependency, permission, archive retention or audience endpoint.
Opening navigation or the preview does not trigger AI. Capture still invokes its normal
pipeline while the panel is closed.

## Review and validation

The [Web Design Guidelines skill](../.agents/skills/web-design-guidelines/SKILL.md) was
applied against its [pinned reference](../.agents/skills/web-design-guidelines/references/web-interface-guidelines.md).
Review covered native disclosure/dialog semantics, labeled controls, focus return,
modal scrolling, responsive reflow, safe areas and existing reduced-motion behavior.
Obsolete repeated-monitor and always-visible service-layout CSS was removed.

Browser checks use a local production Next build, synthetic captions, fake microphone
input and mocked APIs; external traffic is blocked. They do not validate real model
output or Cloudflare Access. Builds and browser suites run sequentially to limit memory.

| Check | Result |
| --- | --- |
| `npm run validate` | Passed: 19 test files / 217 tests, strict TypeScript, ESLint, Next production build, OpenNext build, Wrangler deployment dry run and diff check |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 0 vulnerabilities |
| `scripts/operator-ui-qa.mjs` | Passed at 1920, 1200, 390 and 320px against the production build; no page errors, horizontal overflow or axe violations |
| `scripts/tutorial-qa.mjs` | Passed: six steps, keyboard focus, replay, shortcuts and dismissal at all four widths; 568 × 320 landscape and enlarged-text checks also passed |
| `scripts/experience-ui-qa.mjs` | Passed: latest viewer, reader, paired remote, archive corrections, summary retry/review, removal and usage at all four widths; no axe violations |
| Runtime source import review | All 61 runtime TypeScript/TSX/CSS files reachable from application or tooling entry points |

The operator suite covers 1920, 1200, 390 and 320px, collapsed controls across pages,
desktop/modal behavior, Escape and nested More/End dialogs, breakpoint cleanup,
history consent and draft preservation, continuous appearance preview, output
disclosures, compact pending settings, navigation without inference and Start/Pause/Clear/End.
Opening or closing the panel during capture must not dispatch pause or clear commands.

The tutorial's longer End instruction initially failed the enlarged-text scroll check.
Its wording was shortened while preserving the location and effect of End. All six steps
now pass with doubled computed font sizes and WCAG text-spacing overrides at 390px.
Actual browser zoom and a complete assistive-technology walkthrough remain untested.

See the [synthetic screenshots and browser results](review-assets/2026-09-13-service-panel/README.md).
Physical microphone/OBS behavior, Safari on actual phones, cloud lifecycle reliability
and semantic translation quality still require the [stakeholder rehearsal](STAKEHOLDER_TEST_GUIDE.md).
Axe results are automated evidence, not full accessibility certification.
