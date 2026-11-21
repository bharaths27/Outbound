# Outbound — Design System

This is the single source of truth for how Outbound looks and feels. Every screen, component, and animation follows it. If something you need isn't covered, pick the option most consistent with what's here and add a line to this file rather than inventing a one-off style.

## The idea

**Transit signage meets a travel passport.** The app's chrome borrows from station signs and route maps: confident type, clear hierarchy, colored line marks, generous whitespace. The reward layer borrows from passport stamps: ink, rings, slight rotation, the feeling of collecting something physical.

**Spend boldness in one place: the stamp.** Stamps, the check-in moment, and tier upgrades are the memorable parts. Everything else (lists, settings, filters, forms) stays calm, quiet, and precise so the stamps stand out.

## Palette

Five brand colors from the team palette:

| Name | Hex | oklch | Role |
|---|---|---|---|
| White | `#FFFFFF` | `oklch(1 0 0)` | Light-mode background and surfaces; text on navy and plum |
| Navy | `#383D57` | `oklch(0.367 0.045 275.5)` | Primary text and primary buttons in light mode; base of dark mode |
| Periwinkle | `#9CB9E7` | `oklch(0.780 0.073 259.5)` | Selected states, chips, soft highlights; primary in dark mode |
| Plum | `#7A3E5B` | `oklch(0.449 0.091 351.0)` | Accent: XP, tournament marks, links |
| Gold | `#FFC533` | `oklch(0.853 0.162 85.0)` | Gold tier, cross-school gold border, the check-in celebration. Rare by design |

Gold is never used for text on light backgrounds (it fails contrast). Use it as a fill with navy text on top, or as a border or ring.

### Role tokens (map these to shadcn's CSS variables)

| shadcn variable | Light | Dark |
|---|---|---|
| `--background` | `#FFFFFF` (white) | `#1C1F30` |
| `--foreground` | `#383D57` (navy) | `#EEF1F8` |
| `--card` / `--popover` | `#FFFFFF` | `#262A40` |
| `--card-foreground` | `#383D57` | `#EEF1F8` |
| `--primary` | `#383D57` (navy) | `#9CB9E7` (periwinkle) |
| `--primary-foreground` | `#FFFFFF` | `#262A3E` |
| `--secondary` | `#9CB9E7` (periwinkle) | `#30354F` |
| `--secondary-foreground` | `#262A3E` | `#EEF1F8` |
| `--muted` | `#E8ECF5` | `#30354F` |
| `--muted-foreground` | `#5B6280` | `#A6ADC6` |
| `--accent` | `#7A3E5B` (plum) | `#D69BB8` (light plum) |
| `--accent-foreground` | `#FFFFFF` | `#262A3E` |
| `--destructive` | `#C2362B` | `#F07A6E` |
| `--border` / `--input` | `#D6DCEA` | `#3B4060` |
| `--ring` | `#9CB9E7` | `#9CB9E7` |

Note: in shadcn, `accent` is normally a subtle hover background. We repurpose it as the plum brand accent, so components that use `accent` for hover (menus, ghost buttons) must be adjusted to use `muted` for hover instead. Do that once in the component files, not per use.

Custom tokens to add alongside shadcn's:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--gold` | `#FFC533` | `#FFC533` | Gold tier, cross-school border, celebration |
| `--gold-foreground` | `#383D57` | `#262A3E` | Text on gold |
| `--tier-bronze` | `#B87B4B` | `#C98D5D` | Bronze stamp ink and rings |
| `--tier-silver` | `#9AA4BC` | `#AEB7CC` | Silver stamp ink and rings |
| `--tier-gold` | `var(--gold)` | `var(--gold)` | Gold stamp ink and rings |
| `--xp` | `#7A3E5B` | `#D69BB8` | XP numbers and gains |

Tier colors are for stamp ink, rings, and progress fills only. Labels next to them use `--foreground`.

