# AGENTS.md — Talebrim Mobile App

You are an expert React Native + Expo engineer helping build a production-quality reading and audiobook app.

You write clean, simple, maintainable code. You prioritize clarity over unnecessary abstraction because this app is built feature by feature and must stay easy to reason about.

You should think like a senior mobile developer, and implement like someone shipping a real consumer product to Google Play.

---

## STOP — five rules that are not negotiable

Read these before writing any code. Each one has already cost this project
real time, or would cost a user's data. They are expanded further down; this
block exists because the detail sits 600 lines away and nobody scrolls.

**1 · The service-role key never enters this app.** Not in `.env`, not behind a
flag, not in a build constant, not "temporarily to test something". It bypasses
every RLS policy in this document. Anything needing it runs in an Edge
Function. If a task seems to require it in the client, the task is wrong.

**2 · Never write to `books`, `chapters`, `app_settings` or `activity_log`.**
This app is a **reader**. Those tables belong to the admin dashboard
(`AGENTS.md`, same repo), which is in production at `talebrim.com`. Create your
own per-user tables; altering theirs breaks a live product.

**3 · Filter `status = 'published'` on every catalog read — or use the views
that do it for you.** A draft is unfinished admin work. `books_catalog` and
`chapters_catalog` exclude drafts by construction, which is why they exist:
a query that forgets the filter cannot leak one.

**4 · A Clerk token carries two different `role` claims, and they are not
interchangeable.** Top-level `role` is always `authenticated` and is what every
policy's `to authenticated` matches. The operator role is the **nested**
`metadata.role`. Conflating them makes `is_admin()` false for everyone and
every policy denies everything. A reader needs only the top-level claim; this
app must never grant `metadata.role`.

**5 · One Clerk application, shared with the dashboard — and the same
instance.** The mobile client is a **Native application** inside the existing
`Talebrim` app, never a second Clerk application: two apps mint two `sub`
namespaces, so the same human becomes two unrelated accounts and no per-user
table can ever be joined across them. Reader-versus-admin is decided by
`metadata.role`, not by which app someone signed into (see Identity model).

The **instance** matters too: the dashboard is on **development** right now
(the production cutover was rolled back on 2026-09-19, cause unresolved).
Different instances mean different user pools — a user who signs in on mobile
would not exist to the dashboard, and vice versa.

> **When reads suddenly return nothing, check the session-token claim first.**
> Both Clerk instances are configured with
> `{"metadata": "{{user.public_metadata}}"}`. Without it, `auth.jwt() ->
'metadata'` is empty and every policy denies everything. It fails closed, not
> open — which is safe, but presents as a total outage rather than a
> permissions error, and has been misdiagnosed as exactly that before.

---

## Project Overview

We are building **Talebrim**, a read-and-listen mobile app for serialized romance, werewolf, vampire and fantasy fiction.

The app serves readers through:

- a text reader with light, sepia and dark modes
- chapter narration audio with background and lock-screen playback
- **read/listen parity** — one bookmark shared between reader and player, in both directions, across devices
- genre-based discovery and search
- a personal library with continue-reading and offline downloads
- rewarded-ad chapter unlocks and an ad-free subscription
- Mature content behind an age gate (**the label is `Mature 18+`** — see Data Contract)

The core differentiator is parity. If a user listens to chapter 12 in the car and opens the reader at home, the text must open exactly where the audio stopped. Architectural decisions defer to that.

Audience: adult women, core 25–44.

---

## Tech Stack

Use the following stack:

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind / Tailwind CSS
- Zustand
- AsyncStorage
- TanStack Query
- Clerk for authentication (`@clerk/clerk-expo`)
- Supabase for database and media storage (`@supabase/supabase-js`)
- `react-native-track-player` for audio playback
- RevenueCat for subscriptions and entitlements
- `react-native-google-mobile-ads` for rewarded ads
- Server-side route handlers or Supabase Edge Functions for secrets and privileged operations

Do not introduce new major libraries unless there is a strong reason.

---

## Development Philosophy

Build feature by feature.

For every feature:

1. Understand the user request.
2. Check this file before coding.
3. Keep the implementation simple.
4. Avoid overengineering.
5. Prefer readable code over clever code.
6. Build the smallest useful version first.
7. Refactor only when repetition or complexity appears.
8. Finish vertically — a screen is done when it renders real Supabase data and handles loading, empty, error and offline states.

---

## Decision Making & Clarifications

If something is unclear or could be improved:

- Proactively suggest better approaches
- If a new library would significantly simplify the implementation:
  - Recommend the library
  - Clearly explain why it is useful
  - Ask the user for permission before adding or installing it

Example:

> "Chapter lists run past 100 rows, so `@shopify/flash-list` would scroll better than `FlatList` here. Do you want me to add it?"

Do not install or use new libraries without user approval.

Also:

- Never replace a documented pattern with a deprecated one, even if an older snippet shows it (see Supabase Rules).
- Never invent product decisions — prices, plan names, discount percentages, chapter counts and free-chapter thresholds come from config or from RevenueCat.

---

## Architecture Guidelines

Use this structure unless there is a strong reason to change it:

```txt
app/
  (auth)/
  (tabs)/
  reader/
  player/
components/
constants/
data/
hooks/
lib/
store/
types/
assets/
```

### app/

Routes and screens only.

Screens compose components and call hooks/stores. They should not contain large reusable UI blocks or business logic.

### components/

Create a component only when:

- it is reused in multiple places
- it makes a screen easier to read
- it represents a clear UI concept like `StoryCard`, `ChapterRow`, `MiniPlayer`, `GenreChip`, `ProgressBar`, `SegmentedControl`, or `PrimaryButton`

Do not create tiny one-off components too early.

When unsure, ask:

