# Requests for others

Notes from the app frontend (Angie and Bharath) about things in someone else's area.
Answer inline or in the team chat, then check the item off. Last updated 2026-11-22 (Bharath's answers) for the
hi-fi redesign (`DESIGN.md` v1 · Maroon): light mode only, Fraunces + DM Sans, 1024 px
desktop breakpoint, 5-item nav.

**Decision:** the backend is the source of truth. Every shape that matches the database
lives in `src/lib/types.ts`. `src/lib/data/types.ts` re-exports it and adds only
frontend-derived shapes.

## Open

### Bharath (backend)

Answered by Bharath on 2026-11-22; the answers are under Resolved. Still in progress:

- [ ] **Run `007_hide_qr_codes.sql`.** The app now reads `quests.has_qr` (and only falls back
  to an id-only `qr_code` filter if 006 hasn't run), so 007 can run once this change is on
  `main` and deployed. Quests are always selected by named columns, never `*`.
- [ ] **`DEMO_PASSWORD` in Vercel** (server-only). Bharath is adding it.
- [ ] **`NEXT_PUBLIC_DATA_SOURCE=supabase` in Vercel.** Set when the integration branch
  merges to `main`.
- [ ] **`/api/ride-times` on `main`.** It's on `bharath/guide-pipeline`. The hub's time
  filter uses it as ride time "from you" once it's there (until then, "from the station").
- [ ] **Public site URL (optional).** Share-card QR codes link to the public site. With
  nothing set they use Vercel's production domain (`VERCEL_PROJECT_PRODUCTION_URL`). For a
  custom domain, set `NEXT_PUBLIC_SITE_URL=https://<that domain>` in Vercel.

### Suki (content)

Suki's CSVs (9 stations, 27 quests) are in `content/` and drive the mock. Format rules are
in `content/README.md`; `npm test` checks every row.

- [x] **Vibe tags.** Lowercase and hyphenated, no budget or time words. All rows pass.
- [x] **Walk and visit times.** Filled for every quest.
- [x] **Mock content.** The mock now uses Suki's stations and quests.
- [ ] **Hours format.** The CSV had free-text hours ("Mon–Thu 9 AM–8 PM; Fri–Sat …"). We
  converted them to the format in `content/README.md` (`Mon-Thu 09:00-20:00; …`) and moved
  caveats into descriptions ("Best in daylight.", "Vendors keep their own hours."). Please
  check the conversions and use that format from now on.
- [ ] **Type.** The CSV used `scenery`; the schema only allows `scenic`. Converted.
- [x] **Harvard Square Pastry Pick** hours added.
- [ ] **Paul Revere House** hours are seasonal. We used the winter hours (10:00–16:15) and
  added the summer closing time to the description. Confirm that's right for the demo date.
- [x] **XP.** Lowered to 50–80 per quest.
- [x] **Neighborhood names.** Fenway-Kenmore uses the hyphen; Suki confirmed Park Street
  as `Downtown` and Haymarket as `North End / Downtown`.
- [ ] **Quests per neighborhood.** Gold takes 5 different quests in a neighborhood, but
  only Fenway–Kenmore and Downtown have 5+. Chinatown, Harvard Square, Central Square,
  Back Bay, and North End / Downtown have 3 each, so players there top out at Silver. The
  passport says so ("Gold unlocks as new quests are added"). Add 2+ quests to those, or
  merge neighborhoods.
- [ ] **Sample deals.** None in the CSV. The mock has three made-up sample deals (Pavement,
  Winsor Dim Sum, Thinking Cup Newbury). Keep `is_sample = true` and the `SAMPLE:` prefix
  on any real ones.
- [x] **Into Supabase.** Suki ran `content/seed.sql` (2026-11-21); verified in the app.
- [ ] **Tags for search.** Gemini search (`/api/search`, by Bharath) only picks tags from
  a fixed list. Keep the tag set small and consistent so search can match it.

### Verna (map)

- [ ] **Station tap opens the hub.** The map PR (#1) shows its own station card with the
  countdown. Please call `openStationHub(station.id)` from `@/features/hub` on station
  tap instead (the hub is on PR #2), and export the countdown so the hub header can show it
  (see "Arrival slot").
- [ ] **`build --turbopack`.** PR #1 adds `--turbopack` back to `npm run build`. Main
  removed it because `npm run start` crashed with `routesManifest.dataRoutes is not
  iterable`. Please keep `build` without it.
- [ ] **Shared layout (changed with the redesign).** `src/app/layout.tsx` wraps every page,
  including the map, in the app shell. Phones: a bottom tab bar (Explore, Quests, Passport,
  Leaderboard, Events), and on Explore a maroon header with the logo, XP and avatar.
  Desktop (1024 px and up, not 768): a maroon top bar with nav pills; the left rail is gone.
  Light mode only (no dark theme), fonts are Fraunces and DM Sans (Archivo is gone). The map
  gets the space that's left; please check it still fills it.
- [ ] **Explore chrome (DESIGN.md §6–7).** Over the map: a white "Explore Boston" card with
  Craving / Budget / Time chips and map controls (2D/3D, Live T, layers, locate) on phones;
  on desktop, a full-width map with a leaderboard drawer tab on the right edge, and the hub
  as a 420 px panel right of the map (§7). The frontend builds the drawer and chips once the map is on main; tell us
  if you'd rather own the controls.
- [ ] **Hub contract.** Station markers call `openStationHub(stationId: string)` from
  `@/features/hub`. Phones get a bottom drawer; 1024 px and up a 420 px right sheet. The map
  stays mounted and usable underneath. OK?
- [x] **Arrival slot.** Not needed from the map: `<ArrivalSlot/>` in the hub header reads
  `GET /api/trains?stop=<id>` itself and shows the next trains per direction.
- [ ] **Theme.** Line colors stay in `src/lib/lines.ts` (orange badges use `#C46A00` behind
  white text). Use the maroon/gold tokens in `src/app/globals.css` (`bg-maroon`,
  `bg-paper`, `text-ink`, `shadow-float`) for map controls instead of hard-coded colors.
- [ ] **Grok guide.** The "Ask Guide" button is fixed bottom-right, above the tab bar on
  phones. If it covers map controls, tell us where you'd like it.

## Resolved

Bharath's answers (2026-11-22):

- [x] **Profile and visit columns:** column-level update grants in `005_gamification.sql`
  (PR #15). Players can only update `display_name`, `avatar_url`, `privacy` and
  `visits.hidden`.
- [x] **QR codes readable:** `006_qr_has_qr.sql` adds `quests.has_qr`; the app reads it
  (`src/lib/data/supabase/index.ts`). `007_hide_qr_codes.sql` revokes `qr_code` (see Open).
- [x] **QR case:** codes are stored uppercase and trimmed (006 adds a check). `check_in()`
  compares exactly; the app sends the typed code trimmed and uppercased.
- [x] **Starter quests vs Suki's:** keep both. Don't run the commented `delete` in
  `content/seed.sql`: it wipes the demo accounts' visits, passport and leaderboard.
- [x] **Hours format:** per-day hours are official; the column comment is updated (006).
- [x] **Search tags:** `KNOWN_TAGS` includes every tag in `content/quests.csv`, with a test
  that fails on a new CSV tag.
- [x] **Ride time:** `GET /api/ride-times?from=lat,lng` returns minutes from the player to
  every station (T or walking). Without `from`, it starts at BU Central.
- [x] **QR quests:** only `bu-gsu-expo`, code `OUTBOUND-EXPO`, printed on a card at the
  team's expo table. A typed code is enough; no scanner.
- [x] **Level size:** stays 250 XP per level (`XP_PER_LEVEL` in `src/lib/data/levels.ts`).
- [x] **Today's Quests:** client-side picking is fine. Quest of the Week can come first via
  `quest_of_the_week()`.
- [x] **One craving:** leave it as is.
- [x] **Guide routes:** the Ask Guide panel's "Show route on map" sends `outbound:go`
  (`{name, lat, lng}`) or opens `/?go=lat,lng&name=`. `TransitMap.tsx` listens for it; keep
  that listener if the map is restyled.

- [x] **Squad score:** not shown; there's no backend support (DESIGN.md §11.6).
- [x] **Leaderboard wording:** "Schools need 5 active players to rank. Resets Monday at
  12:00 AM." Weekly only.
- [x] **Share card:** built on the frontend (`src/features/share/`); the QR opens
  `/q/<id>`. No backend needed.

From Bharath's answers and `backend/supabase/002_frontend_requests.sql`:

- [x] **Time filter:** `quests.duration_min` and `quests.walk_min` added.
- [x] **Demo check-ins:** `profiles.is_demo`; demo accounts can call `check_in` with no
  location.
- [x] **Squad members:** `squad_member_profiles` view, with no friend check.
- [x] **Tournaments:** out of scope for the hackathon.
- [x] **Next tier:** the `passport` view has `next_tier` and `quests_to_next_tier`.
- [x] **Levels:** `profiles.level` and `profiles.xp_to_next_level` (250 XP per level), also
  returned by `check_in`.
- [x] **XP breakdown:** `check_in` returns `xp_breakdown` (`base`, `first_visit`,
  `new_neighborhood`, `squad`, `cross_school`), adding up to `xp_awarded`.
- [x] **Stable errors:** switch on `error.hint` (`src/lib/data/checkInErrors.ts` does).
- [x] **Hours:** `"HH:MM-HH:MM"` (24 h) or `"always"`; an end before the start closes the
  next day; compare in Boston time.
- [x] **Sign-up error:** now says Outbound, with hint `SCHOOL_NOT_SUPPORTED`. The UI still
  checks the email domain first.
- [x] **`NEXT_PUBLIC_DATA_SOURCE`:** in `.env.example`, default `mock`.
- [x] **`npm run start`:** fixed; `build` no longer uses `--turbopack`.
- [x] **Shared types:** schema-matching types moved into `src/lib/types.ts`.
- [x] **Station IDs:** MBTA parent stop IDs (`place-kencl`).
- [x] **Demo sign-in:** 4 team logins with `DEMO_PASSWORD` (PR #7); the app signs them in
  through `/api/demo-login` so the password stays on the server.
- [x] **Auth:** email + password (`signUp`, `signInWithPassword`), email confirmation off.
- [x] **API grants:** migration 004.
- [x] **Gemini search:** `POST /api/search { q }` returns `{ filters, tags, keywords,
  source }`, with a keyword fallback (PR #6).
- [x] **Hub countdown data:** `GET /api/trains?stop=<id>` returns `arrivals`.
- [x] **Passport privacy:** the `passport` view follows visit privacy (migration 003).
