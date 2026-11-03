---
name: Deep
description: Seer's app for contests of markets with many outcomes. Electric Foundation hairline surfaces, the answer read across the whole field before the trade.
colors:
  primary: "#7d33ff"
  primary-hover: "#6925df"
  primary-text: "#6c2bd9"
  primary-text-dark: "#b18aff"
  primary-text-hover: "color-mix(in oklab, #6c2bd9 80%, #17171c)"
  primary-bg: "#efe9fc"
  primary-bg-dark: "#241e33"
  primary-rule: "color-mix(in oklab, #7d33ff 40%, transparent)"
  long: "#13795b"
  long-dark: "#3ecf8e"
  long-hover: "color-mix(in oklab, #13795b 85%, #17171c)"
  long-bg: "color-mix(in oklab, #13795b 10%, transparent)"
  long-rule: "color-mix(in oklab, #13795b 40%, transparent)"
  short: "#c0283f"
  short-dark: "#ff6b81"
  short-bg: "color-mix(in oklab, #c0283f 10%, transparent)"
  short-rule: "color-mix(in oklab, #c0283f 40%, transparent)"
  series-up: "#7d33ff"
  series-up-dark: "#8f55f7"
  series-down: "#b8860b"
  series-down-dark: "#b5850f"
  series-3: "#2a78d6"
  series-3-dark: "#3987e5"
  series-4: "#d55181"
  paper: "#f7f7f9"
  paper-dark: "#101013"
  surface: "#ffffff"
  surface-dark: "#1a1a1e"
  sunken: "#f1f1f4"
  sunken-dark: "#1f1f24"
  rule: "#e2e2e9"
  rule-dark: "#34343c"
  rule-strong: "color-mix(in oklab, #17171c 25%, #e2e2e9)"
  ink: "#17171c"
  ink-dark: "#ededf2"
  ink-2: "color-mix(in oklab, #17171c 80%, #5c5c66)"
  ink-3: "#5c5c66"
  ink-3-dark: "#a8a8b3"
  ink-4: "color-mix(in oklab, #5c5c66 90%, #f1f1f4)"
  seer-ink: "#141223"
  on-ink: "#f2edff"
  on-ink-muted: "#b9b1ca"
typography:
  display:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.4rem + 1.6vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "32px"
  subtitle:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "28px"
  lede:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "21px"
    fontFeature: "tnum"
  data:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
    fontFeature: "tnum"
  label:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.05em"
  micro:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  button:
    fontFamily: "'Open Sans Variable', 'Open Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  control: "4px"
  surface: "10px"
  full: "9999px"
spacing:
  container: "86rem"
  gutter-phone: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "32px"
  header: "64px"
  page-block: "32px"
  stack: "24px"
  surface-pad: "24px"
  cell-x: "24px"
  cell-x-phone: "12px"
  cell-y: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    textColor: "{colors.primary-text}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.sunken}"
  button-ghost-current:
    backgroundColor: "{colors.primary-bg}"
    textColor: "{colors.primary-text}"
  button-sm:
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-success:
    backgroundColor: "{colors.long}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "40px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.short}"
    rounded: "{rounded.control}"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.surface}"
    padding: "24px"
  card-header:
    typography: "{typography.title}"
    padding: "20px 24px"
  table-header-cell:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    padding: "12px 24px"
  table-cell:
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    padding: "16px 24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "10px 12px"
    height: "44px"
  badge-neutral:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "2px 8px"
  badge-long:
    backgroundColor: "{colors.long-bg}"
    textColor: "{colors.long}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "2px 8px"
  badge-short:
    backgroundColor: "{colors.short-bg}"
    textColor: "{colors.short}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "2px 8px"
  segment-active:
    backgroundColor: "{colors.primary-bg}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  contest-tab-active:
    textColor: "{colors.primary-text}"
    typography: "{typography.lede}"
    padding: "12px 16px"
  outcome-bar-track:
    backgroundColor: "{colors.rule}"
    rounded: "{rounded.full}"
    height: "8px"
    width: "120px"
  outcome-bar-up:
    backgroundColor: "{colors.series-up}"
    rounded: "{rounded.full}"
    height: "8px"
  outcome-bar-down:
    backgroundColor: "{colors.series-down}"
    rounded: "{rounded.full}"
    height: "8px"
  prediction-tick:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.full}"
    width: "2px"
    height: "16px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.data}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  promo-field:
    backgroundColor: "{colors.seer-ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: Deep