> Should this UI be extracted into a reusable component, or should I keep it inside the current screen for now?

---

## UI Implementation Rules (VERY IMPORTANT)

For any UI-related task:

- The goal is to **replicate the provided design exactly**
- Match the UI **pixel-perfectly**

When the user provides a design image:

You MUST:

- match layout exactly
- match spacing and padding
- match font sizes and hierarchy
- match colors precisely
- match border radius
- match alignment and positioning
- match proportions of elements
- replicate all visible UI elements
- match component states: default, pressed, selected, disabled, locked, downloaded, reading
- match which screens show the bottom nav and which show the mini player

Do not approximate. Do not simplify unless explicitly asked.

### What is NOT binding in a design image

The V1 frames were produced by a UI generator. **All content inside them is placeholder** and must never be hardcoded:

- book titles, author names, synopsis and blurb copy, chapter titles
- counts and totals — chapter counts, audio ratios, result counts, footer tallies
- durations, word counts, file sizes
- dates and timestamps
- avatars, user names, email addresses
- prices, plan names, renewal dates, discount badges

All of it renders from Supabase or from seed content. Placeholder values are useful only as a hint at realistic string lengths — build for overflow, truncation and wrapping.

Numeric disagreements between frames (the same serial showing different chapter counts on two screens) are placeholder noise, not defects. Do not reconcile them and do not preserve them as data.

### Known design-file defects — fix, do not replicate

- overlapping elements in places
- mismatched or inconsistent icons
- segmented controls filled on the wrong option; the **selected** option is the filled one

---

## Design System

### Colors

| Token           | Hex       | Use                                                    |
| --------------- | --------- | ------------------------------------------------------ |
| `bg`            | `#150E1F` | Screen background                                      |
| `surface`       | `#1F1530` | Cards                                                  |
| `raised`        | `#2C1E42` | Nav, modals, sheets, toolbars                          |
| `ember`         | `#E8663F` | Primary CTA, progress, active tab                      |
| `ember-pressed` | `#FF8A5C` | Pressed state only                                     |
| `teal`          | `#9FD8D0` | Secondary accent, audio affordances, badges            |
| `blush`         | `#E9A8C0` | Decorative chips and labels only                       |
| `champagne`     | `#F4E3CE` | Serif headings on dark                                 |
| `body`          | `#F7F4F0` | Body text on dark                                      |
| `muted`         | `#A79BB5` | Captions, metadata, inactive nav                       |
| `reader-light`  | `#FBF7F1` | Reader light mode                                      |
| `reader-sepia`  | `#F2E5D0` | Reader sepia mode                                      |
| `ink`           | `#1A1420` | Text on light surfaces **and labels on ember buttons** |
| `destructive`   | `#C9705F` | Sign-out, destructive links                            |

Rules: flat surfaces; no shadows, glows, sparkles or text shadows; **no gradients anywhere except** one soft vertical `#150E1F → #2C1E42` on Now Playing; **exactly one ember element per screen**, on the primary action; blush is decorative only, never body text; status is always a labelled pill, never color alone.

Ember button labels are `#1A1420`. Never white.

### Typography

- Fraunces 600 — titles and headings, in champagne
- Literata 18sp, line-height 1.7 — reader body text only
- Inter 14–16sp — all UI chrome
- Atkinson Hyperlegible Next — optional reader accessibility choice
- No script or decorative fonts

### Layout

393 × 852dp frames, 8pt grid, 16dp side padding, 16dp card radius, pill buttons, 2:3 covers at 12dp radius, 56dp mini player, three-item bottom nav (Discover, Library, Profile) with active ember and inactive `#A79BB5`.

---

## Screen Inventory

> Provenance note: these specs come from the design prompts and design-review notes for this project. Where a design image disagrees, **the image wins for layout and this file wins for tokens** — and flag the conflict rather than silently choosing.

**M1 · Sign In / Sign Up** — Cover collage across the top third. Fraunces headline "Pick up where you left off". Outlined pill buttons for Google and Apple. Email input. Ember pill `Continue with email`. Legal line noting 18+ (see Data Contract on the label-vs-enum split). No bottom nav, no mini player.

**M2 · Onboarding Genre Picker** — Top-third collage. Headline "What do you love to read?". Genre chip grid (Romance, Werewolf, Vampire, Fantasy, Possessive, Billionaire, Dark); selected chips blush-filled, unselected outlined. Step indicator. Ember pill `Start Reading`. Muted `Skip`. Selections seed recommendations; persist them and never re-show the screen.

**M3 · Home / Discover** — Wordmark left; search and notification icons right. Horizontal tab strip (Discover, New, Werewolf, Romance, Vampire, Fantasy) with ember underline on active. Hero card with a single ember `Read or Listen`. Three carousels: Picked for You, Trending Now, New Audio Releases — audio titles carry a teal headphone badge. Mini player above bottom nav. Search icon routes to M8.

**M4 · Story Detail** — Blurred cover backdrop; back and share icons. Centred 2:3 cover. Fraunces title, author beneath. Metadata row: rating · chapters · length · status. Blush genre chips. `Read` ember pill beside `Listen` teal outlined pill. Thin progress line with resume label. Synopsis with `More`. Preview chapter rows with durations and lock icons, ending in an entry point to M9.

**M5 · Reader** — Light mode `#FBF7F1` by default (sepia and dark are user choices). Literata 18sp/1.7. Minimal top bar: back, chapter title, `Aa`. Fraunces chapter heading. Floating bottom toolbar on `#2C1E42` with brightness, `Aa`, bookmark, and a teal Listen icon that hands off to M6 at the equivalent position. Ember progress bar with position label. **No bottom nav, no mini player.**

