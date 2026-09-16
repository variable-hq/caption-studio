# Docked status bar QA and gap analysis

15 September 2026, reviewed against merged [PR #42](https://github.com/lukaskawira/church-live-caption/pull/42) (`171c2f8`); fixes on branch `fix/dock-status-bar-qa`. Local checks only. This
record is written for the next agent or reviewer who continues the work: it states what
was verified, how, what failed, and which fixes this branch now carries. It is not a
production, semantic-quality or accessibility certificate. All browser evidence comes
from headless Chromium 1243 through Playwright 1.63; no physical phone, Safari, screen
reader or Chrome extension session was available.

## Scope

The branch docks the cloud and Main-channel status pills in a bar at the bottom of the
operator workspace and moves **How to use** and **Theme** into the navigation rail and
phone drawer. The pass covered:

- the operator dashboard (`/`) in light, dark and OS-dark themes at 1920, 1200, 844 × 390
  (landscape phone), 390 and 320 CSS px, plus 200 % text enlargement;
- keyboard operation: skip link, tab order, the resizable rail handle, the phone drawer;
- the audience and remote surfaces (`/overlay`, `/view`, `/read`, `/operator/mobile`)
  rendered against the real local Durable Objects, not mocks;
- the repository's own unit, type, lint and browser QA scripts.

## Method

| Layer | Command | Result before fixes |
| --- | --- | --- |
| Unit | `npx vitest run --maxWorkers=1` | 24 files, 270 tests pass |
| Types | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | clean |
| Lint | `npx eslint .` | clean |
| Mocked UI | `scripts/tutorial-qa.mjs`, `scripts/operator-ui-qa.mjs`, `scripts/experience-ui-qa.mjs` | pass at 1920/1200/390/320, 0 Axe (WCAG 2 A/AA, 2.1 AA, 2.2 AA) violations, 0 page errors |
| Real runtime | `scripts/experience-runtime-qa.mjs` against `wrangler dev --local` with the AI binding removed (recipe in [Plan 1 QA](LIVE_SESSION_PLAN_1_QA.md#runtime-rehearsal)) | 7/7 checks pass, 0 provider calls |
| Exploratory | Ad-hoc Playwright scripts (dark theme Axe per section, docked-bar geometry, zoom, landscape, keyboard, real overlay/viewer/reader/remote rendering) | findings below |

Tooling notes that cost time and belong in the runbook:

- `next dev` binds `localhost` by default and Next 16 blocks the `127.0.0.1` origin from
  loading dev chunks ("Blocked cross-origin request to Next.js dev resource"). Every UI
  script then times out waiting for **Cloud AI configured**. Start the server with
  `npm run dev -- --hostname 127.0.0.1 --port 3100` (as the README already says) or rely
  on the `allowedDevOrigins` entry this branch adds to `next.config.ts`.
- The cached Playwright browsers on this machine are revision 1243; Playwright 1.63 is the
  matching package. Older packages look for revision 1208 and fail to launch.
- `npm run preview` (OpenNext preview) needs `CLOUDFLARE_API_TOKEN` because the Workers AI
  binding opens a remote proxy session. The AI-less Wrangler configuration is the working
  local path; `CAPTION_LOCAL_AUTH_BYPASS=true` makes `/api/ai/health` report
  `not-configured` for Access, which is expected locally.

## What passed

- Dark theme: 0 Axe violations at 1920 and 390 on Overview and all eight sections, the
  service panel, the live state and the paused state. With the theme on **System** and the
  OS in dark mode the page background is `rgb(18, 18, 18)`, so `prefers-color-scheme` is
  honoured without an attribute.
- Keyboard: the first Tab stop is **Skip to workspace controls**; content is reached in two
  stops. The rail handle is `role="separator"` with `aria-valuenow`, responds to
  ArrowLeft/ArrowRight/Home/End (200 to 420 px) and posts the width to account preferences.
- Phone drawer: scrolls (`overflow-y: auto`, 1031 px content) and **Theme** is reachable at
  844 × 390 and 390 × 844.
- Tutorial fits a 320 × 568 viewport (dialog 536 px tall, no horizontal scroll).
- No console warnings or errors on load, no unexpected API calls, no running animations at
  idle, no horizontal overflow at any width or at 200 % text size.
- Real Worker lifecycle from a browser: create channel (201), start service (200), publish
  caption (200), pair phone, remote **Pause** stays `pending` until the host acknowledges
  and then reads `confirmed`, service **End** (204). Overlay at 1920 with a 330-character
  caption renders five lines at 48 px and stays inside the safe margin. Viewer, reader and
  remote pass Axe in light and dark at 390 and 1200.

## Defects and fixes

Severity: P1 blocks the branch, P2 should be fixed before a pilot, P3 is polish.

### D1 — P1 — docked status bar covers content at 320 px (fixed)

At 320 px the two pills wrap onto two rows and the bar grows from 53 px to 97 px. The
phone rule for `.dashboardContent` replaced the desktop bottom reserve with
`env(safe-area-inset-bottom)` (0 px in a browser), and `scroll-margin-bottom` was a fixed
80 px. Measured at maximum scroll: **Review service setup** on Overview had its bottom at
790 px against a bar top of 747 px, and **Replace reader link** under Live outputs sat at
758 px against 747 px. At 390 px the clearance was 1 px, so any extra line wrap would have
hidden a control there too.

Fix: `src/app/page.tsx` observes the footer with a `ResizeObserver` and writes its height
to the `--dashboard-status-bar-height` custom property on the root element.
`src/app/dashboard.css` reserves `calc(var(--dashboard-status-bar-height, 52px) + spacing)`
under the content at every width and sets `scroll-margin-bottom` from the same variable,
so focus and `scrollIntoView` never land under the bar however many rows the pills take.
`scripts/operator-ui-qa.mjs` now asserts at every width that the lowest visible control is
clear of the bar at maximum scroll.

### D2 — P2 — dark theme flashes light on every load (fixed)

`data-theme` was set only inside a React effect after hydration, and the account
preference arrived later still. For an operator whose account and browser both say dark,
`DOMContentLoaded` and `load` both observed `data-theme` unset and a body background of
`rgb(247, 247, 245)`. `src/app/layout.tsx` had no pre-paint script, and `/read` and
`/operator/mobile` apply the theme from the same effect.

Fix: `src/app/layout.tsx` renders a small inline script in `<head>` that reads
`church-live-caption:theme:v1` from `localStorage` and sets `data-theme` before first
paint. It only accepts the literal values `light` and `dark`, swallows storage errors and
touches nothing else. The `<html>` element carries `suppressHydrationWarning` because the
attribute legitimately exists before React hydrates. The React effect still applies the
account preference when it differs.

### D3 — P2 — latest-caption viewer has no length policy (fit-to-screen implemented in the follow-up branch)

One 18-second chunk of about 330 characters renders 18 lines at 390 px on the Standard
size (caption card 730 px tall, page 1279 px) and 1460 px on Extra large. The audience
scrolls to read "the latest caption" and the `aria-live` region re-announces the whole
block. The overlay is unaffected because OBS is 1920 wide. This extends
[G07](GAP_ANALYSIS.md#g07--p1-output-readability-and-completeness) and needs an owner
decision between sentence-level publication, a fit-to-viewport font, or a clamp that keeps
the tail visible. The follow-up branch `feat/output-monitor` applies the fit-to-viewport
font: the viewer shrinks a caption from the chosen size down to 18 px until the card fits
the screen, and restores the chosen size for the next short caption. Sentence-level
publication remains a separate pipeline decision.

### D4 — P2 — 200 % text size during a live service leaves little room (mitigated)

At 390 px with the root font at 200 %, the sticky quick-controls bar measured 279 px and
the status bar 53 px, leaving roughly 510 px of an 844 px viewport for content.

Fix: `src/app/service-panel.css` caps `.serviceQuickControls` at `40dvh` with internal
vertical scrolling, so the bar can never take more than two fifths of the viewport. At
844 px tall the cap (337 px) sits above the measured 279 px, so it only bites on shorter
viewports; the underlying question of a single-row compact mode at large text sizes
remains open.

### D5 — P3 — paused service panel at 390 px squeezes two inputs side by side (fixed)

`.servicePanel .primaryControls` is a two-column grid. **Quick block** and **Manual
caption** each took one column, truncating their placeholders to "Word to block no…" and
"Text to show inst…".

Fix: both controls now span the full panel width (`grid-column: 1 / -1`) so each input,
its button and its note read as one block.

### D6 — P3 — missing link hash shows an API error as the status (fixed)

`/operator/mobile` opened without a pairing hash showed the raw server message
**Expired** as its status line; `/read` said **Reader link expired or replaced** even
though no link had been used.

Fix: both pages detect an absent credential before polling and explain that the page must
be opened from the link the operator shares (Live outputs → Reader and operator phone).
Expired or replaced links keep their existing messages.

### D7 — P3 — remote Pause while the capture computer is offline gives no way forward (copy fixed)

The remote allows **Pause** while it reports **Capture computer disconnected**. That is
correct: the server blocks new inference immediately. But the phone then shows both
buttons disabled and **Waiting for capture computer acknowledgement** with no timeout,
and further commands return 409 until the host reconnects.

Fix: the pending message now says that the command is held until the capture computer
reconnects and that the operator should reopen the dashboard there. The server behaviour
is unchanged by design (see [ADR 0011](decisions/0011-service-history-and-optional-inference.md)).

### D8 — P3 — QA run recipe was incomplete (fixed)

`scripts/tutorial-qa.mjs` said "Start npm run dev on port 3100" without the hostname.
Fix: `next.config.ts` allows `127.0.0.1` as a dev origin and the script headers name the
full command. The README section already had it.

## Gap analysis

[GAP_ANALYSIS.md](GAP_ANALYSIS.md) items G01 to G11 remain valid and unchanged in status.
This pass narrows what is unknown:

**Confirmed locally on this branch:** overview-first navigation, hash-addressable
sections, phone drawer, collapsible service panel, docked status bar (after D1), light and
dark themes, keyboard operation, 320 to 1920 px reflow, the real Durable Object service
lifecycle, and rendering of every audience surface.

**Still not verifiable locally:** Cloudflare Access on the deployed Worker (G01, G02);
microphone capture plus Groq inference (no provider key in the local worker); OBS inside
real OBS; optional Workers AI; language and theological quality (G03); latency (G04);
device and network recovery (G05); Safari, physical phones and screen readers (G09).

**New items not previously recorded:** D3 (viewer length policy, owner decision), the
compact-mode question under D4, and the tooling notes under *Method*. D1, D2, D5, D6, D7
and D8 are resolved on this branch.

## Verification after fixes

Re-run the same commands:

```sh
npm run dev -- --hostname 127.0.0.1 --port 3100
CAPTION_QA_TOOLS_DIR=<isolated playwright dir> node scripts/tutorial-qa.mjs
CAPTION_QA_TOOLS_DIR=<isolated playwright dir> node scripts/operator-ui-qa.mjs
CAPTION_QA_TOOLS_DIR=<isolated playwright dir> node scripts/experience-ui-qa.mjs
npm test -- --maxWorkers=1 && npm run typecheck:strict && npm run lint
```

Results on `fix/dock-status-bar-qa`, 15 September 2026:

| Check | Result |
| --- | --- |
| `npx vitest run --maxWorkers=1` | 24 files, 270 tests pass |
| `npx tsc --noEmit --noUnusedLocals --noUnusedParameters`, `npx eslint .` | clean (the first draft of D6 tripped `react-hooks/set-state-in-effect`; both pages now defer the message with `setTimeout(…, 0)`, the pattern `src/app/page.tsx` already uses for the cached theme) |
| `scripts/operator-ui-qa.mjs` with the new docked-bar assertion | pass at 1920, 1200, 390 and 320 on two consecutive runs |
| `scripts/tutorial-qa.mjs`, `scripts/experience-ui-qa.mjs` | pass at all four widths |
| Theme boot timing (dark account and browser) | `data-theme="dark"` and body `rgb(18, 18, 18)` already at `DOMContentLoaded` (75 ms) and `load` at 1920 and 390 |
| Docked bar clearance at maximum scroll | 390 px: content reserve 71 px, lowest control 48 px above the bar; 320 px: reserve 115 px against a 97 px bar, lowest control 72 px above it |
| Dark theme Axe (all sections, panel, live, paused) | 0 violations at 1920 and 390 |
| `/read` and `/operator/mobile` without a hash | "No reader link" and "Not paired. Open this page from the pairing link under Live outputs on the capture computer." |
| `npm run build`, `npm run build:cloudflare`, `npm run deploy:check`, `git diff --check` | production build, OpenNext bundle and Wrangler dry run complete; no whitespace errors |

The operator script's failure handler now prints the original assertion before taking
diagnostic screenshots, and those screenshots time out after five seconds instead of
masking the assertion (the first post-fix run lost its cause this way).
