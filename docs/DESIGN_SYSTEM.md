# Design system

15 September 2026. Describes the tokens and shared rules in `src/app/globals.css`,
`src/app/dashboard.css`, `src/app/service-panel.css` and the React Bits adaptations.
No CSS framework or runtime dependency is involved.

## Tokens

All colour, type, spacing and size values come from custom properties on `:root`.

| Group | Tokens |
| --- | --- |
| Colour | `--ink --muted --line --line-strong --paper --card --surface-muted --surface-strong --accent --accent-hover --on-accent --track --backdrop --focus --danger --danger-bg --ok-ink --ok-bg --ok-line --warn-ink --warn-bg --warn-line --shadow --shadow-elevated` |
| Type | `--text-xs` 11px, `--text-sm` 12px, `--text-base` 14px, `--text-md` 15px, `--text-lg` 18px, `--text-xl` 22px, `--text-2xl` 28px; `--leading-tight` 1.2, `--leading-normal` 1.5; `--weight-regular` 500, `--weight-bold` 700; `--tracking-caps` |
| Space | `--space-0` 4px to `--space-4` 32px; `--gap-sm` 8px, `--gap-md` 12px, `--gap-lg` 18px |
| Size | `--control-height` 44px, `--control-height-sm` 36px, `--control-padding-x` 14px, `--radius-sm/md/lg`, `--sidebar-width` (264px default), `--content-max` 1160px |
| Icon | `--chevron-right`, `--shield`: inline SVG masks painted in `currentColor`, so a CSS-only marker follows the row's own colour in both themes |

Stylesheets contain no hard-coded colours except the simulated OBS stage, which must stay
dark in both themes, and alpha-only mask gradients. Remaining pixel literals are
structural (the 1920 × 1080 preview, meters, breakpoints, safe-area minima).

## Themes

The light palette is the default. A dark palette is declared twice: under
`@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, and under
`:root[data-theme="dark"]`, so an explicit choice wins over the system setting.
`color-scheme` follows the palette. Dark body text measures about 17:1 against the page
and muted text at least 6.9:1 against cards.

The navigation rail and phone drawer hold a **Theme** select (System, Light, Dark) under the links. The choice is
applied to `<html data-theme>`, cached in `localStorage` under
`church-live-caption:theme:v1`, and saved with the operator's account through the
preferences record, so it follows the operator between browsers. The paired operator
remote applies the cached theme; the audience `/view` and `/read` pages follow the
system setting only. The OBS overlay is always transparent and untouched by themes.
The dashboard theme never changes the configured OBS caption colours.

## Controls

- Buttons: `.primaryButton` (accent), `.secondaryButton` (card with border),
  `.textButton` (borderless, underline on hover), `.dangerButton` and
  `.dangerOutlineButton` (danger tokens). All share the control height, horizontal
  padding, radius, `--text-base` bold text, inline-flex alignment, the same
  focus-visible outline (`--focus`), disabled opacity and hover/active treatment.
  `.compact` lowers a control to `--control-height-sm`.
- Inputs, selects and textareas share height, padding, radius, border and font size.
- Chips (`.statusPill`, `.statusChip`, `.characterCount`) share one rule.
- Disclosure rows (`.outputDestination`, `.advancedActions`, `.credentialDisclosure`,
  `.serviceSnapshot`, `.transcriptDisclosure`, `details` inside `.experienceCard`) hide the
  browser's own marker and draw a chevron from `--chevron-right`, rotating it when open.
  The rotation is dropped under `prefers-reduced-motion`.
- Callouts carry no side rule. A block of content (`.sourceTranscript`, `.readerNote`) is
  marked by the muted surface and a radius; an aside (`.privacyNote`, `.actionFeedback`,
  `.usageScopeNote`) by a 1px hairline above it, and `.privacyNote` adds a drawn shield.
- Headings h1–h4 use the type scale with consistent margins; muted helper text
  (`.helpText`, `.eyebrow`, `.promptSaveStatus`, `.browserStorageNote`,
  `.usageMetricDetail`, `.usageScopeNote`) shares one rule.
- Section cards (`.experienceCard`, `.historyConsent`, `.usageSection`,
  `.usageMetricCard`, `.outputDestination`) share border, radius and `--space-3`
  padding (`--space-2` under 680px). Grids use `--gap-md`.
- Breakpoints stay at 680, 980/981 and 1280px; the 320px minimum has no horizontal
  overflow; interactive targets stay at least 44px.

## Resizable navigation

On desktop (981px and wider) a vertical handle on the rail's right edge
(`role="separator"`, label "Resize navigation") resizes the sidebar between 200 and
420px by pointer drag, ArrowLeft/ArrowRight (16px), Home/End, or double-click to reset
to 264px. The width is written to `--sidebar-width` on the dashboard shell, cached in
`localStorage` under `church-live-caption:sidebar-width:v1`, and saved with the
operator's account after resizing settles. Rail labels truncate with an ellipsis at
narrow widths. The handle and rail are hidden below 981px, where the drawer is used.

## Headings and browser surfaces

Headings stand on their own. No kicker, eyebrow or label sits above a heading to name the
section it is already in; the rail, the breadcrumb and the heading carry that. `.eyebrow`
remains for labels that carry their own information, such as the guide's step counter and
a reader paragraph's language and section.

Text selection, the caret and the scrollbars are themed from the palette
(`::selection`, `caret-color`, `scrollbar-color` and the `::-webkit-scrollbar` rules in
`globals.css`) so the parts the app does not draw still belong to it.

## Contributor rules

- Use tokens; do not add hex or rgb colours or ad-hoc pixel type sizes to stylesheets.
- Keep a heading unlabelled; do not reintroduce a kicker above one.
- Draw icons and markers; no Unicode glyph or emoji stands in for an icon.
- Use the shared button, input, chip and card classes instead of new one-off rules.
- Check every visible change in both themes and at 1920, 1200, 390 and 320px.
- Keep class names, `data-testid` values and labels that `scripts/*.mjs` reference.