**M5a · Paywall bottom sheet (over Reader)** — `#2C1E42` sheet, lock icon, headline naming the next chapter. Ember `Watch ad & continue`. Teal outlined `Go Ad-Free`. Muted restore-purchases and manage-subscription links. States the ad-free value proposition before any purchase. Never shown for an already-unlocked chapter.

**M6 · Now Playing** — The app's only gradient. Dismiss chevron. Large square cover with a thin ember rim. Title, author, chapter. Scrub bar with ember track and thumb, elapsed and remaining labels. Transport row: back-15, previous, 72dp ember play/pause with a `#1A1420` icon, next, forward-15. Secondary teal controls: speed, `Sleep timer`, `Read instead` — hands back to M5 at the equivalent position.

**M7 · My Library** — Fraunces title. Segmented toggle (Books / Audiobooks) on a dark track. `Continue` card: cover, title, progress label, ember progress bar, resume button. `My List` as a 3-column cover grid with an ember progress line under each; audiobook items carry a teal headphone badge. Mini player above bottom nav.

**M8 · Search & Results** — Back chevron plus search field in the header. Filter chips, active chip blush-filled. Result count line. Rows: cover thumbnail, title, author, metadata, audio badge where applicable. Recent searches when the query is empty. Needs a real empty state and a distinct no-results state.

**M9 · Full Chapter List** — Sticky header with cover and title. Sort toggle (Newest / Oldest). `Download all`. Long scrolling rows, each in exactly one state with a distinct visual: **Reading Now**, **Unlocked**, **Downloaded**, **Locked**. Bottom bar with `Unlock all chapters` and an ember `Go Ad-Free`. Must be virtualised — serials run well past 100 chapters.

**M10 · Subscription & Manage Plan** — Status card with current plan and renewal date. Switch-plan cards for Weekly, Monthly (blush savings badge) and Yearly (blush "Best value"); active plan carries an ember border. Confirm-change button. `Restore purchases` and `Manage in Google Play`. Muted cancel link. **Every price, plan title, badge percentage and renewal date is dynamic.**

**M11 · Profile & Settings** — Avatar card with name and plan badge. Upsell card with ember `See plans`. Three grouped sections as 56dp rows: Reading (text size, theme, Atkinson Hyperlegible toggle), Account (restore purchases, manage subscription), Support (help, contact). Sign-out link in `#C9705F`. Version string. Mini player above bottom nav. This is the Profile bottom-nav destination.

---

## Image Generation Rules

Do **not** generate, synthesize or substitute artwork, covers, avatars or illustrations. Cover art enters the system only through the admin CMS upload path, and missing art uses the placeholder in `constants/images.ts`.

Do not describe or imply AI-generated imagery in shipped UI copy.

If the user explicitly enables image generation for a local asset:

- match the provided reference exactly — do not change style, colors or composition
- keep consistency with the design system above
- place output in `assets/images/` with clear naming:

```txt
assets/images/
  onboarding-collage.png
  auth-header.png
  cover-placeholder.png
```

Art direction when art is supplied: moody cinematic, moonlit tones, plum / charcoal / amber. No bright stock photography.

---

## Styling Rules

Use NativeWind Tailwind classes for styling strictly. Do not use `StyleSheet` unless the thing cannot be styled with Tailwind classnames.

Prioritize clean, readable mobile UI.

When building from an attached design image:

- match spacing closely
- match typography hierarchy
- match border radius
- match layout structure
- use consistent reusable styles
- make the UI responsive across screen sizes

Design tokens live in `tailwind.config.js` as named colors, so classes read `bg-bg`, `bg-surface`, `text-ember`. **Raw hex appears in exactly one place: the config.**

Prefer reusable class patterns through utilities in `global.css`. If no utility exists and you see a repeated pattern, create one there following the BEM method.

Avoid large inline styles unless required.

---

## NativeWind Rule

Use the NativeWind version already installed in this app.

Before implementing styling or NativeWind-related code:

- Check the current NativeWind version in `package.json`
- Follow the syntax, setup, and patterns supported by that exact version
- Do not use APIs, config patterns, or examples from a different NativeWind version
- Do not upgrade NativeWind unless the user explicitly approves it

Refer to this for more info: https://www.nativewind.dev/v5/llms-full.txt

> Note: NativeWind v5 is a pre-release and its own installation docs state it is not recommended for production; v4.2.x is the stable line. The architecture handover for this project specifies v5. If `package.json` pins v5, confirm that is intentional before relying on v5-only syntax.

---

## Style Exception Rules

Use `StyleSheet` or inline styles for these components/scenarios instead of NativeWind classes:

| Component / Scenario                        | Why                                                                                | Use Instead                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- |
| **SafeAreaView**                            | From `react-native` or `react-native-safe-area-context` — className not supported  | Inline styles or `StyleSheet`         |
| **Button**                                  | Only supports `title` and `onPress` — cannot customize background, border, padding | `TouchableOpacity` with custom styles |
| **KeyboardAvoidingView**                    | Behavior props not supported by className                                          | Inline styles or `StyleSheet`         |
| **Modal**                                   | `visible`, `transparent` props                                                     | Inline styles                         |
| **ScrollView**                              | `contentContainerStyle`, `indicatorStyle`                                          | `StyleSheet`                          |
| **TextInput**                               | Input-specific props like `underlineColorAndroid`                                  | Inline styles                         |
| **Animated.View / Reanimated**              | Animated style values                                                              | `StyleSheet` with animated values     |
| **Dynamic styles**                          | Progress-bar width %, scrub thumb position, computed at runtime                    | `StyleSheet.create()` or inline       |
| **Platform-specific**                       | iOS-only or Android-only props                                                     | Conditional inline styles             |
| **Pressable/TouchableOpacity**              | `style` prop for pressed states                                                    | `StyleSheet`                          |
| **Shadow (iOS/Android)**                    | Different syntax per platform                                                      | `StyleSheet` with platform checks     |
| **Transform arrays**                        | Complex transform combinations                                                     | `StyleSheet`                          |
| **Z-index**                                 | Sometimes needs explicit StyleSheet                                                | `StyleSheet`                          |
| **expo-linear-gradient** (Now Playing only) | Colors are a prop, not a style                                                     | Color array prop                      |
| **react-native-svg props**                  | No className support                                                               | `StyleSheet` or props                 |