## Overview

**Creative North Star: "The Ranked Field"**

Deep is a working surface for contests that price dozens of outcomes at once (98 repositories in Round 3). Its world is Electric Foundation from `@seer-pm/ui-kit`, applied as an operating app: a cool grey page, white surfaces on hairlines, Open Sans at every size, purple for the one action that matters. The reading comes before the trade. A contest page opens on its question as the page's own heading, one sentence of live answer, and who asks and resolves; then the whole field, ranked, each row carrying its two-sided reading on one bar. Any single series is detail on demand.

Density is high but calm. Rows are 14px tabular text with 16px of vertical padding, peers are separated by hairlines, and color is spent only where it means something: purple for action, green and red for the direction of a trade or a result, the kit's series colors for the identity of a followed line or a side of a pair. Everything else is the grey ramp. The app follows the reader's light or dark theme through the kit's `data-theme`, and every Deep token is a semantic name mapped onto a kit token, so both themes hold without a second palette.

**Who owns what.** Color, radius, font, motion, the button, field and dialog classes, the lockup, the theme toggle, the line motif (`BrandStreak`) and the ecosystem footer belong to `@seer-pm/ui-kit` (version 0.4.0, vendored as `vendor/seer-pm-ui-kit-0.4.0.tgz`; source and README at `packages/seer-pm-ui-kit` in the seer-pm monorepo). Deep's layer lives in `src/index.css`: an `@theme inline` block of semantic names (`paper`, `ink-2`, `long`, `primary-text`, …) over `var(--seer-*)`, a role-named type scale, one overlay shadow and the dialog entrance. The frontmatter resolves those names to the kit's light values (and dark values under `-dark` keys) so tools can read them; when the frontmatter and the kit disagree, the kit is right and this file is stale.

**Key Characteristics:**

- Hairline surfaces on a grey page: white cards with a 1px rule at 10px radius, no shadow at rest.
- Three color meanings and no fourth: primary for action, long and short for direction, series for identity.
- A two-sided reading is one bar: UP in series purple from the left, DOWN in series gold from the right, the reader's prediction as an ink tick.
- Muted context lines with at most four followed series in color.
- Tabular figures across the whole document; every number is printed, so color is never the only channel.
- Theme-following in both directions, with one ink field (the Seer promo) and the kit footer that stay ink in both themes.

## Colors

A grey ramp carrying nearly everything, Electric Purple for action, a green and red pair for direction, and the kit's validated series set for identity. Every value comes from the kit's `tokens.css`; Deep only names and mixes them.

### Primary

- **Electric Purple** (`primary`, `--seer-brand-purple`): the primary button fill, the active contest tab's underline, the current step marker in the readiness rail, the toast progress bar and the current page in pagination. One solid purple action per region.
- **Pressed Purple** (`primary-hover`): the primary button's hover fill only.
- **Link Violet** (`primary-text`, Bright Violet `primary-text-dark` in dark): purple as text, at 4.5:1 in both themes. Active tab labels, the Guide link, ghost actions that lead somewhere (Clear, Max), selected checkmarks, the focus ring. `primary-text-hover` mixes it 20% toward ink.
- **Lilac Wash** (`primary-bg`, Ink Wash in dark): the selected state behind a ghost control: the current header page, the active segment of a segmented control.

### Secondary

- **Ledger Green** (`long`): the positive direction. Undervalued, buy, a gain, succeeded, and a contest that is still trading (the Live tag and its pulsing dot). Its 10% fill (`long-bg`) and 40% border (`long-rule`) make the long badge; the solid fill carries `paper` text, never white, because white on the dark theme's green reads at 2:1.
- **Signal Red** (`short`): the negative direction. Overvalued, sell, a loss, failed, caution. Same 10% fill and 40% border for badges; the danger button is its text on a `short-rule` inset hairline.

### Tertiary

