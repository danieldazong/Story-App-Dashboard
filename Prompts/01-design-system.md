# 01-design-system

Read AGENTS.md first and follow it strictly.

Implement the full admin design system using Tailwind CSS. Set up the token config, global CSS utilities, font loading, and initialise shadcn/ui with the base primitives. There is no design-system image for this surface — the tokens below are the source of truth and must be implemented exactly as specified.

## Design tokens

Add these as named colors in `tailwind.config.ts`. Raw hex must appear in this file and nowhere else in the codebase.

| Token            | Hex       |
| ---------------- | --------- |
| `page`           | `#FBF9F7` |
| `card`           | `#FFFFFF` |
| `border`         | `#E7E1DC` |
| `primary`        | `#E8663F` |
| `primary-hover`  | `#D4552F` |
| `text`           | `#1A1420` |
| `muted`          | `#6E6478` |
| `sidebar`        | `#1F1530` |
| `sidebar-active` | `#2C1E42` |
| `status-ok`      | `#2F8C7F` |
| `status-warn`    | `#B07C2E` |
| `destructive`    | `#C0432F` |

Expose them as CSS custom properties in `globals.css` and consume them from the Tailwind config, so shadcn primitives can be restyled through tokens rather than forked.

## Typography

Load Inter as the default sans family and JetBrains Mono as the mono family using `next/font/google` in the root layout. Set Inter as the `font-sans` default on `<body>`.

Define these as reusable type utilities:

- page title — 24px / 600
- section label — 13px / 600, uppercase, letter-spacing tightened slightly, color `muted`
- body — 14px / 400
- table header — 12px / 600, uppercase, color `muted`
- helper text — 12px / 400, color `muted`
- mono — JetBrains Mono, 13px / 400, used for durations, file names, byte sizes, IDs and timestamps

JetBrains Mono is never used for prose or labels.

## Layout constants

Encode these in the Tailwind theme as named spacing, sizing and radius values so pages consume them by name rather than by magic number:

- sidebar width 200px, full viewport height
- max content width 1040px
- page padding 32px
- card radius 8px
- input height 40px, input radius 8px
- table row height 48px
- spacing grid in increments of 8px

## Global utilities

Create reusable class patterns in `globals.css` using the BEM method for the repeated structures this dashboard is built from. At minimum:

- a card surface — `card` background, 1px `border` border, 8px radius, no shadow
- a card header row — title plus optional right-aligned actions
- a card sub-line — helper text beneath a card heading
- a field group — label, control, helper line beneath
- a table wrapper that clips to the card bounds so no column can overflow it
- a status pill — labelled, with `ok`, `warn` and `destructive` variants
- a segmented control — selected option dark-filled with light text, unselected white with a `border` border

## shadcn/ui

Initialise shadcn/ui configured against these tokens, then add these primitives via the CLI: `button`, `input`, `textarea`, `label`, `select`, `table`, `badge`, `dialog`, `dropdown-menu`, `switch`, `checkbox`, `separator`, `skeleton`, `sonner`.

Do not hand-roll any of these. Restyle them through Tailwind classes and the token config only — do not fork a primitive to change its appearance.

Configure the button variants so that:

- the primary variant is `primary` background with a **white** label and `primary-hover` on hover
- the outline variant is `card` background with a 1px `border` border and `text` label
- the muted variant is `card` background with a 1px `border` border and `muted` label
- the destructive variant is `card` background with a 1px `destructive` border and `destructive` label

Admin primary buttons take white labels. This differs from the NovelNow mobile app and the two are not interchangeable.

## Constraints

- Flat surfaces only. No shadows and no gradients anywhere in this system.
- Borders are 1px maximum.
- Status is always communicated by a labelled pill, never by color alone.
- Meet WCAG 2.2 AA contrast — 4.5:1 body, 3:1 large text. Verify `muted` on `page` and `muted` on `card` both pass at 14px before finishing.
- Do not build any page UI in this prompt. Deliver tokens, fonts, utilities and primitives only.
- Do not add a charting library, an animation library, or an icon library beyond the one shadcn installs.

## Verification

Create a temporary route at `/design-system` that renders every token swatch, every type utility, every button variant, the status pill variants, the segmented control in both states, an input with label and helper text, a skeleton row, and a table inside a card. This page exists to verify the system visually and will be deleted in a later prompt.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.
