# 02-app-shell

Read AGENTS.md first and follow it strictly.

Implement only the dashboard app shell — sidebar, breadcrumb row and page container — exactly as shown in the attached designs. Create the four dashboard routes with simple placeholder pages for now.

Do not implement any page UI yet. No tables, no forms, no cards beyond what the shell itself needs.

## Route structure

Create the `(dashboard)` route group with these routes, each rendering a placeholder page that shows only its breadcrumb and page title:

```txt
app/(dashboard)/layout.tsx        # shell — sidebar + breadcrumb + container
app/(dashboard)/page.tsx          # Dashboard
app/(dashboard)/books/page.tsx    # Books
app/(dashboard)/uploads/page.tsx  # Uploads
app/(dashboard)/settings/page.tsx # Settings
```

Redirect `/` to the Dashboard route. Delete the temporary `/design-system` route created in the previous prompt.

## Sidebar

200px fixed width, `sidebar` background, spanning the **full viewport height** with no gap at the bottom.

The "NovelNow" wordmark sits at the top in white, 16px / 600, left-aligned with the nav items below it.

Four nav items in this fixed order, each with an icon to the left of its label: **Dashboard, Books, Uploads, Settings**.

Item states:

- inactive — label and icon in a muted light tone against `sidebar`
- hover — subtly lighter background, no movement, no border change
- active — `sidebar-active` background, white label and icon, plus a 2px `primary` indicator bar on the left edge of the item

Active state derives from the current pathname. A nested route marks its parent active — `/books/<id>` and `/books/<id>/chapters/<n>` both keep **Books** active.

Nav items are 40px tall with 8px vertical rhythm between them.

## Breadcrumb row and page container

The breadcrumb row sits **inside the main content area**, not in the sidebar, above the page title.

Breadcrumbs render as `Books / The Alpha King's Ugly Bride / Chapter 12` — segments separated by a **single** separator, in `muted`, 12px, with all but the last segment being links. The last segment is not a link.

Main area uses `page` background, 32px padding, and a content container capped at 1040px max width, left-aligned within the main area.

Beneath the breadcrumb, the page title renders at 24px / 600 in `text`, with an optional muted sub-line beneath it and an optional right-aligned action slot on the same row as the title. The shell provides these as slots; the placeholder pages pass only a title.

## Overrides — deviate from the attached designs here

- The Books list and Chapter editor frames show a **three-item sidebar with no Dashboard**. Those frames are stale. Build the four-item sidebar shown in the Dashboard and Settings frames.
- The sidebar stops short of the frame bottom in several frames. It must be full height.
- Some frames show a **doubled breadcrumb separator**. Use exactly one separator between segments.
- The Dashboard and Settings frames clip the primary button and right-hand content at the frame edge. That is frame cropping, not layout — the container must fit its content with the primary action fully visible.

## Constraints

- Server Components for the shell. Use a Client Component only for the nav, and only because active state needs the pathname.
- Flat surfaces. No shadows, no gradients. 1px borders maximum.
- The shell owns no data fetching. It renders structure and children only.
- Do not add a collapse toggle, a search field, a user menu, a notification bell, or a theme switcher to the sidebar. None of those are in scope.
- Desktop only at 1440 × 1024. Do not add mobile breakpoints or a drawer.
- Use the tokens, type utilities and layout constants from the design system prompt. No new raw hex.

## Verification

Navigating between all four routes keeps the sidebar fixed and highlights exactly one item. Visiting a nested path such as `/books/test` keeps **Books** active and renders its breadcrumb with a single separator.

Run `npm run lint` and `npm run typecheck` and fix everything before finishing.

@"/c:/Users/PC/Desktop/story-app-dashboad/material/1.png"
@"/c:/Users/PC/Desktop/story-app-dashboad/material/5.png"
@"/c:/Users/PC/Desktop/story-app-dashboad/material/4.png"
