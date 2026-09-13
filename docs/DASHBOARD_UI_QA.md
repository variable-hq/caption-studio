# Operator dashboard design and QA

13 September 2026. This record describes the dashboard navigation candidate.
Production deployment is separate from local validation.

The subsequent [service-panel change](SERVICE_PANEL_UX_QA.md) replaces the always-visible
Start card and repeated output monitor described here. This record preserves the earlier
dashboard candidate and its validation evidence.

## Design

The operator page now uses a full-height desktop sidebar, stable grouped destinations,
a compact workspace header, a service overview, and an output monitor. The service card
keeps transcript consent and Start together. It sits beside the workspace at wide desktop
sizes and above it at narrower sizes. Live controls remain visible before the workspace
in document order and do not overlap focused headings.

**Live outputs** now contains OBS setup, latest-viewer sharing, reader sharing and operator
phone pairing. **Sermon history** contains private archives, corrections and summary review.
The navigation order does not change when a service starts.

The sidebar becomes a native modal drawer below 981 CSS pixels. It traps keyboard focus,
closes with Escape, returns focus to its trigger, and closes/unlocks scrolling when the
viewport returns to desktop. Section links support modified clicks, direct opening,
reload, and browser Back/Forward. Only an allowlisted section ID is reflected in the URL.
In-page changes retain translation drafts and the before-service history choice; a full
reload still follows the existing rules for saved defaults and controller recovery.
Navigation links use `rel="noopener"` so a newly opened tab does not inherit the active
controller session and trigger recovery actions on the capture computer.

The visual system uses shared typography, labelled controls, neutral surfaces and a
restrained green accent. SVG navigation icons are code assets with no icon-package,
font-service or image-service dependency. Obsolete setup-hero, numbered checklist, tile-menu
and sidebar-card CSS was removed.

## Market references

- [Restream home screen](https://support.restream.io/en/articles/9733797-get-to-know-your-home-screen):
  stable sidebar destinations and a clear workspace for managing streams informed the
  navigation and service action hierarchy.
- [Riverside projects](https://support.riverside.com/hc/en-us/articles/32984072319901-Projects-Sort-and-switch-views):
  studio navigation and task-specific content views informed the separation of setup,
  outputs and saved sermons.
- [Riverside studio settings](https://support.riverside.com/hc/en-us/articles/5271888353565-Access-studio-settings):
  keeping settings discoverable outside capture controls informed the Settings group.

These are workflow references, not copied product assets. The UI represents this app's
single Main channel; it does not imply implemented billing, organizations, team roles,
viewer analytics or additional workspaces.

## Validation

The [Web Design Guidelines skill](../.agents/skills/web-design-guidelines/SKILL.md) was
applied against its [pinned reference](../.agents/skills/web-design-guidelines/references/web-interface-guidelines.md).
Browser scripts use synthetic captions, fake microphone input and mocked endpoints.
External requests are blocked. No provider inference is used for this QA.

| Check | Result |
| --- | --- |
| `npm run validate` | Passed: 19 test files / 217 tests, strict TypeScript, ESLint, Next production build, OpenNext build, Wrangler deployment dry run, diff check |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 0 vulnerabilities |
| `scripts/operator-ui-qa.mjs` | Passed at 1920, 1200, 390 and 320px against the production Next build; no page errors, horizontal overflow or axe violations |
| `scripts/tutorial-qa.mjs` | Six steps, keyboard focus, dismissal/replay and shortcuts passed at all four widths; existing live/paused services do not auto-open the guide |
| `scripts/experience-ui-qa.mjs` | Reader, paired remote, archive corrections, summary retry/review, passage removal and usage passed at all four widths; no axe violations |

Browser tooling was installed outside the repository and supplied with
`CAPTION_QA_TOOLS_DIR`. Builds and browser runs were sequential to limit local memory.
The operator checks also cover Back/Forward/reload, in-page draft preservation,
drawer Escape/Tab/desktop-resize behavior, history consent, no inference from navigation,
hidden OBS credentials, continuous appearance preview, and Start/Pause/Clear/End.
Navigation cannot rotate a live OBS credential or expose idle test actions during capture.

The skill review covered icon labels, native links and dialogs, focus visibility/return,
allowlisted URL state, responsive overflow, reduced motion, touch targets and safe areas.
The new navigation and controls passed those checks. Axe scans are automated evidence,
not certification of every WCAG criterion.

See the [committed synthetic screenshots and results](review-assets/2026-09-13/README.md).
No Worker deployment was made for this UI candidate; the deployment dry run completed
with all three Durable Objects, AI and assets bindings.

## Release scope

This is operator UI polish. It does not establish physical audio/OBS reliability, semantic
translation accuracy, full assistive-technology conformance or completion of all launch
gates. The [stakeholder rehearsal](STAKEHOLDER_TEST_GUIDE.md) and unscored
[Indonesian–English review](evaluation/ID_EN_REVIEW.md) remain necessary.
