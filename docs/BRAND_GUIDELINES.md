# Brand guidelines

Reviewed 3 November 2026 against merged PR #96 (`f74a25f`).

The baseline every Caption Studio screen follows: how the product sounds, which token
to use for which job, and how text, space and components are laid out. Agents and
contributors apply it to every UI change.

This guide sets the rules. [Design system](DESIGN_SYSTEM.md) records the token values
and shared CSS classes that implement them, and `src/app/globals.css` is the source of
those values. This guide names tokens, never raw values, so it stays true when a value
changes. If the two documents disagree, fix the one that is wrong in the same commit.

## Who we design for

| Surface | Who uses it | What matters most |
| --- | --- | --- |
| Operator dashboard (`/`) | Rotating volunteers, often monthly, with no training; one setup person | One obvious next step; nothing to remember between visits |
| Operator phone remote (`/operator/mobile`) | The same volunteer, one-handed, near the stage | Three big actions; status at a glance |
| Phone viewer (`/view`) | Audience members on their own phones | Readable captions; nothing else |
| Transcript reader (`/read`) | People reading after or during the session | Comfortable long-form reading |
| OBS overlay (`/overlay`) | The audience, through the projector or stream | Only the caption, in the operator's configured style |

### Principles

1. **Live first.** During a session the controls that matter (Start, Pause, Clear
   screen, End session) are always visible. Everything else waits until asked for.
2. **One obvious next step.** Each screen region has at most one primary action. When
   something blocks it, the screen says what and offers the fix next to the problem.
3. **Plain words.** Volunteers see plain words, not system words (see the glossary).
   Technical detail lives under Usage or a "Technical details" disclosure.
4. **Calm by default, loud when it matters.** Neutral surfaces and ink. Colour is
   reserved for state: ready, paused, live, error.
5. **One look everywhere.** Every colour, size, space and radius comes from a token.

## Name and mark

- The product name is **Caption Studio**, two words, both capitalised. Never "Church Live
  Caption", "CLC" or "Caption studio". Mark it `translate="no"` where browsers may
  auto-translate the page.
- The monogram is **CS**, in `--on-accent` on an `--accent` tile with `--radius-md`.
  It is decorative next to the wordmark (`aria-hidden="true"`).
- The workspace line reads `<Workspace name> · Main channel`.

## Voice and copy

- **Sentence case** for everything: headings, buttons, tabs, navigation, menu items.
  "Start captions", "Translation", not "Start Captions" or "AI Behavior".
- Speak to the operator as **you**. Use active voice: "Copy the OBS link", not "The
  OBS link can be copied".
- **Buttons name the outcome** with a verb: "End session", "Delete transcript",
  "Replace link". Never "OK", "Confirm" or "Submit" alone.
- **Errors say what happened, then what to do**: "The browser is blocking the
  microphone. Click the microphone icon in the address bar, choose Allow, then press
  Try again."
- Use numerals ("8 seconds", "3 words"), `…` not `...`, and curly quotes and
  apostrophes (’ “ ”). Placeholders are examples ending in `…`: "e.g. Speaker’s name…".
  Progress text ends in `…`: "Saving…".