- **Series Purple** (`series-up`, `--seer-series-1`) and **Series Gold** (`series-down`, `--seer-series-2`): the two sides of one reading (UP and DOWN, matching Futarchy's pass and fail), and the first two followed lines on a chart.
- **Series Blue** (`series-3`) and **Series Rose** (`series-4`): the third and fourth followed lines. The four slots are validated by the kit as a set and are never cycled.

### Neutral

- **Cool Paper** (`paper`): the page ground and the sticky header. Also the text on solid status fills and on the tooltip.
- **Surface White** (`surface`): cards, menus, popovers, dialogs, toasts, pinned table cells.
- **Raised Grey** (`sunken`): table header rows, row and menu-item hover, the segmented control's tray, neutral badges.
- **Hairline Grey** (`rule`) and **Firm Hairline** (`rule-strong`, ink mixed 25% into the rule): every divider and card border; `rule-strong` for the contest tab strip's baseline, the unfollowed swatch ring and the delta spine.
- **The ink ramp** (`ink`, `ink-2`, `ink-3`, `ink-4`): headings and emphasized values; body text (the document default); secondary copy, captions and table header labels; the faintest step (empty values, placeholders, chevrons), which still holds 4.5:1 on Raised Grey in both themes.
- **Foundation Ink** (`seer-ink`), **Lilac White** (`on-ink`), **Dusk Grey** (`on-ink-muted`): the ink field of the Seer promo and the dialog backdrop (ink at 56%).

### Named Rules

**The Kit Owns the Value Rule.** Every color in Deep is `var(--seer-*)` or a `color-mix` of two of them. A new color is a new kit token, added in the kit, never a literal in this repo.

**The Three Meanings Rule.** Purple is action, green and red are direction, series colors are identity. A series color never stands for a gain or a loss, a status color never marks a side of a pair, and purple never decorates.

**The Fixed Ink Rule.** The Seer promo and the ecosystem footer are ink in both themes. An ink field sets `data-theme="dark"` so kit controls on it take the dark tokens whatever the page theme.

## Typography

**Display Font:** Open Sans Variable (with Open Sans, ui-sans-serif, system-ui), self-hosted by the kit
**Body Font:** Open Sans Variable, the same family
**Label/Mono Font:** the system monospace stack, for wallet addresses, hashes and file contents only

**Character:** One humanist sans at small, dense sizes. Hierarchy comes from size and from weight 600 or 700 against 400; case changes only for the small label role.

### Hierarchy

- **Display** (600, `clamp(2rem, 1.4rem + 1.6vw, 2.5rem)`, 1.1, -0.025em): the contest question, the page's H1, held to 24ch with balanced wrapping.
- **Title** (700, 24px / 32px): card headings ("Original work per repository", "Leaderboard · All deep markets"), stepping to Subtitle on a phone.
- **Subtitle** (700, 20px / 28px): card headings below 640px, one step under the 32px page heading.
- **Lede** (400, 16px / 24px): the live answer under the question (held to 68ch, key values in `ink` at 600), contest tab labels at 600, amounts typed into a field, the promo's lead line at 600.
- **Body** (400, 14px / 21px): the document default, in `ink-2`. Table cells, descriptions, menu items, the predictions count.
- **Data** (600, 14px / 20px): figures that are read, not run: the UP price beside a bar, legend values, tooltip text.
- **Label** (600, 12px / 16px, 0.05em, uppercase): table column headers, badges, the Live tag and the network tag beside the lockup. Always attached to the thing it names, never above a heading.
- **Micro** (400, 12px / 16px): the brief's fact labels, a phone row's prediction line, table footnotes, "Following 3 of 4".
- **Button** (600, 14px, 1.2, from the kit; 13px at the small size, 15px at the large).

### Named Rules

**The Tabular Document Rule.** `body` sets `font-variant-numeric: tabular-nums`, so every price, weight, balance and rank lines up in its column and does not jitter as prices move.

**The Role Name Rule.** Sizes are chosen by role (`text-body`, `text-data`, `text-label`, `text-micro`, `text-lede`, `text-title`), not by Tailwind's numeric steps. A size outside the roles is a new role, named in `src/index.css`.

## Layout

One centered column: `max-width: 86rem` with gutters of 16px, 24px from 640px and 32px from 1024px (`CONTAINER` in `App.tsx`). The header and the footer take the same column so their edges line up with the content. `#root` is the scroll container, not the document, so locking scroll for a dialog never reflows the page; sticky headers resolve against it.

The header is a sticky 64px band on `paper` with a bottom rule. The main column pads 32px top and bottom and stacks its blocks 24px apart. A contest view runs, top to bottom: the readiness rail (only until the wallet is ready), the contest tab strip, the brief, the predictions toolbar, the ranked field, the history chart, the Seer promo (live contests only).

Breakpoints are Tailwind's (640, 768, 1024px):

- **Under 640px:** the contest field becomes an ordered list (name, bar, then the prediction line) showing the first 10 rows with a full-width "Show all"; the brief's facts collapse into one line of micro text separated by middle dots; the tab strip scrolls sideways; dialogs become bottom sheets; table cells pad 12px sideways instead of 24px.
- **From 768px:** the chart's legend stands beside the chart (240px wide, 440px tall together) instead of a 256px band below it.
- **From 1024px:** the brief's facts move into an 18rem column beside the question, divided by a vertical hairline, so the field's first rows reach the first screen; header pages, Guide and the theme toggle leave the menu and sit in the bar.

Inside surfaces: card padding 24px, card header 20px by 24px, table cells 16px by 24px, menu items 10px by 16px. Smaller gaps follow a 4px rhythm (4, 8, 10, 12, 16, 24).

### Named Rules

**The Shared Column Rule.** Header, content and footer share one container and one set of gutters. Nothing runs full-bleed except the footer's ink band.

**The Field in the First Screen Rule.** On a contest page, controls that sit between the brief and the field cost one line, not a padded box (the predictions toolbar is a ruled strip, not a card), so the field's first rows stay in view.

## Elevation & Depth

Flat and hairlined. Surfaces separate from the page by the step from `paper` to `surface` and a 1px `rule` border, never by a shadow. Inside a surface, depth is one tonal step to `sunken` for header rows and hover. Only what floats over the page casts a shadow.

### Shadow Vocabulary

- **Pop** (`box-shadow: 0 12px 32px rgb(20 18 35 / 0.16), 0 2px 6px rgb(20 18 35 / 0.08)`): menus, popovers, tooltips, toasts and dialogs. Nothing at rest.

### Named Rules

**The Hairline Surface Rule.** A surface at rest has a 1px rule and no shadow. A shadow means the element floats above the page and will go away.

**The Opaque Bar Rule.** The sticky header is opaque `paper`, never frosted: a persistent backdrop filter re-composites the page under it on every scroll.

## Shapes

The kit's three radii and nothing else: 4px (`control`) for buttons, badges, segments, tooltips and legend rows; 10px (`surface`) for cards, menus, dialogs, toasts, inputs and the promo field; full pills for bars, swatches, status dots and step markers. Tailwind's named radii resolve onto these (`rounded-md` and below to 4px, `rounded-lg` and up to 10px). A dialog on a phone keeps its 10px top corners and squares its bottom edge against the screen.

Lines are 1px hairlines throughout. Selected tabs take a 2px underline that overlaps the strip's baseline. Bars are 8px pills; where two marks meet (the DOWN segment, the prediction tick) a 2px `surface` ring keeps them apart.

## Components

### Buttons

The kit's `.seer-button`, mapped by `src/components/ui/Button.tsx`: solid, compact, no motion beyond a 150ms color change on the kit's ease-out.

- **Shape:** gently squared (4px). Heights 32, 40 and 48px for `sm`, `md`, `lg`; icon buttons are square at the same heights.
- **Primary:** Electric Purple, white 600 14px text, 16px side padding. One per region: Connect wallet, the current onboarding step, the run.
- **Secondary (Deep's default variant):** the kit's outline: transparent with `ink` text on a 1px inset `rule` hairline, turning Link Violet (hairline and text) on hover. Upload, Replace file, Show all.
- **Ghost:** transparent, `sunken` on hover. Toolbars, rows, dialog headers, header navigation; the current header page fills Lilac White with Link Violet text.
- **Success / Danger:** Deep's own. Success is a solid `long` fill with `paper` text; danger is `short` text on a `short-rule` hairline, filling `short-bg` on hover.
- **Focus:** the kit ring, 2px Link Violet outline at 3px offset.
- **Disabled with a reason:** a disabled button that has a reason stays focusable, blocks its action and shows the reason in a tooltip. Loading keeps full opacity; the kit draws a spinner before the label and the width holds.

### Badges and Status

- **Badge:** label type (12px 600 uppercase, 0.05em) at 4px radius, 2px by 8px, with a 1px border. Neutral (`sunken` fill), long and short (10% fill, 40% border), quiet (no fill, `ink-4`).
- **Status dot:** an 8px circle. Green and pulsing for a contest that trades; `ink-4` for one that has ended.

### Cards / Containers

- **Corner Style:** 10px.
- **Background:** `surface` on `paper`.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px `rule`.
- **Internal Padding:** 24px, or flush when the card holds a full-bleed table. The card header is a ruled band (20px by 24px) with the title, a 14px `ink-3` description and actions to the right.

### Inputs / Fields

- **Style:** the kit's `.seer-input`: 44px tall, 1px `rule` border, 10px radius, `surface` fill, 15px text, 10px by 12px padding. Input groups hold a leading icon or a trailing unit and Max action.
- **Focus:** 2px Link Violet outline at 2px offset, the border turning Link Violet.
- **Error / Disabled:** `short` border with a 13px 600 error line; disabled fills `sunken` with muted text.
- **Labels:** 13px 600 `ink` above, 13px `ink-3` hints below.

### Navigation

- **Header:** the kit lockup with "Deep" as the app name, the network tag in label type, then Markets, Leaderboard and Profile as ghost buttons, Guide in Link Violet, the kit theme toggle, and the wallet last. Below 1024px everything but the lockup and the wallet folds into one menu (surface, 10px radius, pop shadow, 10px by 16px rows hovering to `sunken`, the current page in Link Violet 600).
- **Contest tabs:** lede-size 600 labels on a `rule-strong` baseline, the active one in Link Violet with a 2px Electric Purple underline. Live contests carry a pulsing green dot and a green Live tag; ended contests sit behind one Archive menu that shows an Ended badge when one is open.
- **Segmented control:** a `sunken` tray with a hairline at 4px radius; the active segment fills Lilac White with Link Violet text.
- **Footer:** the kit's `EcosystemFooter`, ink in both themes, aligned to the page column through `--seer-footer-gutter` and `--seer-footer-max-width`, with Deep's own group (Markets, Leaderboard, Guide) first.

### Tables

Sticky `sunken` header rows of label-type column names with an always-visible sort chevron (dimmed to 30% when inactive, the active column in `ink`). Body rows are 14px `ink-2` on hairlines, hovering to `sunken`; the first column can pin with a hairline on its right. Long tables sit in a bounded scroll box with a surface fade at the bottom, or paginate. Empty values print a dash glyph in `ink-4`.

### Outcome Bar (signature)

The two sides of one reading on one 0 to 1 scale, 120px wide by default (150px in a phone row) and shared down a column so bars compare. The UP price prints to the left in data type and `ink`, the DOWN price to the right in `ink-3`. UP fills Series Purple from the left edge and DOWN fills Series Gold from the right, both at their raw prices on an 8px `rule` track, so a gap shows when the pair sums to less than 1 and an overlap when it sums to more. The reader's prediction is a 2px ink tick, 4px taller than the bar on each side, ringed in `surface`. When predictions load, every tick eases in from the bar's origin over 700ms on the kit's ease-out: the one authored motion moment, and it honors reduced motion. A market with no pool shows a quiet "No pool" badge instead.

### Contest Brief (signature)

The top of a contest, on the page and not in a card: the question in display type, the live answer in lede, and the facts (Asked by, Resolved by, the count, Status) as a definition list. The facts sit in a 4-column grid under a hairline from 640px and in an 18rem column behind a vertical hairline from 1024px; labels in micro `ink-3`, values in 600 `ink`.

### Followed Series (signature)

The chart (`MarketChart`, a canvas that reads the kit tokens from `<html>` on every theme change) draws every outcome as a 1px muted line at 30% opacity, falling to 14% while another line is hovered. Up to four followed series take the series slots at 2px with a label at the line end; the hovered line goes to 3px in `ink` (or its slot color) and draws on top. A slot keeps its series until it is unpinned. The chart opens on the three leaders, leaving a slot free. Grid lines are sparse dots in `rule`; axis text is 12px `ink-3`.

The legend beside it is a searchable list sorted by current price: a 10px swatch (filled in the slot color when followed, a `rule-strong` ring when not), the name in data type (`ink` 600 when followed, `ink-2` otherwise) and the value in `ink-3`. The field's rows carry the same swatch as a follow toggle, so following works from the table or the legend and the swatch is the key in both. Column groups above the UP and DOWN columns carry a 12 by 8px swatch of their series color for the same reason.

### Delta Cell

A difference is drawn as well as printed: a 72px gutter with a `rule-strong` centre spine, a 6px bar growing right in `long` when the market underprices and left in `short` when it overprices, scaled to the largest delta in the set, and the signed value in 600 of the same color. The sign is always printed.

### Readiness Rail

The three steps to a first trade (connect, create a trade wallet, add sUSDS) in one card divided by vertical hairlines, each led by a 24px circular marker: Electric Purple with its number for the current step, green with a check when done, a `rule-strong` ring when to do. Only the current step shows its action. On a phone only the current step shows, marked "Step 1 of 3". The rail disappears once the wallet is ready.

### Seer Promo

An ink field at 10px radius and 24px padding, `data-theme="dark"`, with the kit's `BrandStreak` line motif in Signal Purple at 40% opacity converging on the action and masked out behind the copy. A 600 lede line in Lilac White, a body line in Dusk Grey and the kit's secondary button. Shown only on live contests.

### Dialogs, Menus, Tooltips, Toasts

Dialogs are `surface` panels at 10px radius with the pop shadow over a 56% ink backdrop, using the kit's dialog header, body and footer; they rise 12px over 240ms on desktop and slide up as a sheet on a phone. Tooltips are inverted (`ink` fill, `paper` 14px 600 text, 4px radius, 320px max). Toasts are surface cards on a hairline, 380px wide, where the icon and a 3px progress bar carry the tone.

### Named Rules

**The Pair Bar Rule.** A two-sided reading (UP and DOWN, pass and fail) is one bar on one scale with both sides at their raw price, Series Purple from the left and Series Gold from the right. Never two separate bars, never status colors.

**The Four Followed Rule.** A chart with many series draws them all as muted context and follows at most four in color, one per series slot, in slot order. A fifth is refused, not cycled.

**The Printed Number Rule.** Color is never the only channel: every bar prints its values, every delta prints its sign, every status dot sits beside its word.

## Do's and Don'ts

### Do:

- **Do** take every color, radius, font and motion value from `@seer-pm/ui-kit` through Deep's semantic names in `src/index.css`, and change a shared value in the kit's package, never here.
- **Do** open a contest page on its question, the live answer and who asks and resolves, then the ranked field; the trading tools follow.
- **Do** draw a two-sided price as the Outcome Bar, with the reader's prediction as a tick on the same scale.
- **Do** keep surfaces on 1px hairlines at 10px radius and reserve the pop shadow for things that float.
- **Do** put solid status fills under `paper` text, not white.
- **Do** set `data-theme="dark"` on any ink field, and read chart colors from the kit tokens on each theme change.
- **Do** move state over 150ms on the kit's ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), keep the prediction tick as the one authored motion, and let spinners and pulses keep turning (slowed) under reduced motion.
- **Do** give a disabled action its reason in a tooltip and keep it focusable.

### Don't:

- **Don't** write a literal color, radius or font in a component, or redefine a `--seer-*` value in this repo.
- **Don't** use a series color for a gain or loss, or green and red for a side of a pair.
- **Don't** follow more than four series in color, or give every line in a field its own hue.
- **Don't** put a shadow on a card at rest or frost the sticky header.
- **Don't** box a toolbar or a single row as a card; peers sit on hairlines.
- **Don't** put a small uppercase label above a heading. The label role names a column, a badge or a tag, beside or above the values it names.
- **Don't** let a color carry a number on its own; print the value and its sign.