### When to Use StyleSheet

- The prop is React Native-specific (not web-equivalent)
- The value is dynamic or calculated at runtime
- Platform-specific behavior is needed
- NativeWind does not map the property to a style

### SafeAreaView Example

```tsx
// ✅ CORRECT - Use inline styles or StyleSheet
import { SafeAreaView } from "react-native-safe-area-context";

function ReaderScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF7F1" }}>
      {/* content */}
    </SafeAreaView>
  );
}

// ❌ INCORRECT - Do not use NativeWind classes
function ReaderScreen() {
  return (
    <SafeAreaView className="flex-1 bg-reader-light">
      {/* content */}
    </SafeAreaView>
  );
}
```

Similarly for the other exception components. Otherwise, always stick to NativeWind utilities.

---

## UI Quality Bar

The app should feel:

- nocturnal
- premium
- immersive
- mobile-first
- visually close to the provided design references

Avoid neon, pastel or girlish treatments.

Use:

- flat plum surfaces
- clear spacing
- progress indicators on everything resumable
- friendly empty states
- large touch targets (≥ 44dp)
- restrained motion; no decorative animation

Every screen implements loading, empty, error and offline states. A spinner on a blank screen is not a loading state — match the surrounding surface.

Meet WCAG 2.2 AA contrast: 4.5:1 body, 3:1 large text.

Before calling a screen done, test the Reader at the largest supported text size and every list at the longest placeholder title.

---

## Image Rule

Use centralized image imports.

Before using any image asset:

1. Check if `constants/images.ts` exists.
2. If it does not exist, create it.
3. Import and export all app images from `constants/images.ts`.
4. Use images through the centralized object.

Example:

```ts
import onboardingCollage from "@/assets/images/onboarding-collage.png";
import coverPlaceholder from "@/assets/images/cover-placeholder.png";

export const images = {
  onboardingCollage,
  coverPlaceholder,
};
```

Use images like this:

```tsx
<Image source={images.coverPlaceholder} />
```

Do not require/import image assets directly inside screens or components unless there is a strong reason.

Remote covers come from Supabase Storage / CDN URLs stored in the database. Render them with `expo-image`, always with a placeholder and a 2:3 aspect ratio. Never hotlink third-party image URLs.

---

## data/

Use this for seed and static content.

```txt
data/
  genres.ts
  seed-catalog.ts
```

Content must be typed. Never inline prose or catalog data into components.

---

## store/

Use Zustand stores here.

Use Zustand for:

- in-flight read/listen parity position
- playback status and scrub position
- reader settings (theme, text size, font choice)
- reader scroll offset
- selected genre chips
- app settings

Use AsyncStorage persistence where needed.

---

## lib/

Use this for external service helpers and pure functions.

```txt
lib/
  supabase.ts
  clerk.ts
  trackPlayer.ts
  revenuecat.ts
  format.ts
  cn.ts
```

No React, no hooks, no JSX in `lib/`.

Never expose secret keys in the mobile app.

---

## State Management Rules

Strict split — violating it causes the parity bug this app exists to avoid.

**TanStack Query** owns all server data: catalog, book and chapter metadata, chapter text, audio URLs, entitlements, unlock records. (Entitlements and unlock records have **no table yet** — see Data Contract.) It also owns offline caching via a persister. Query keys are declared in one place.

**Zustand** owns transient client state, as listed under `store/`.

Use local component state for temporary UI state.

### Read/listen parity — required algorithm

> **No table backs this yet.** `reading_positions` does not exist (Data
> Contract). Steps 1 and 5 work today against Zustand alone; steps 2–4 need
> that table before they can be implemented. Build it first, or parity — the
> feature this app exists for — silently degrades to per-device memory.

1. Write the position to Zustand immediately; local is the source of truth for the current session.
2. Debounce the write to Supabase — on pause, on chapter change, on app background, and on an interval.
3. Resolve conflicts **last-write-wins against the server timestamp**, never the device clock.
4. Store the position chapter-scoped as a pair: audio milliseconds **and** text character offset, plus which mode wrote it last, so a mode switch can map from the authoritative side.
5. Never block the UI on a parity sync, and never lose a local position because a sync failed.

---

## TypeScript Rules

Use TypeScript strictly.

Avoid `any`. No non-null `!` on genuinely nullable values. No `@ts-ignore` without a one-line justification.

Derive row types from the generated `types/database.ts` rather than redeclaring shapes. **Never hand-edit that file.**

Prefer discriminated unions over optional-field soup for asset states (`locked | unlocked | downloaded | reading`).

Keep types simple and readable.

---

## Feature Implementation Rules

When the user asks to build a feature:

1. Read this file first.
2. Identify files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Ensure the feature works end-to-end against real Supabase data.
7. Fix errors before finishing.

---

## Supabase Rules

Create the client with an `accessToken` callback that returns the Clerk session token:

```ts
// lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createSupabaseClient(
  getToken: () => Promise<string | null>,
): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.EXPO_PUBLIC_SUPABASE_URL!,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    { accessToken: async () => (await getToken()) ?? null },
  );
}
```

Get `getToken` from Clerk's `useAuth()`.

### Deprecated pattern — do not use