- Keep a hint to one sentence. If it needs a paragraph, it belongs in the help page.
- Confirmation dialogs ask a question as the title ("End this session?"). The safe
  button names staying ("Keep going"); the action button names the action ("End
  session").

### Glossary

Use the left column on every operator surface. The right column may appear only in
code, documentation, Usage and diagnostics.

| Say | Not |
| --- | --- |
| Start captions / Pause / Resume | Start session, capture, inference |
| Clear screen | Clear live caption, clear public caption |
| End session | Deactivate, stop channel |
| Phone viewer, phone viewer link | Mobile translation viewer, viewer URL |
| Transcript reader, reader link | Reader token, bearer link |
| OBS link | OBS URL, channel credential, browser source URL |
| Phone remote, Pair phone | Remote pairing, operator remote credential |
| Terms | Glossary, terminology, keyword hints, public caption filter, quick block |
| Caption wait time | Recording window, chunk, audio window |
| Check captions before they show, Next up | Output buffer, buffer queue, dwell |
| Heard / Audience view | Source transcript / public caption |
| Transcripts | Transcript archive, experience, journal |
| Take over | Controller takeover, lease |
| Apply now / Undo changes | Review refresh, confirm refresh, discard drafts |
| Replace link | Rotate |

## Colour

All colours come from the tokens in `globals.css`, which define both themes. Never add a
hex, rgb or named colour to a stylesheet or inline style. The only exceptions are:

- the **caption stage**: the simulated OBS preview stays dark in both themes;
- **caption colours the operator configures**, which apply only inside the stage and
  the overlay.

| Role | Tokens | Use for | Never for |
| --- | --- | --- | --- |
| Page and surfaces | `--paper`, `--card`, `--surface-muted`, `--surface-strong` | Page background; cards; insets such as the Heard panel; selected tab or nav item | Status |
| Text | `--ink`, `--muted` | Body text and headings; helper text, labels, metadata | `--muted` for anything the operator must read to act |
| Lines | `--line`, `--line-strong` | Card and control borders, dividers; hover borders | Emphasis |
| Primary action | `--accent`, `--accent-hover`, `--on-accent` | The one primary button in a region; the monogram; selected toggles | Links, decoration, status |
| Ready / success | `--ok-ink`, `--ok-bg`, `--ok-line` | "Ready" status, ticks, level meter fill, "Copied" | Primary buttons |
| Paused / needs attention | `--warn-ink`, `--warn-bg`, `--warn-line` | "Paused" status, another-operator and transcript-gap banners | Errors |
| Live, errors, destructive | `--danger`, `--danger-bg`, `--on-danger` | The "Live" status indicator; error banners; End session, Delete, Replace link | Anything that is merely important |
| Focus | `--focus` | The `:focus-visible` outline | Anything else |
| Overlay | `--backdrop` | Behind a dialog | Panels |

- Never use colour alone to carry meaning: pair it with a word or an icon.
- Text meets WCAG AA (4.5:1, or 3:1 at 24px and above). Controls and focus outlines
  meet 3:1 against what is around them. Check both themes.

## Typography

- One family: `--font-sans`. Inter is self-hosted by `next/font` in `layout.tsx`
  (latin and latin-ext subsets), so no page request goes to a font host. Use
  `--font-mono` only for codes, identifiers and numbers that must align in technical
  views.
- Two weights only: `--weight-regular` and `--weight-bold`.
- Line height: `--leading-tight` for headings and single-line labels,
  `--leading-normal` for everything else.
- Counters, timers, usage figures and table columns use
  `font-variant-numeric: tabular-nums`.
- Headings use `text-wrap: balance`. No kicker or eyebrow sits above a heading (see the
  design system's "Headings and browser surfaces").

| Token | Role |
| --- | --- |
| `--text-2xl` | Page title (`h1`), one per screen |
| `--text-xl` | Section title (`h2`), such as a Settings section |
| `--text-lg` | Card title (`h2`/`h3`) |
| `--text-md` | Body text (the `body` default) and large controls |
| `--text-base` | Controls, buttons, form values, table text |
| `--text-sm` | Helper text, metadata, captions under fields |
| `--text-xs` | Uppercase labels and chips only, with `--tracking-caps`; never a sentence |

The transcript reader may use a larger reading size and line height than the dashboard for
long-form text; that is its one documented exception.

## Space and layout

Spacing uses the 4px-based tokens `--space-0` to `--space-4` and the gaps `--gap-sm`,
`--gap-md` and `--gap-lg`. Never use an ad-hoc pixel margin or padding.

| Where | Token |
| --- | --- |
| Page gutter, 681px and wider | `--space-3` |
| Page gutter, 680px and narrower | `--space-2` |
| Card padding (`--space-2` at 680px and narrower) | `--space-3` |
| Between cards and page sections | `--gap-lg` |
| Between items inside a card | `--gap-md` |
| Label to control, icon to text | `--gap-sm` or `--space-0` |
| Content width | `--content-max`, centred |

- Breakpoints are 680 and 980/981px. Every screen works from 320px wide with no
  horizontal page scroll; wide tables scroll inside their own box.
- Lay out with flex or grid and `gap`. Columns wrap rather than shrink: a main column
  and a side column become one column on narrow screens. Never measure the DOM with JS
  to position content.
- Flex and grid children that hold text get `min-width: 0`, and user text wraps
  (`overflow-wrap: anywhere`).
- Anything sticky (such as the live control bar) must not cover the focused element:
  give the page matching `scroll-padding`.

## Shape and elevation

| Token | Use |
| --- | --- |
| `--radius-sm` | Chips, small badges, the caption band in previews |
| `--radius-md` | Buttons, inputs, nav items, banners |
| `--radius-lg` | Cards, dialogs, the caption stage |
| 1px `--line` border | Every card and control |
| `--shadow` | Cards, the selected tab |
| `--shadow-elevated` | Dialogs and popovers only |

## Components

Use the shared classes in the design system before writing a new rule.

- **Buttons.** Primary (`.primaryButton`) for the single main action in a region;
  secondary (`.secondaryButton`) for everything else; text button (`.textButton`) for
  low-emphasis inline actions such as "Save selected settings as default"; a row that opens
  where its value is changed (the Live checklist) ends in a chevron link (`.rowLink`);
  `.dangerOutlineButton` to start a destructive or irreversible action and `.dangerButton` to confirm it. **All buttons are
  the same size** (`--control-height`, `--text-base`); emphasis comes from colour, never
  from size. Never give a button its own height, padding, font size or minimum width, and
  never add a size modifier. A disabled button always has visible text nearby saying why.
- **Settings layout.** Every Settings section (and a selected transcript) is a header, then
  titled groups, then one **Save for everyone** bar, built from `SettingsParts.tsx`. Never
  nest a card inside a card.
- **Forms.** The label sits above its control, the hint below. Every input has a
  `name` and `autocomplete="off"` unless it is an authentication field; turn spellcheck
  off for names and codes. Errors appear inline next to the field and name the fix.
  Checkboxes and their text share one click target.
- **Status pill.** One per screen, in the top bar: dot plus word ("Ready", "Live ·
  12:48", "Paused", "Not ready"), coloured by the roles above, with
  `role="status"` so screen readers hear the change.
- **Banners.** Full width, above the content they concern, with at most two actions.
  Error banners use `role="alert"`; warning and info banners do not interrupt.
- **Dialogs.** Only to confirm a destructive or irreversible action (End session, Delete
  transcript, Replace link). `role="alertdialog"`, focus moves in, Escape cancels, the
  action button sits on the right.
- **Disclosures.** Advanced or rarely used options sit behind `<details>`, named for
  the situation ("Reader link shared by mistake?", "Check captions before they
  show"), never "More options".
- **Tabs and navigation.** Mark the current item with `aria-current="page"` (or
  `aria-selected` inside a `tablist`). Keep each view reachable by a `#` link so it can
  be bookmarked and refreshed.
- **Empty states.** Say what is missing and how to get it: "No saved transcripts yet. Tick
  ‘Save the transcript’ before you start a session."
- **Live controls.** While a session runs, Pause/Resume, Clear screen and End session
  stay in one place on screen. End session is visually separated from Pause and Clear.

## Icons

- Inline SVG, drawn with strokes in `currentColor`, 18–22px, stroke width 1.8–2.2,
  round caps and joins.
- Decorative icons are `aria-hidden="true"`. An icon-only button has an `aria-label`.
- No emoji or Unicode glyph stands in for an icon. No photos or illustrations on
  operator surfaces.

## Motion

- Motion only explains a change of state: a meter moving, a tab switching, a pending
  change pulsing. Never decoration.
- At most 200ms, animating colour, opacity or transform. List the properties; never
  `transition: all`.
- Under `prefers-reduced-motion: reduce`, drop the animation and keep the end state.

## Themes

- Light is the default; dark follows the system or the operator's choice on this
  computer. The mechanism is in the design system's "Themes".
- Every new colour token gets a value in both palettes in the same commit, and the
  change is checked in both.
- The phone viewer and reader follow the system setting only. The OBS overlay is
  always transparent and never themed.

## Accessibility baseline

On top of the rules above:

- A "Skip to main content" link is the first focusable element.
- Headings are hierarchical, with one `h1` per screen.
- Every interactive element is a real `<button>`, `<a>`, `<input>`, `<select>` or
  `<textarea>`; never a `div` or `span` with a click handler.
- Visible `:focus-visible` outline in `--focus`; never remove an outline without a
  replacement.
- Async results ("Copied", "Saved", status changes) are announced with
  `aria-live="polite"`.
- Zoom is never disabled.

## Known differences in the current UI

None are open. The phone remote now says "Pause" and "Clear screen", and the one Terms
list and shared church setup shipped with
[ADR 0022](decisions/0022-shared-church-setup-and-words-list.md). Record any new
difference here, fix it when the screen is next changed, and don't copy it into new work.

## Checklist for every UI change

1. Only tokens: no new hex, rgb or pixel type size.
2. Sentence case, glossary words, buttons that name the outcome.
3. One primary action per region; disabled actions say why.
4. Works at 1920, 1200, 390 and 320px, in light and dark (`npm run qa`).
5. Keyboard reachable with visible focus; status changes announced.
6. The design system and this guide still describe what you built; update them in the
   same commit if not.
