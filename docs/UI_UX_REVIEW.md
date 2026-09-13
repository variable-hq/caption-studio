# Operator UI usability review

12 September 2026. Historical scope: local web dashboard and first-visit operator guide.
The later reader/remote/archive UI is covered by [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md).
Use [the documentation index](README.md) for current product and deployment status.

The guide now supports reading a step, opening its dashboard section, and returning to
that same step. On phones, a native step selector replaces the six-button tutorial
navigation. Shorter instructions and quieter example cards make the task easier to scan.
The dashboard uses a smaller mobile introduction and expandable starting configuration;
active translation details open when a service starts.

## Standards and guidance

| Reference | Application in this UI |
| --- | --- |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | Use 320 CSS px as the narrow-width check. Allow vertical reading without horizontal page or dialog scrolling. |
| [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Keep the native modal, initial heading focus, keyboard navigation, visible exit, Escape, and focus return. A section shortcut moves focus to its destination. Structured content is read through its headings and list, without a dialog-wide description. |
| [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Tutorial controls use at least 44 × 44 CSS px. This is a product target; WCAG 2.2 AA specifies 24 × 24 with exceptions. |
| [W3C text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) | Stress-check increased line, word, letter, and paragraph spacing, with separately enlarged text. Footer controls must remain reachable. |
| [Nielsen Norman Group: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Keep the setup actions visible and make the repeated starting-configuration summary expandable. Optional guide shortcuts support learning while using the controls. |
| [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/e3d624baaf29dc1fc645aff3e38f03e564d2d6b1/command.md) | Review semantic controls, focus, hover feedback, touch handling, typography, responsive layout, and state safety. Vendor style preferences are guidance, not accessibility certification. |

## Findings addressed

- `src/components/operator/OperatorTutorial.tsx`: the reading-only guide required operators to find the corresponding control afterward. Each step now has a panel shortcut; reopening retains the current topic until reload.
- `src/app/globals.css`: mobile tutorial navigation occupied two rows. A labelled native selector keeps every step available in one control; desktop retains the overview navigation.
- `src/components/operator/OperatorTutorial.tsx`: long paragraphs and a dominant dark example card competed with instructions. Copy is shorter, the equipment route is explicit, and the example has a light background.
- `src/app/page.tsx`: mobile setup repeated introductory headings and a full configuration summary before the inputs. Secondary introduction copy is compacted; the summary uses native disclosure.
- `src/app/globals.css`: tutorial navigation now has hover feedback. Footer buttons wrap onto another row when needed, list indentation scales with text, and long words reflow when enlarged; semantic heading focus remains visible.

No runtime library or service connection was added. The workspace-local
[Web Design Guidelines skill](../.agents/skills/web-design-guidelines/SKILL.md) and its
[provenance record](../.agents/skills/web-design-guidelines/PROVENANCE.md) pin the reviewed
upstream revision. The skill and reference were reviewed as text outside discovery paths
before installation. This was not a new SkillSpector scan.

The captured setup page is 278 CSS px shorter at 390px width and 227 CSS px shorter
at 320px, comparing the same idle fixture before and after the change. This measures
page height, not operator task speed. Local screenshots are in
`test-results/ui-optimisation/before-setup-*.png` and `operator-setup-*.png`.

Selected synthetic captures are [committed for review](review-assets/2026-09-12/README.md):
[desktop dashboard](review-assets/2026-09-12/operator-desktop.png),
[mobile dashboard](review-assets/2026-09-12/operator-mobile.png),
[desktop guide](review-assets/2026-09-12/tutorial-desktop.png), and
[mobile guide](review-assets/2026-09-12/tutorial-mobile.png).

## Verification and next step

Run both browser checks against a local server:

```sh
CAPTION_QA_TOOLS_DIR=/tmp/church-caption-ui-qa node scripts/tutorial-qa.mjs
CAPTION_QA_TOOLS_DIR=/tmp/church-caption-ui-qa node scripts/operator-ui-qa.mjs
npm run validate
```

The [validation report](VALIDATION_REPORT.md) records results and evidence. These checks
use synthetic local APIs. They do not prove deployed operation, real audio/OBS delivery,
actual browser zoom, screen-reader announcements, or a full WCAG conformance claim.

Next, have the operator use the guide to select the USB audio interface, set Indonesian
to English, and verify captions on the separate OBS computer. Record where the operator
hesitates before adding more tutorial screens or visual effects.