```ts
// ❌ DEPRECATED — do not reintroduce
createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${clerkToken}` } },
});
```

Supabase documents the former Clerk Integration (project JWT secret + Clerk JWT templates) as **deprecated as of 1 April 2025**, because sharing the project JWT secret with a third party is a poor security practice, rotating that secret causes significant downtime, and minting a separate JWT adds latency versus using Clerk session tokens directly. Projects on the deprecated integration are excluded from Third-Party MAU charges only until at least 1 January 2026.

The architecture handover document for this project contains the deprecated snippet. It is superseded by this section.

### RLS

Identify the caller with `auth.jwt() ->> 'sub'` (the Clerk user ID, stored as `text`, never `uuid`). Roles come from Clerk `publicMetadata` via session-token claims. **RLS is the enforcement boundary** — client-side role checks are UX, not security.

---

## Identity model — ONE Clerk application, role decides access

**Decided 2026-09-20. Do not create a second Clerk application for the mobile
app.** The question was asked and answered; this section exists so it is not
re-litigated.

```
Talebrim  (one Clerk application)
├── Web application     → admin dashboard   → metadata.role = "admin"
└── Native application  → mobile reader     → no role (authenticated only)
```

Both surfaces share one user pool, one issuer, and one session-token claim.

### Why not a separate app for readers

The instinct is reasonable — different audiences, different products. It does
not work against this database:

**Supabase identifies every caller by `auth.jwt() ->> 'sub'`**, and validates
tokens against registered issuers. Two Clerk applications mint **two different
`sub` namespaces**. The consequences are permanent and hard to undo:

- `reading_positions.user_id` would hold ids from one app while
  `activity_log.actor_id` holds ids from the other. They could never be joined
  or compared.
- The same human signing into both surfaces would be two unrelated accounts.
- "Which readers are stuck on chapter 3", or an admin inspecting a reader's
  library, become impossible rather than merely unbuilt.

**The separation you want already exists, and it is not app-level.** It is
`metadata.role`:

| | Token carries | Result |
|---|---|---|
| Reader | top-level `role: "authenticated"`, no `metadata.role` | passes RLS as a reader, `is_admin()` false |
| Admin | both, with `metadata.role: "admin"` | `is_admin()` true, dashboard access |

That guard is verified in production: on 2026-09-19 an uninvited account signed
up through the live site and landed on `Not authorised`. One pool, two levels,
enforced in RLS rather than by which app someone signed into.

**"But there is only one admin" argues the other way.** One Clerk app means one
operator plus N readers in a single pool — ordinary. Two apps means two sets of
SSO credentials, **two session-token claims** (miss one and every policy denies
everything), two instances to keep in step, and two places to debug when auth
breaks.

### When a second app WOULD be defensible

Recorded so this is a judgement rather than a rule: if readers later need a
different MFA posture, a different consumer plan, or you positively want **no**
identity crossover between operators and readers. None of that applies now, and
splitting later is far easier than merging later.

### How to set it up

**Clerk → Talebrim → Configure → Native applications → add one for Expo.**

That yields a publishable key and redirect handling for the native client,
**inside** the existing application. Supabase needs no change — same issuer,
already registered.

⚠️ Point it at the **development** instance. The dashboard is on development
after the 2026-09-19 production rollback (rule 5, and `AGENTS.md` Deferred
Security Task 3). Two halves of one product on different instances means
different user pools, which is the exact failure this section exists to
prevent.

---

## Build order — what to build, and what is blocked

**Do not start with the Reader and the Player.** They are the interesting
screens and they are the blocked ones: both depend on tables that do not exist
and on a storage decision that has not been made. Discovery is unblocked, and
it teaches the data layer cheaply.

### Phase 0 — two decisions, before any code

**1 · Confirm the Clerk instance.** Development, to match the dashboard.
Settle it first or you debug two unknowns at once.

**2 · Decide the audio bucket.** This shapes M6 and the entire download
feature, so it cannot be deferred past Phase 2.

| | Private (today) | Public |
|---|---|---|
| URL | signed, expiring | immutable, CDN-cached |
| Before playback | a round trip to mint one | none |
| Offline download | signature outlives nothing — needs its own scheme | works directly |
| Egress cost | ~$0.09/GB uncached | ~$0.03/GB cached |

`AGENTS.md` already states that `locked` is a paywall state **the app enforces
through entitlements, not a row-level secret** — so making `audio` public is
consistent with the existing security model rather than a weakening of it. It
is still a product decision and it is **not yet made**.

### Phase 1 — build against what exists (unblocked today)

**M1** sign-in · **M3** Discover · **M4** Story Detail · **M8** Search

These run against `books_catalog` and `chapters_catalog` now. Expect a real app
against real data quickly, and expect to learn what the schema actually needs —
which is the point of doing this before Phase 2.

`M2` (genre picker) is unblocked too, but persists to AsyncStorage only until
a profile table exists.

### Phase 2 — the three missing tables

Write these **informed by Phase 1**, not before it. Four product questions have
to be answered first:

1. Does a rewarded-ad unlock **expire**, or is it permanent?
2. Is a reading position **per account** or **per device**?
3. Does `My List` (M7) store **order**, or is it sorted by recency?
4. Does an unlock belong to the **user**, or to the **user + chapter** pair
   with a count (e.g. re-watchable)?

Then: `reading_positions`, `unlocks`, `library_items`.

**Every migration follows the discipline already proven here on 2026-09-20:**

- **Additive only.** No `alter` on `books`, `chapters`, `app_settings` or
  `activity_log`. Those belong to a dashboard running in production.
- RLS on from the start, scoped to `auth.jwt() ->> 'sub'`, so a reader can
  touch only their own rows.
- `supabase db push`, then **regenerate types and diff them** — the proof a
  migration is additive is that the diff shows *only additions*.
- Re-run the dashboard's three gates: `typecheck`, `lint`, `build`.
- Re-run the RLS impersonation test as a non-admin **and** as an admin, so
  both audiences are proven rather than assumed.

### Phase 3 — the blocked screens, now unblocked

**M5** Reader · **M6** Now Playing · **M7** Library · **M9** Chapter List ·
**M5a** paywall · **M10**/**M11** subscription and profile.

Read/listen parity becomes implementable at this point and not before: steps
2–4 of its algorithm write to `reading_positions`.

### Before production — two things to plan for now

**The instance is `t3.nano`.** `AGENTS.md` measures a **~450ms floor for a
trivial query** and concludes that **instance size outranks every code-level
fix**. No schema work makes this feel like a modern app. Budget the upgrade,
and lean on TanStack Query's persisted cache so a warm screen never waits on
the network.

**Seed more content.** One published story, 13 chapters, one with audio. A
Discover carousel, a 100-row virtualised chapter list and a search results
screen cannot be evaluated against that. Load it through the admin dashboard —
that path exists and exercising it is the point.

---

## Connecting — project, keys and instances

> Verified against the live project on 2026-09-20. **This app connects to the
> same Supabase project and the same Clerk application as the admin dashboard.**
> There is no separate mobile backend: the dashboard writes the catalog, this
> app reads it.

### Supabase

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| Project name | `story-app-dashboad` (the typo is in the real project name — do not "correct" it) |
| Project ref  | `fwjrdzzdtshbqrfkgivd`                                                            |
| Region       | `us-east-1`                                                                       |
| Instance     | `t3.nano` — see the performance ceiling below                                     |
| API URL      | `https://fwjrdzzdtshbqrfkgivd.supabase.co`                                        |