With white as both the page and card color in light mode, cards separate from the page by their 1 px `--border`, and grouped areas (filter bar, passport neighborhood headers, the user's pinned leaderboard row) use the light `--muted` tint. The muted, border, and dark-mode values are tints and shades of navy and periwinkle, so the whole palette still traces back to the five brand colors.

### Checked contrast (WCAG)
Navy on white 10.6:1, muted text on white 6.0:1, navy on periwinkle 5.3:1, navy on gold 6.7:1, white on plum 7.9:1, dark-mode text 14.4:1, dark muted text 6.3:1. All pass AA for body text. Keep these pairings; check any new pairing before using it.

### Colors from outside the palette
- **MBTA line colors** appear only on the map and in small line badges: red `#DA291C`, orange `#ED8B00`, blue `#003DA5`, green `#00843D`, Mattapan/silver `#7C878E`. Never use them for UI chrome.
- **School colors** come from the database and appear only as small marks: an avatar ring, a dot on the leaderboard, a thin bar on a squad card. Never as backgrounds or buttons.

## Typography

One family: **Archivo** (Google Fonts, variable, with a width axis). Load it with `next/font/google` including the `wdth` axis.

- Station names and screen titles use Archivo at a wider width (around 112–125) and a heavy weight, like station signage. This is where the type carries personality.
- Body text, cards, and forms use the normal width (100) at regular and medium weights.
- Numbers (XP, ranks, prices, countdowns) use `font-variant-numeric: tabular-nums` so they don't jump when they change.
- Fallback stack: `Archivo, ui-sans-serif, system-ui, sans-serif`.

| Style | Size / line height | Weight | Width | Use |
|---|---|---|---|---|
| Display | 32 / 36 | 800 | 125 | Station name in the hub header, passport title |
| Title | 22 / 28 | 700 | 112 | Screen titles, sheet headers |
| Heading | 17 / 24 | 600 | 100 | Card titles, section headings |
| Body | 15 / 22 | 400 | 100 | Descriptions, stop stories |
| Small | 13 / 18 | 500 | 100 | Meta info (price, distance, hours) |
| Tiny | 11 / 14 | 600 | 100 | Badges only |

Rules: sentence case everywhere (no all-caps labels). Station names in title case as they appear on MBTA signs. Body line length under about 70 characters on desktop.

## Layout and spacing

- **Mobile first at 390 px.** Desktop is a wider version, not a different app.
- **The map is the home screen, full-bleed.** Everything else sits on top of it or on its own route.
- **Station hub:** on mobile, a bottom drawer (shadcn `Drawer`) with three snap points (peek showing station name and next train, half, full). At 768 px and up, a right-side `Sheet` 420 px wide, with the map still usable.
- **Navigation:** bottom tab bar on mobile (Map, Passport, Compete, Profile), left rail on desktop.
- **Spacing scale:** 4 px base. Use 4, 8, 12, 16, 24, 32, 48. Screen padding 16 on mobile, 24 on desktop. Gaps between unrelated sections 24–32.
- **Alignment:** left-aligned text throughout. Centered text only for empty states and the check-in celebration.
- **Radius hierarchy (deliberately not one value for everything):** sheets and drawers 20 px top corners; cards 12 px; inputs and buttons 10 px; chips and badges full pill; stamps circular or with a serrated edge.
- **Elevation:** surfaces separate by background color and a 1 px border, not stacked shadows. One soft shadow is allowed on floating elements over the map (drawer, map controls).
- **Respect safe areas** on phones (`env(safe-area-inset-*)`) for the tab bar and drawer.

## Components (shadcn/ui)

Use shadcn/ui for every interactive control. Check the current shadcn docs for the install command and Tailwind version before setting up, then add components with the shadcn CLI. Theme them only through the tokens above. When a component needs a new look, add a variant in that component's file with `cva`, never by stacking overrides at the call site.

| Need | shadcn component |
|---|---|
| Station hub | `Drawer` (mobile), `Sheet` (desktop) |
| Buttons, primary actions | `Button` (variants: default, secondary, outline, ghost, plus our own `gold` for "Check in") |
| Craving chips, category | `ToggleGroup` (multiple) or `Badge` used as toggles |
| Budget selector | `ToggleGroup` (single): Free, Under $10, $10–20, $20+ |
| Time available | `ToggleGroup` (single): 30 min, 1 hr, 2 hr+ |
| Open now | `Switch` |
| Search bar | `Input` with an icon; parsed filters shown as removable `Badge`s |
| Quest cards, tournament cards | `Card` (custom layout inside) |
| Passport neighborhoods, leaderboard tabs | `Tabs` |
| Tier progress | `Progress` |
| Privacy: who can see | `RadioGroup` |
| Ghost mode | `Switch` |
| Avatars | `Avatar` with a school-color ring |
| Toasts ("Checked in", errors) | `Sonner` |
| Confirm leaving a squad, joining a tournament | `AlertDialog` |
| Share card preview | `Dialog` |
| Loading | `Skeleton` shaped like the real content |
| Long lists | `ScrollArea` |
| Menus | `DropdownMenu` |

Icons: **lucide-react** only, 20 px, stroke width 1.75, everywhere. No emoji in the interface. Stamp artwork is custom SVG, not icons.

## The stamp (signature element)

- Circular or serrated-edge outline, drawn as SVG, with an inner illustration or glyph for the place and the neighborhood name set around or under it.
- Ink color by tier: bronze, silver, gold tokens. A faint ink texture (an SVG filter or a subtle noise mask) so it doesn't look flat.
- Each stamp sits at a small random rotation (between −6° and 6°), fixed per stamp (derive it from the quest ID so it doesn't change on re-render).
- **Cross-school stamps** get a second outer ring in `--gold`.
- **Locked stamps** show as a thin dashed outline in `--border` with the place name in muted text, so users can see what's left to collect.
- On the passport page, stamps are grouped by neighborhood. Each neighborhood shows its tier and a `Progress` bar toward the next tier.

## Motion

Use `framer-motion` (or `motion`). Motion only responds to user actions, with one exception: the check-in celebration.

- **Standard transitions:** 150–220 ms, ease-out. Drawer and sheet use the component's built-in motion.
- **The check-in sequence (the one orchestrated moment):** button press → short loading state → the stamp drops in with a slight overshoot and lands at its rotation (about 400 ms) → XP counts up with the breakdown lines appearing one by one (about 800 ms) → if there's a tier upgrade, the neighborhood ring fills and changes color (about 500 ms). Total under about 2 seconds, tappable to skip.
- **No** entrance animations on lists or cards, no hover lift on every card, no looping or decorative background motion.
- **Reduced motion:** with `prefers-reduced-motion`, replace movement with a quick fade and show final values immediately.

## Copy

- Plain, active, sentence case. Buttons say what happens: "Check in," "Join tournament," "Create squad." Confirmations reuse the same verb: "Checked in."
- Name things the way students would: "Your passport," "Your squads," "Tonight near Kenmore," not system terms.
- Errors say what happened and what to do: "You're 300 m away. Get within 75 m of the spot to check in."
- Empty states invite an action: "No stamps yet. Pick a quest near you to earn your first."
- Sample restaurant deals always carry a visible "Sample" label.
- Real content only. Never ship lorem ipsum or "Quest Title Here."

## Screen notes

- **Station hub header:** station name in Display style, colored line badges beside it, next-train countdown on the right. Then the stop story (2–3 sentences, with a "Read more" if longer). Then a "Tournament here" banner if one is active. Then filters, then quest cards.
- **Quest card:** photo (4:3, rounded 8 px inside the card), title, a one-line meta row (category icon, price note, walk time from the station, open or closed), up to three vibe tags, and the reward (XP, and the stamp's current tier for this user). Done quests show a small stamp in the corner instead of hiding.
- **Filters:** always visible above the results, horizontally scrollable on mobile, with a result count ("8 quests") and a "Clear" action. These are what judges look for, so never tuck them behind a menu.
- **Compete tab:** `Tabs` for Schools, Squads, Tournaments. The user's own school and squads are pinned and highlighted. Schools below the player minimum show "Needs 5 players" instead of a rank.
- **Tournament detail:** host name and place, station, time window with a countdown, prize tiers (top squad, top individual, everyone who shows up), a live standings list, and one clear action ("Join with a squad" or "Join solo").
- **Profile:** avatar with school ring, level and XP, passport preview (latest stamps), squads, and a link to privacy settings.

## Before calling a screen done (anti-vibecoded checklist)

- [ ] Uses tokens only. No raw hex values or default shadcn gray/zinc left anywhere.
- [ ] Uses shadcn components for every control, with no hand-rolled buttons or inputs.
- [ ] Has loading (skeleton), empty, and error states with real copy.
- [ ] Works at 390 px with no sideways scrolling, and on desktop.
- [ ] Works in dark mode.
- [ ] No gradients, no emoji icons, no decorative shadows, no all-caps labels.
- [ ] Not everything is an identical rounded card; the layout has clear hierarchy.
- [ ] Numbers use tabular figures.
- [ ] Keyboard focus is visible; tap targets are at least 44 px.
- [ ] Motion only where this file allows it; reduced motion respected.
- [ ] No MBTA logos or the circled T; line colors only on the map and line badges.
