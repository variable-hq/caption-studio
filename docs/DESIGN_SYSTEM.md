# Design system

Reviewed 4 November 2026 against merged PR #112 (`87b37dd`).

Describes the tokens and shared rules in `src/app/globals.css`,
`src/app/operator-shell.css` and the React Bits `BorderGlow` adaptation.
No CSS framework or runtime dependency is involved.

[Brand guidelines](BRAND_GUIDELINES.md) set the rules for using these tokens and classes:
voice, colour roles, type and spacing roles, and component behaviour.

## Tokens

All colour, type, spacing and size values come from custom properties on `:root`.
`--font-sans` resolves to Inter, self-hosted at build time by `next/font` in
`src/app/layout.tsx` (`--font-inter`), with system fallbacks after it.

| Group | Tokens |
| --- | --- |
| Colour | `--ink --muted --line --line-strong --paper --card --surface-muted --surface-strong --accent --accent-hover --on-accent --track --backdrop --focus --danger --danger-bg --on-danger --ok-ink --ok-bg --ok-line --warn-ink --warn-bg --warn-line --shadow --shadow-elevated` |
| Type | `--text-xs` 11px, `--text-sm` 12px, `--text-base` 14px, `--text-md` 15px, `--text-lg` 18px, `--text-xl` 22px, `--text-2xl` 28px; `--leading-tight` 1.2, `--leading-normal` 1.5; `--weight-regular` 500, `--weight-bold` 700; `--tracking-caps` |
| Space | `--space-0` 4px to `--space-4` 32px; `--gap-sm` 8px, `--gap-md` 12px, `--gap-lg` 18px |
| Size | `--control-height` 44px (every button and field), `--control-height-sm` 36px (nav tabs only), `--control-padding-x` 14px, `--switch-track-width` 44px, `--switch-track-height` 24px, `--switch-thumb-size` 18px, `--switch-checked-offset` 20px, `--radius-sm/md/lg`, `--content-max` 1160px |
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

**Settings › System** holds a **Theme** select (System default, Light, Dark). The choice
is applied to `<html data-theme>`, cached in `localStorage` under
`caption-studio:theme:v1`, and saved with the operator's account through the
preferences record, so it follows the operator between browsers. The paired operator
remote applies the cached theme; the audience `/view` and `/read` pages follow the
system setting only. The OBS overlay is always transparent and untouched by themes.
The dashboard theme never changes the configured OBS caption colours.

## Controls

- Buttons: `.primaryButton` (accent), `.secondaryButton` (card with border),
  `.textButton` (borderless, underline on hover), `.dangerOutlineButton` (starts a
  destructive action) and `.dangerButton` (solid `--danger` with `--on-danger` text;
  confirms one, or retries a failed End). All share `--radius-md`, bold text,
  inline-flex alignment, the same focus-visible outline (`--focus`), disabled opacity and
  hover/active treatment. **Every button is one size**: `--control-height` tall,
  `--control-padding-x` padding, `--text-base` text, never wrapping, never underlined
  (links styled as buttons included). Buttons size to their label: none sets its own
  height, padding, font size or minimum width, and full width comes only from a layout
  (`.fullButton` or a stacked phone row). Primary, secondary and danger differ by colour
  only. `.textButton` sits flush with the text around it.
- Inputs, selects, colour pickers and disclosure summaries share the button height
  (`--control-height`); textareas share padding, radius, border and font size.
- `.switchControl` is a labelled checkbox with `role="switch"`, `aria-checked`, a tokenized
  track and thumb, and the shared `--focus` focus-visible outline. Its track uses the
  current theme's `--accent`, `--surface-strong`, and `--card` colours. It remains at least
  `--control-height` tall as a target even though the drawn track is smaller.
- Chips (`.statusChip`, `.characterCount`) share one rule.
- Disclosure rows (`.outputDestination`, `.advancedActions`, `.credentialDisclosure`,
  `details` inside `.experienceCard`) hide the browser's own marker and draw a chevron
  from `--chevron-right`, rotating it when open. The rotation is dropped under
  `prefers-reduced-motion`. A closed `.advancedActions` is just its summary row, and
  neighbouring ones stack tightly as one list.
- Callouts carry no side rule. A block of content (`.sourceTranscript`, `.readerNote`) is
  marked by the muted surface and a radius; an aside (`.privacyNote`,
  `.usageScopeNote`) by a 1px hairline above it, and `.privacyNote` adds a drawn shield.
- Headings h1–h4 use the type scale with consistent margins; muted helper text
  (`.helpText`, `.eyebrow`, `.promptSaveStatus`, `.browserStorageNote`,
  `.usageMetricDetail`, `.usageScopeNote`) shares one rule.
- Section cards (`.experienceCard`, `.usageSection`,
  `.usageMetricCard`, `.outputDestination`) share border, radius and `--space-3`
  padding (`--space-2` under 680px). Grids use `--gap-md`.
- Breakpoints stay at 680 and 980/981px; the 320px minimum has no horizontal
  overflow; interactive targets stay at least 44px.

## Operator shell

`src/app/operator-shell.css` lays out the dashboard described in
[ADR 0021](decisions/0021-live-sermons-settings-operator-layout.md):