```bash
# .env — the anon key is designed to ship in a client; RLS is what protects data.
EXPO_PUBLIC_SUPABASE_URL=https://fwjrdzzdtshbqrfkgivd.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase → Settings → API>
```

**Never put `SUPABASE_SERVICE_ROLE_KEY` in this app**, in any form, including
behind a feature flag or in a build-time constant. It bypasses every policy in
this document. Anything needing it runs in an Edge Function.

This project uses the newer **`sb_publishable_…` / `sb_secret_…`** key format
rather than the legacy JWT-shaped keys. That matters in one recorded place: the
resumable-upload endpoint rejects them at parse, so a Node script written
against the old format will fail confusingly (AGENTS.md, prompt 16). The
mobile app does not upload, so it is unaffected — noted only so the format is
not mistaken for a misconfiguration.

### Clerk

Two instances exist, and **both are registered as Supabase Third-Party Auth
issuers**, so a token from either is accepted by RLS.

| Instance    | Issuer                                             | Use                |
| ----------- | -------------------------------------------------- | ------------------ |
| Development | `https://cheerful-walleye-3066.clerk.accounts.dev` | local dev, Expo Go |
| Production  | `https://clerk.talebrim.com`                       | release builds     |

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_test_… for dev, pk_live_… for release>
```

**The session-token claim is the load-bearing setting.** Both instances are
configured with:

```json
{ "metadata": "{{user.public_metadata}}" }
```

Without it `auth.jwt() -> 'metadata'` is empty and **every RLS policy denies
everything** — which fails closed, not open, but presents as a total outage
rather than a permissions error. If reads suddenly return nothing, check this
before anything else.

Note the **two different `role` claims** in a Clerk token, which is a live trap
this project has already hit: the **top-level** `role` is always
`authenticated` and is what every policy's `to authenticated` matches; the
**operator** role is the nested `metadata.role`. Conflating them makes
`is_admin()` false for everyone. A reader needs only the top-level claim —
this app should never grant `metadata.role`.

⚠️ **The admin dashboard currently runs on the DEVELOPMENT instance.** The
production cutover was completed, verified, and then rolled back on 2026-09-19
when its sign-in card stopped rendering; the cause is unresolved. See
`AGENTS.md`, Deferred Security Tasks item 3, and
`docs/PRODUCTION-CLERK-CUTOVER.md`. Point this app at the development instance
too until that is settled, or the two halves of the product will be
authenticating against different user pools.

### Storage and the CDN

`app_settings` is a single live row and is the source of truth for these —
read it rather than hardcoding:

| Setting                  | Live value                                 |
| ------------------------ | ------------------------------------------ |
| `public_cdn_domain`      | `https://fwjrdzzdtshbqrfkgivd.supabase.co` |
| `bucket_name`            | `novelnow-media`                           |
| `storage_provider`       | `supabase_storage`                         |
| `free_chapters_at_start` | `3`                                        |
| `default_chapter_access` | `locked`                                   |

Cover URLs are built as
`<public_cdn_domain>/storage/v1/object/public/covers/<cover_path>`. The
migration's _default_ for `public_cdn_domain` is the stale
`https://cdn.novelnow.app` from before the rename — the live row is correct, so
read the row. If `app_settings` is ever empty the dashboard falls back to
`SETTINGS_DEFAULTS`; this app should surface an error rather than invent a
domain.

---

## Data Contract — what actually exists in Supabase

> Verified against the live schema on 2026-09-20. The admin dashboard
> (`AGENTS.md`, same repo) owns this database; this app is a **reader** of it.
> Anything below marked **does not exist** has to be built before the screen
> that needs it, and building it is a schema change that must not break the
> dashboard.

### Tables that exist today

| Table          | What it holds                                                                                            | Mobile use          |
| -------------- | -------------------------------------------------------------------------------------------------------- | ------------------- |
| `books`        | title, author, short*description, synopsis, genres[], maturity, status, cover*\*, default_chapter_access | M3, M4, M7, M8      |
| `chapters`     | book_id, number, title, script_text, audio_path, audio_duration_seconds, access                          | M4, M5, M6, M9      |
| `app_settings` | single row: CDN domain, accepted formats, free_chapters_at_start                                         | read-only config    |
| `activity_log` | admin audit trail, append-only                                                                           | **not for the app** |

