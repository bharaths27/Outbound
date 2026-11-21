# Outbound: Design Spec (v1 · Maroon)

Outbound is a game played on Boston's T. You tap a station, find food, events and views nearby, and check in at the spot for XP and a passport stamp. Every check-in also helps your school win the weekly leaderboard.

This spec restyles the app that already exists. **The layout and visual design here win.** Where the current app's structure differs, change the code to match. **Keep the existing app's content, data, states and behavior** unless this doc says otherwise (§2 lists every change).

**Where things live**
- **Exact values:** `tokens.css`
- **Exact layout, copy, icons and illustrations:** `reference/` (how to read those files: `README.md`)
- **Logo:** `assets/outbound-wordmark.svg`

**Approach:** build mobile-first at a 390 px design width; switch to the desktop layout at ≥ 1024 px. **Light mode only. There is no dark mode:** remove the existing dark theme and its toggle, and don't follow the system dark setting (set `color-scheme: light`).

---

## 1. Screens and routes

| Screen | Route | Mobile reference | Desktop reference |
|---|---|---|---|
| Explore (map, home) | `/` | `mobile/explore` | `desktop/explore-default`, `explore-leaderboard-open`, `explore-stop-selected`, `explore-stop-selected-leaderboard-open` |
| Station hub | `/?station=<id>` | `mobile/station-hub` | `desktop/station-hub` |
| Quest detail | `/q/<id>` (also inside the hub) | `mobile/quest-detail` | `desktop/quest-detail` |
| Check-in (dialog) | over quest detail | `mobile/check-in`, `check-in-success`, `check-in-error` | `desktop/check-in`, `check-in-success`, `check-in-error` |
| Quests (today's list) | `/quests` **new** | `mobile/quests` | `desktop/quests` |
| Passport | `/passport` | `mobile/passport` | `desktop/passport` |
| Leaderboard: Schools | `/leaderboard` | `mobile/leaderboard-schools` | `desktop/leaderboard-schools` |
| Leaderboard: Squads | `/leaderboard?tab=squads` | `mobile/leaderboard-squads` | `desktop/leaderboard-squads` |
| Squad invite | `/squad/join/<code>` | `mobile/squad-invite` | `desktop/squad-invite` |
| Login / create account | `/login` | `mobile/login` | `desktop/login` |
| Onboarding | `/onboarding` | `mobile/onboarding` | `desktop/onboarding` |
| Profile | `/profile` | `mobile/profile` | `desktop/profile` |
| Privacy | `/settings/privacy` | `mobile/privacy` | `desktop/privacy` |
| Neighborhood page | `/n/<slug>` *(optional)* | `mobile/neighborhood` | `desktop/neighborhood` |
| Events | `/events` | placeholder | placeholder |

The map itself is owned by Verna. Restyle only the chrome around it; the illustrated map in the references is a stand-in for the live 3D map.

---

## 2. Changes from the current app

1. **Navigation.**
   - Replace the 4-tab shell (Map, Passport, Compete, Profile; left rail on desktop) with **5 items: Explore · Quests · Passport · Leaderboard · Events**.
   - Phones get a **bottom tab bar**. Desktop gets a **maroon top bar** with the logo, nav pills, XP pill, bell and avatar.
   - **Profile** has no tab. On desktop you reach it from the avatar; on mobile from the avatar or menu.
   - Keep the shell hidden on Login, Onboarding and Squad invite.
2. **"Compete" is renamed "Leaderboard".** Schools and Squads become a segmented toggle inside it.
3. **New Quests tab** (`/quests`). This is a "Today's Quests" list across stations:
   - a daily progress bar
   - category filters
   - a cross-school bonus banner
   - quest cards with a done state
   It uses the same quest data as the hub.
4. **Events tab.** Not designed yet. Ship a simple placeholder page; events still appear as a quest type inside the hub.
5. **Desktop breakpoint is 1024 px**, not 768. Between 768 and 1023 px, use the mobile shell with a centered content column up to 720 px wide.
6. **Desktop Explore** gets a **leaderboard drawer** plus the station hub as a right panel (§7).

---

## 3. Design tokens (`tokens.css`)

### Color roles
| Role | Token | Hex |
|---|---|---|
| Primary chrome: headers, nav, primary buttons, active pills, map pins | `--color-maroon-700` | #6B1F33 |
| Text on gold | `--color-maroon-800` | #4A1424 |
| Secondary maroon: podium, food ink, destructive buttons | `--color-maroon-600` | #8A2A44 |
| Reward: XP pills, levels, **Check in button**, headlines on maroon | `--color-gold-400` | #F2C14E |
| Progress fills | `--color-gold-500` | #E5A92F |
| Page background | `--color-page` | #FFF8EF |
| Cards, inputs, overlays | `--color-surface` | #FFFFFF |
| Tab bar, map controls | `--color-paper` | #FBF6EC |
| Chips, inactive filters, segmented-control track | `--color-sand-100` | #F1E6D3 |
| Card border | `--color-border` | #EADDC8 |
| Text / secondary text | `--color-ink` / `--color-muted` | #2B1A1F / #6E5A5E |
| Open / success · Closed · Field error | `--success` · `--closed` · `--danger` | #2F6B4F · #8A2A44 · #B3121F |

**Other color sets**
- **Quest categories (tint / ink):**
  - Food `#F8E1E6` / `#8A2A44`
  - Event `#E8E2F5` / `#4B3A80`
  - Scenery `#DDE8F5` / `#1F4A7A`
- **XP chip:** `#FCE9B8` with `#5C3F00` text.
- **"Sample" label:** `#EFE7DA` with `#5A4549` text.
- **MBTA line colors** are used only for line badges and the map. Use `#C46A00` for orange behind white text.
- **School colors** appear on avatar rings and dots: BU `#B3121F`, Northeastern `#26262B`, MIT `#8A1538`, Harvard `#A51C30`. Others come from the backend.

### Type
- **Fonts:** Fraunces (display, 500 / 600 / 700) and DM Sans (UI, 400 / 500 / 600 / 700), from Google Fonts.
- **Display headings** use upright Fraunces: page titles are 26–28 mobile / 40 desktop; hero titles are 30–32 mobile / 44 desktop. Italic is reserved for the "Explore Boston" and "My Passport" titles.
- **Station names** are set like a station sign: DM Sans 700, 26 px, white on `#2B1A1F`, radius 8. Step long names down a size.
- **Body text** is 14–17; labels 13–15 at weight 600–700; eyebrows 12 px, 700, uppercase, +0.08–0.12em tracking.

### Shape & elevation
- **Radii:** pill 999 · icon buttons 12 · inputs and primary buttons 14–16 · cards 18–22 · panels and dialogs 24–28 · bottom sheets 24–26 on the top corners only.
- **Shadows** are maroon-tinted:
  - Cards: `--shadow-card` (0 8 24, #4a142433).
  - Dialogs: `--shadow-dialog`, with a `--scrim` behind them.
- **Touch targets** are at least 44 px everywhere.

### Icons
24 px stroke icons, 1.8–2 px stroke, round caps (Lucide matches). No emoji. Exact paths are in the references.

---

## 4. Shell

### Mobile
- **Header** is maroon. On Explore it holds the logo (22 px tall), the **XP pill** (gold, star, "3,420 XP") and the **bell** (gold dot when there's something unread). Other tabs show the page title instead of the logo. Sub-pages use a back arrow plus the title.
- **Tab bar** has a `--color-paper` background and a 1 px top border. Each item is at least 66 × 54 with an icon above a 12 px label. The active item is a maroon pill with white text. Add the safe-area inset at the bottom.

### Desktop (≥ 1024)
- **Top bar** is maroon, with content max 1360 px and padding 12 / 32.
  - Logo (28 px) links to `/`.
  - Nav pills are 44 px tall. The active one has `--color-paper` background, maroon text, weight 700 and a soft shadow; inactive ones use `#F6E6EA` text.
  - Right side: XP pill, bell, avatar (links to Profile).
- **Content** is max 1360 px with 28–32 px padding. Two-column pages use a wrapping flex row with a 24 px gap: main column `flex: 999 1 560–640px`, side column `flex: 1 1 320–360px`.

### Toasts
Toasts sit at the bottom center, above the tab bar. They're a dark ink pill (`#2B1A1F`) with white text, 3 s, with an optional action ("Joined Night Owls", "Invite link copied", "Saved").

---

## 5. Shared components

| Component | Spec |
|---|---|
| **Stamp** (signature element) | Circular badge with a perforated dashed outer ring, a thin inner ring, the neighborhood name in caps along the top arc, and a line-art landmark glyph in the center. Earned stamps sit at a slight tilt (−8° to +7°). **Sizes:** 44–48 (card corner), 72 (profile mobile), 88 (passport / profile desktop), 96–128 (quest detail, celebration, onboarding). **Tiers:** Bronze `#A8643A`, Silver (ink `#6B7486`, ring `#9AA3B2`, bg `#F4F5F8`), Gold (ink `#1F4A7A`, ring `#D9A21B`, bg `#FFF4D6`; the darker ink keeps it readable on white). **Cross-school:** an extra thin **gold** outer ring; on a gold stamp, make that ring **maroon**. **Locked:** grey `#8C7F79` ink on `#F3EDE3`, dashed. Always give it an `aria-label`, e.g. "Back Bay stamp, Silver". |
| **Tier progress dots** | 3 dots under a stamp: `#C7901A` = earned, `#DCCFBD` = not yet. |
| **Line badge** | A colored circle with a white letter (G / R / O / B / SL). In headers, a colored dot plus branch text ("Green B C D E"). |
| **Quest card: hub** | Mobile: a 4:3 photo on top (tinted placeholder with a category icon until photos exist), then the title (17/700), a meta row (price · walk time · hours in green when open, maroon when closed), up to 3 vibe tags, and "+50 XP" with "Silver in Back Bay". Desktop: the same content in a horizontal layout with a 104 × 96 thumbnail. Done quests get a 44–48 stamp in the corner. The whole card is a link. |
| **Quest card: Quests tab** | A 64–76 thumbnail, title, line badge with location, category chip, XP chip, and a **done toggle** (44 × 44, maroon with a check when done). |
| **Chips** | Filter chips are 38–44 tall. Selected: maroon with white text. Unselected: `#F1E6D3` with a border. **Removable pill** (what the search understood): `#F4E3E6` background, maroon text, ✕ button. |
| **Segmented control** | Sand track with 4 px padding; the selected segment is a maroon pill (on maroon headers: a paper pill with maroon text). Uses `tablist` / `tab` roles. |
| **Buttons** | **Check in / primary reward:** gold bg, maroon-800 text, height 52–56, radius 16, gold glow. **Primary:** maroon with white text. **Secondary:** white with a sand border. **Destructive:** `#8A2A44`. |
| **Inputs** | Height 48–52, radius 14, 1 px `#E2D3BC` border, white. Labels sit above in 14/700. Help or error text sits below in 13 px; errors use `--danger` with `aria-invalid` and `aria-describedby`. |
| **Radio cards** | Full-width bordered cards with a title and a one-line note. Selected: 2 px maroon border with a filled ring. Used for "Who are you with?" and privacy. |
| **Switch** | 44–48 × 26–28. On = maroon, off = `#CDBBA3`. `role="switch"`. |
| **Progress bar** | Sand track with a gold-500 fill, 6–10 px. `role="progressbar"`. |
| **Avatar** | Gold circle with the initial in Fraunces, ringed in the school color (2 px white gap, then 2–4 px school color). |
| **"Sample" label** | Uppercase 11 px tag on student deals that aren't real yet. |
| **Drawer tab** (desktop) | Vertical maroon tab, 48 px wide, with a chevron, a gold trophy and a vertical "Leaderboard" label. The compact version is 32 px (chevron + trophy). See §7. |

---

## 6. Mobile screens

Each item below names its reference file in `mobile/`. Content and states follow the current app unless noted.

- **Explore** (`explore`)
  - Full-bleed map under a white "Explore Boston" card with Craving / Budget / Time chips.
  - Map controls: 2D/3D, Live T, layers, locate.
  - A bottom card for the nearest or selected stop opens the **Station hub**.
- **Station hub** (`station-hub`): a bottom drawer with **3 heights**, toggled by tapping or dragging the handle: **peek** (name + lines + next trains), **half**, and **full** (scrolls). Top to bottom:
  - the sign-style name, line, close button and live next trains ("Heath St 2 min · Park St 4 min"; "No trains due"; "Next train: —" when offline)
  - the stop story with "Read more"
  - a search bar with removable understood-pills
  - always-visible **Craving / Budget / Time you have** chip rows, which scroll sideways on phones
  - an **Open now** switch, with the result count and **Clear**
  - quest cards
- **Quest detail** (`quest-detail`)
  - Back link to "Copley · Back Bay" (in the hub: "All quests").
  - Photo, title, station · neighborhood links, meta row, description, all vibe tags.
  - **Hours** card (today in bold) plus the time line.
  - **Student deals** box (gold tint) marked Sample.
  - Reward line, and the stamp shown when you already have it.
  - A sticky gold **Check in** button ("Sign in to check in" when signed out).
- **Check-in** (`check-in`, `check-in-success`, `check-in-error`): a bottom sheet over the dimmed quest. The steps are covered in §8.
- **Quests** (`quests`): see §2.3.
- **Passport** (`passport`): see §11.1.
- **Leaderboard · Schools** (`leaderboard-schools`): see §11.2.
- **Leaderboard · Squads** (`leaderboard-squads`)
  - Your squad cards: name, Cross-school badge, member count and schools, avatars ringed in school colors, "Check in together for the cross-school bonus", Copy invite link, the code, and Leave (opens a confirm dialog).
  - **Start a squad** (name + Create squad; the invite link is copied right away).
  - **Join with a code**, with inline errors.
  - Empty state: "No squads yet…". Signed-out state: "Sign in to make a squad".
- **Squad invite** (`squad-invite`)
  - Maroon page with the logo and "You're invited to a squad!".
  - Squad card, then **Join squad** (gold) or "You're in this squad" or "Sign in to join".
  - Not-found copy as in the current app.
- **Login** (`login`)
  - Maroon intro with the gold headline "Explore Boston via T".
  - Card with **Sign in / Create account** tabs, school email with a live check ("You'll play for Boston University"), and password ("At least 6 characters" on create).
  - **Try a demo account** as a 2 × 2 grid of school buttons.
  - "Browse the map without signing in".
- **Onboarding** (`onboarding`): progress dots, Skip, Back / Next.
  1. "Every stop is a quest"
  2. "You play for BU" (school-color card)
  3. "Make it yours": display name plus the visibility radio cards, then **Start exploring** (gold).
- **Profile** (`profile`)
  - Avatar with school ring, name, school · year, "Demo account" tag.
  - Level card with progress; latest 4 stamps + Passport link; squad chips + Manage.
  - Settings list: Privacy (shows the current choice), Sign out.
- **Privacy** (`privacy`)
  - Radio cards: Everyone on Outbound / Friends only / Only me (ghost mode). Saves immediately and shows "Saved".
  - Location note.
  - **Hide single visits** list with a switch on each visit and a "Hidden" tag.

## 7. Desktop screens

Reference files are in `desktop/`.

### Explore (one route, two independent toggles)
| State | Reference |
|---|---|
| Default: full-width map; the drawer tab sits on the **right edge of the screen**, vertically centered, chevron pointing left | `explore-default` |
| Leaderboard open: the map narrows and the School Leaderboard card fills the side column; the tab is **attached to the card's left edge**, chevron pointing right | `explore-leaderboard-open` |
| A stop selected | `explore-stop-selected` |
| A stop selected + leaderboard open: the compact 32 px tab sits at the **top-left of the leaderboard card** | `explore-stop-selected-leaderboard-open` |
| **Station hub**: a 420 px panel right of the map. The map stays usable, and tapping another station swaps the hub. The header and next trains stay pinned while the rest scrolls; chips wrap. | `station-hub` |

The drawer slides in from the right in 200–250 ms ease-out, with no motion under `prefers-reduced-motion`. The station hub replaces the stop panel shown in `explore-stop-selected*`. Those two files show the earlier neighborhood-style panel; use them for the leaderboard-drawer layout only.

### Other desktop pages
- **Quest detail:**
  - main column: a 16:9 photo, 44 px title, meta row, description, tags, and the Hours and Time cards side by side
  - sticky side column: the stamp ("You have this stamp · Silver in Back Bay"), reward, gold **Check in**, "You'll need to be within 75 m", then student deals
- **Check-in:** the same steps as mobile, in a **480 px centered dialog** over a scrim. The celebration is a **520 px maroon dialog** with its two buttons side by side.
- **Login:** split screen. Left: a maroon brand panel with the headline, T-line art and a stamp. Right: the form card (max 440) and demo accounts.
- **Onboarding:** one centered card (max 1000) with the illustration beside the text; Back and Next sit bottom-right.
- **Profile:** left column has the profile card and settings; right column has latest stamps (with quest name and date) and squad cards.
- **Privacy:** single column, max 760, with a "← Profile" back link.
- **Leaderboard · Squads:** title row with the Schools / Squads toggle; squad cards in a grid; Start and Join in a side card.
- **Squad invite:** a centered 560 px card on a maroon page.
- **Quests, Passport, Leaderboard · Schools, Neighborhood:** as in the reference files.

---

## 8. Check-in flow

Each step appears only when it applies, matching the current logic.

1. **Looks closed:** "Closed · opens Mon 7 AM. If you're at the spot anyway, you can still check in." → **Check in anyway** / **Not now**.
2. **Options:**
   - **Event code** field: "Find it on the sign or the table at the spot."
   - **Who are you with?** radio cards: Just me / each squad with its bonus. Cross-school squads show a badge and "+20%, or double XP if a squad-mate from another school checks in within an hour".
   - Then **Check in**.
3. **Finding you…** (pulsing location icon): "Your location is checked once, for this check-in, and never shared." Skipped for demo accounts and code check-ins.
4. **Checking you in…** (spinner).
5. **Celebration**, full-screen maroon on mobile and a dialog on desktop. Under 2 s, and tapping or **Skip** jumps to the end.
   - The stamp drops in with a slight overshoot and lands at −8°. The tier-colored progress ring fills around it.
   - The eyebrow says "Tier up" or "First stamp". The headline says "Silver in Back Bay" or "First stamp in Back Bay".
   - **XP counts up** ("+100 XP") while bonus lines fade in one by one: Quest, First visit, New neighborhood, Squad bonus, Cross-school bonus.
   - Then "1 more quest here for Gold" and "Level 12 · 480 XP to level 13".
   - Buttons: **See your passport** (gold) / **Done**.
   - Under reduced motion there's no movement; everything fades in at the final values.
6. **Errors** (`check-in-error`; chips at the bottom of that reference preview each one; don't ship those chips). Each error has a title, one line of explanation, and next-step buttons:
   - Not quite there (320 m / 75 m) → Directions, Try again
   - Already stamped today → See your passport, Done
   - Location is off → Try again
   - Couldn't find you → Try again
   - Code doesn't match → Try again (returns to the code field)
   - No connection → Try again
   - Also: not in that squad, quest not found, sign in to check in.

---

## 9. States (not drawn: build them from these rules)

- **Loading:** skeletons shaped like the screen, using sand `#F1E6D3` blocks with radii matching the real elements. Use a gentle shimmer, none under reduced motion.
- **Empty:** a centered illustration or stamp outline, one sentence, and one action, e.g. "No quests match these filters" + **Clear filters**.
- **Error:** title, one line, and **Try again**.
- **Signed out:** the same empty pattern with **Sign in** ("Sign in to start your passport").
- **Not found pages** (quest, station, squad): maroon header, one line, and one way back ("Open the map", "Go to your squads").

## 10. Accessibility

- Use real buttons and links.
- Segmented controls use the `tablist` / `tab` roles. Filters and done toggles use `aria-pressed`. Radio cards use `role="radio"` with `aria-checked`.
- Dialogs have `aria-modal` and focus trapping, and Esc closes them on desktop.
- Progress bars use `role="progressbar"`, and every stamp has an `aria-label`.
- Contrast is at least 4.5:1. Muted text `#6E5A5E` is only for use on white or cream.
- Show visible focus rings (2 px maroon or gold, 2 px offset). Touch targets are at least 44 px.

## 11. Known gaps, decided in this spec

1. **Passport.** The reference shows the earlier "Boston Core / Nearby / Special" stamp book. **Keep that look** (book page, stamp grid, legend, profile strip) but use the current app's structure:
   - Tabs: **Your stamps / To explore**.
   - **Your stamps:** one section per neighborhood, most recent first. Each section has a header (name, station links, tier badge, tier-colored progress bar, "2 more for Silver", "1 of 3 collected") over a stamp grid: earned stamps first, then locked ones.
   - **To explore:** unvisited neighborhoods, each with an Explore button.
   - Summary line: "10 stamps · 3 neighborhoods · Level 4".
2. **Leaderboard · Schools.** Keep the reference look (podium, ranked list, your-contribution card), plus:
   - the rule line "Schools need 5 active players to rank. Resets Monday"
   - player counts
   - schools under the minimum show "–" and "Needs 5 players · 3 of 5"
   - the player's school is highlighted, and pinned above the list when it's far down
   Weekly only: drop the "All Time" toggle unless the backend supports it.
3. **Neighborhood page** (`/n/<slug>`) is optional. Build it only if there's time; the Station hub is the priority.
4. **Events:** placeholder page.
5. **Share card and Friends:** not designed. They're planned for later.
6. **Squad score:** don't show one; there's no backend support.

## 12. Not designed yet

- The Events page.
- The share card.
- Friends.
- The notifications panel. The bell can open a simple list in the card style for now.

## 13. Build order

1. Tokens, fonts and the shell (§4), including the nav change (§2).
2. Shared components (§5), with the **Stamp** first.
3. Station hub and Quest detail (the judges' focus).
4. The check-in flow and celebration (§8).
5. Explore desktop states and the leaderboard drawer.
6. Leaderboard (Schools and Squads) and Squad invite.
7. Login, Onboarding, Profile and Privacy.
8. Passport rework (§11.1) and the Quests tab.
9. States (§9), then Events placeholder.