- `.operatorTopBar`: brand, `.topStatus` pill (`data-tone` ok, live, warn, bad or muted,
  per the colour roles in the brand guidelines) and the `.operatorTab` links, the current
  one marked `aria-current="page"`.
- Top bar format: `.operatorBrandName a` links the format while no session is live, styled
  `color: inherit` with an underline; while a session runs the same text is a `role="note"`
  span with no link. Both carry `aria-label` "Session format: <name>". While a session runs
  the name is the session's format.
- Workspace name (Settings › Presets, above the format): a `settingGroup` titled Workspace with
  one text input and the shared save bar. Refused text sets `aria-invalid` on the input and
  shows the error in a `settingHint` with `role="alert"`.
- Share setup (Settings › Presets): a `settingGroup` with the export as a `secondaryButton`, a
  paste field, a choose-file button, a preview of `statRow` rows and the `primaryButton` import.
  Refused files show the message in an `errorText` with `role="alert"`; the outcome is a
  `role="status"` line.
- Custom presets (Settings › Presets): a `settingGroup` with a `statRow` for "n of m used" and an
  `Edit` `secondaryButton` on each preset's row; the form is a nested `settingGroup` with text and
  `select` fields in labels, the shared save bar, and a checkbox for held model text. The locked and
  full plans show a `settingHint` and disable **New preset**; **Delete preset** uses a second
  `secondaryButton` press to confirm.
- Presets preview (Settings › Presets): rows use the `statRow` pattern; kept and not-changed
  rows show their status text in place of a value.
- Session format: `.startFormat` is a labelled native select with a hint in the Live Start
  bar; it wraps to its own row at 680px and narrower. While a session runs, a
  `.statRow.sessionFormatRow` above Session details shows the format as a read-only
  `.formatTag`. `.formatTag` is also the small tag on each saved transcript in the
  Transcripts list.
- `.operatorScreen`: one screen, capped at `--content-max`, with `--space-3` gutters
  (`--space-2` at 680px and narrower). `.operatorColumns` puts the Settings and Transcripts
  list beside its panel. Live uses `.liveGrid`: two rows of paired cards (`.liveCaptions`
  beside the checklist, `.liveActions` beside `.liveShare`) that stretch to equal height
  and stack into one column at 980px and narrower. In `.liveCaptions` the Heard box and
  the letterboxed 16:9 preview grow together, so they are always the same size. Heard text
  is `--ink` once published and `--muted` while a Dynamic draft is in progress
  (`data-in-progress="true"`), with no live-region announcement.
  The readiness checklist (`.checkList`) ends each passing row in a chevron `.rowLink` to
  the Settings section that changes it; a failing row shows a primary **Fix**, **Set up** or **Help**
  button instead.
- `.operatorCard`: the screen's cards (border, `--radius-lg`, `--shadow`, `--space-3`
  padding). `.operatorBanner` (`data-tone` warn or bad) sits above the content it concerns.
- `.liveControlBar`: pinned to the bottom of Live while a session runs; `.operatorShell`
  reserves matching `scroll-padding-bottom` so the bar never hides a focused control.
- `.settingsNav`: the Settings section links (and the Transcripts list), current one marked
  `aria-current="page"`; below 981px it becomes one sideways-scrolling row.
- Settings sections and the selected transcript share one structure from
  `SettingsParts.tsx`: a `.settingsHeader` (title and one-line description), then
  `SettingGroup`s (an `h3`, an optional `.settingHint`, the controls), each above a hairline,
  then one `SaveBar` (**Save for everyone** and its status). `.buttonRow` lines buttons up;
  `.statTiles` show figures; `.inlineForm` puts a field and its button side by side.


## Headings and browser surfaces

Headings stand on their own. No kicker, eyebrow or label sits above a heading to name the
section it is already in; the tabs and the heading carry that. `.eyebrow`
remains for labels that carry their own information, such as a reader paragraph's
language and section.

Text selection, the caret and the scrollbars are themed from the palette
(`::selection`, `caret-color`, `scrollbar-color` and the `::-webkit-scrollbar` rules in
`globals.css`) so the parts the app does not draw still belong to it.

## Contributor rules

- Use tokens; do not add hex or rgb colours or ad-hoc pixel type sizes to stylesheets.
- Keep a heading unlabelled; do not reintroduce a kicker above one.
- Draw icons and markers; no Unicode glyph or emoji stands in for an icon.
- Use the shared button, input, chip and card classes instead of new one-off rules.
- Put new operator-facing copy in `src/i18n/messages/en.ts` and add its Indonesian
  translation in `id.ts`; use flat, component-namespaced keys and named placeholders.
  Keep meaning in one message rather than assembling translated fragments, and leave
  about 30% length headroom for Indonesian labels and controls.
- Indonesian copy is an implementation draft pending native-speaker review; track that
  status in the PR and localization ADR.
- Check every visible change in both themes at 1920, 1200, 390 and 320px. `npm run qa`
  automates all four widths, including the 320px minimum where a prior regression was found,
  and adds a dark colour-contrast pass at 390 and 1200px.
- Keep class names, `data-testid` values and labels that `scripts/qa/*.mjs` reference.