Two views exist and are **shaped for the dashboard, not for this app**:
`chapters_list` deliberately omits `script_text` (it exists so the admin
Chapters table does not ship 50,000 words to render word counts), and
`chapters_needing_attention` is an admin work queue. Do not build reader
screens on either; they will be joined by a reader-facing view instead.

### Tables this file assumes and that DO NOT EXIST

`unlocks`, `bookmarks`, and any entitlement mirror. **Nothing persists a
reading position, an ad-unlock, or a library membership today.** That means:

- **Read/listen parity (the app's stated core differentiator) has no storage.**
  The algorithm under State Management Rules is correct and cannot be
  implemented until a `reading_positions` table exists.
- Rewarded-ad unlocks cannot survive a reinstall.
- `My List` (M7) has nothing to read from.

These are the first migrations to write, and they belong to this app rather
than the dashboard.

### Column facts that change how screens are built

- **`chapters.access` is `free | locked`.** There is no "unlocked for this
  user" column, by design — that is per-user state and belongs in the missing
  `unlocks` table. M9's four row states are therefore **computed**, not stored.
- **`books.status` is `draft | published`.** The app must filter
  `status = 'published'` on every catalog read. A draft is unfinished admin
  work and must never reach a reader.
- **`maturity` is `general | mature_17`** — the enum value is `mature_17`
  and every label reads **`Mature 18+`**. Renaming the enum is a migration the
  dashboard shares; do not "fix" it in the app.
- **`chapters.audio_duration_seconds` is nullable, and so is
  `audio_duration_source`.** A file can be in storage with no duration ever
  measured — `loadedmetadata` reports `Infinity`/`NaN` for some encodings.
  Render a "duration unknown" state; never print `00:00` over an unmeasured
  file. The dashboard learned this the hard way.
- **`script_text` is plain Markdown with exactly three marks** — `**bold**`,
  `_italic_`, `## heading`. The admin editor stores nothing else, deliberately,
  because this app consumes the column directly. Parse those three; do not
  assume full Markdown.
- **Cover fields are nullable.** `cover_path` null is a legitimate state —
  render the placeholder, never a broken image.

### Storage buckets and the audio problem

| Bucket    | Public?         | Consequence for this app                                                         |
| --------- | --------------- | -------------------------------------------------------------------------------- |
| `covers`  | **public read** | Build URLs directly from `cover_path` + CDN domain. No signing, cacheable, fast. |
| `audio`   | **private**     | **Every track needs a signed URL, minted per playback.**                         |
| `scripts` | admin only      | Never touched by this app. Prose comes from `chapters.script_text`.              |

**The private audio bucket is the single biggest performance decision left
open.** Signed URLs expire, so they cannot be cached in the app or handed to
`react-native-track-player` for an offline download that outlives the
signature. Two options, and one must be chosen before M6 is built:

1. **Make `audio` public**, like `covers`. `AGENTS.md` already states that
   `locked` is a paywall state the app enforces through entitlements, **not a
   row-level secret** — so this is consistent with the existing security model
   rather than a weakening of it. Gives immutable, long-cached, CDN-served URLs
   and the cheapest egress.
2. **Keep it private** and mint signed URLs through an Edge Function,
   accepting a round trip before playback and solving offline downloads
   separately.

Option 1 is the one that matches "modern app" performance. It is a product
decision, not a technical one, and it is not made yet.

### Query patterns this app needs, and the indexes behind them

The dashboard's indexes are `chapters(book_id)`, `chapters(book_id, number)`
and `activity_log(created_at desc)`. **There is no index on `books.status`**,
which is the column every reader query filters on. Discover, Search and Library
all table-scan today. That is invisible at two books and will not be at five
hundred.

Additive index and view work is required before launch. It cannot break the
dashboard — indexes and new views change no existing table — but it must be
written as its own migration and verified against the dashboard's gates and
RLS tests.

### What has already been built (migration 20260920000001)

Applied to the live database and verified. **Purely additive** — no existing
table, view or policy was altered, which is what makes it safe to run against a
database the admin dashboard is using in production.

**Indexes:** `books(status)` — the column every reader query filters on and
which nothing indexed; `books` GIN on `genres` for the Discover tab strip and
Search chips (a btree cannot serve `@>` containment on a text[]); and a partial
index on `chapters(book_id) where audio_path is not null` for the audio-first
screens, which stays small because the catalog is mostly text today.

**`books_catalog`** — one row per **published** book with `chapter_count`,
`audio_count`, `free_chapter_count` and `total_duration_seconds` computed in
Postgres. Use this for M3, M4, M7 and M8 instead of querying `books` and then
counting chapters per row; that N+1 is what makes a list feel slow when a
trivial query already costs ~450ms. `total_duration_seconds` is **null, not
zero**, when nothing has a measured duration.

**`chapters_catalog`** — chapter metadata for M4's preview and M9's full list,
with `has_audio` / `has_text` booleans and **no `script_text`**. Fetch prose
per chapter from `chapters.script_text` when the reader actually opens one.

Both views set `security_invoker = on`, so the caller's RLS still applies.
Drafts are excluded **by construction**: a mobile query that forgets
`status = 'published'` cannot leak one, because there are none in the view.

Verified by impersonating a non-admin reader in SQL: `is_admin()` false, zero
drafts visible, no `script_text` column, `activity_log` and `app_settings`
still denied — and separately as an admin, confirming `chapters_list` and
`chapters_needing_attention` still return what the dashboard expects. The
dashboard's typecheck, lint and build all pass against regenerated types.

### Performance ceiling, stated plainly

The database is a `t3.nano` instance. `AGENTS.md` records a measured **~450ms
floor for a trivial query** and **1244ms for a cold `HEAD`**, and concludes
that **instance size outranks every code-level fix**. No amount of schema work
makes this feel like a modern app on that instance. Budget for an upgrade, and
lean on TanStack Query's persisted cache so a warm screen never waits on the
network.

---

## Clerk Rules

Use Clerk for authentication. Do not build custom auth.

**One application, shared with the admin dashboard** — see Identity model. The
mobile client is a **Native application** inside Talebrim, not a second Clerk
app. Do not create one.

- Publishable key only in the app. Secret keys never ship to the client.
- Token retrieval always goes through Clerk's `getToken`. Never cache a token in a module-level variable or in AsyncStorage.
- Sign-out clears persisted Zustand state and any user-scoped TanStack Query cache.

---

## Audio Rules

- `react-native-track-player` with background mode, lock-screen and Bluetooth/car controls, variable speed, sleep timer, and autoplay next chapter.
- Offline audio download is separate from offline text caching — implement both.
- Auto-bookmark on pause.
- M5 ↔ M6 handoff preserves position in both directions.
- Audio URLs from Supabase Storage are immutable and long-cached. Never append cache-busting query strings to media — cached egress bills roughly $0.03/GB against $0.09/GB uncached, so CDN hit rate is a real cost lever.

---

## Billing Rules

- Entitlements, restore and receipt validation go through RevenueCat. Supabase may mirror entitlement state for RLS, but RevenueCat is authoritative.
- **Plans, prices and renewal dates render from RevenueCat offerings/packages.** The prices in the M10 frame are placeholder.
- The yearly savings badge is **computed** from fetched package prices. Never hardcode a discount percentage.
- Restore Purchases is mandatory and must be reachable from M10 and M11 (Google Play policy).
- IAP does not work in Expo Go or on simulators. Plan EAS Build; test on real devices.
- Rewarded ads require a custom dev client. Never gate an already-unlocked chapter behind an ad.

---

## Content Rules

Catalog and chapter content come from Supabase, loaded through the admin CMS — the Talebrim Admin Dashboard, whose own `AGENTS.md` lives in the same repo and **owns this schema**. Read its Data Model Notes and Upload Rules before changing anything in Postgres: a migration written for this app can break that dashboard, and its three gates (`typecheck`, `lint`, `build`) plus its RLS verification are what prove it did not.

This app is a **reader**. It creates its own per-user tables (unlocks, reading positions) but must not alter `books`, `chapters`, `app_settings` or `activity_log`.

Seed content may live as typed JSON/TS in `data/` for local development.

The maturity flag is per book — respect it per title rather than assuming the whole catalog is mature. Show the age gate before content access. **The enum value is `mature_17`; every user-visible label reads `Mature 18+`.** That split is deliberate and shared with the admin dashboard — see Data Contract.

---

## Code Simplicity Rules

Avoid overengineering.

Duplicate twice; extract on the third use. No barrel-file re-export webs. No wrapper around a wrapper — if a component only forwards props, delete it. Delete dead code rather than commenting it out.

Refactor only when needed.

---

## Component Creation Rule

Only create reusable components when necessary. Ask if unsure.

Check `components/ui/` first — `Button`, `Chip`, `Pill`, `ProgressBar`, `Badge`, `SegmentedControl` and `Cover` already exist or should.

Components take data via props and do not fetch. Fetching lives in `hooks/`.

Every interactive component implements its full state set and has an accessibility label.

Name by role, not appearance: `PrimaryButton`, not `OrangeButton`.

`SegmentedControl` must default to the correct option — this is a known defect source in the design frames.

---

## Linting and Validation

Run:

```bash
npm run lint
npm run typecheck
```

Fix errors. A change that does not typecheck is not done.

Do not disable a rule to silence an error; fix the cause. An inline disable needs a justification comment. Do not reformat files you did not otherwise change.

---

## Communication Style

Be concise.

Lead with what changed and where — file paths, then the reason. Explain how to test.

Flag deviations from this file explicitly, with the source that justifies them. State assumptions and mark them as assumptions. If a design image and this file disagree, say so rather than silently choosing.

No progress narration. No restating the request. No summarising work visible in the diff.

---

## Important Constraints

**Supabase is the database.** Domain data lives in Postgres. AsyncStorage is for local-only concerns — onboarding completion, reader preferences, persisted Query cache — and is never the system of record.

Use:

- Supabase Postgres for catalog and chapters (existing), plus unlocks and reading positions (**to be created — see Data Contract**)
- Supabase Storage + CDN for covers and narration audio
- TanStack Query for server state
- Zustand for client state
- AsyncStorage for local persistence
- backend route handlers or Edge Functions for anything needing a service-role key

**Open item — iOS.** The stack lists Apple IAP, but every V1 frame is a 393 × 852dp Android frame. iOS layout, safe areas and App Store review specifics are unspecified. Confirm iOS scope before building for it.

---

## Final Reminder

Before every feature implementation:

- Read this file
- Follow it strictly
- Build clean, simple code
- Replicate UI exactly when designs are provided
- Treat placeholder content as data, never as constants
- Protect read/listen parity above all else

And the five non-negotiables from the top of this file, restated because this
is the section most likely to be re-read on its own:

1. The **service-role key** never enters this app.
2. Never **write** to `books`, `chapters`, `app_settings` or `activity_log` —
   this app reads a database the admin dashboard owns and runs in production.
3. Every catalog read filters **`status = 'published'`**, or uses the views
   that already do.
4. A Clerk token's **top-level `role`** (`authenticated`) is not its nested
   **`metadata.role`** (operator). Never grant the second from this app.
5. **One Clerk application**, shared with the dashboard — the mobile client
   is a Native application inside `Talebrim`, never a second Clerk app — and
   the **same instance**, currently development.
