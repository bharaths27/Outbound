# Requests for others

Notes from Angie (app frontend) about things in someone else's area. Answer inline or in
the team chat, then check the item off.

**Decision:** the backend is the source of truth. Every shape that matches the database
lives in `src/lib/types.ts`. `src/lib/data/types.ts` re-exports it and adds only
frontend-derived shapes.

## Open

### Bharath (backend)

- [ ] **Security: players can edit any column of their own profile and visits (high).**
  `004_api_grants.sql` grants `update` on whole tables, and RLS only limits which *rows*.
  From the browser console with the public key, a player can set their own `xp`, flip
  `is_demo` (skips location checks), change `school_id`, or raise `visits.xp_awarded` to
  win the leaderboard. Fix with column grants (the app only updates these):
  ```sql
  revoke update on public.profiles, public.visits from authenticated;
  grant update (display_name, avatar_url, privacy) on public.profiles to authenticated;
  grant update (hidden) on public.visits to authenticated;
  ```
  `check_in()` runs as its owner, so XP and visits keep working.
- [ ] **Security: QR codes are readable by everyone.** `quests.qr_code` is in the public
  `select` grant, so anyone can run `supabase.from("quests").select("qr_code")` and read
  every code, which makes QR check-in prove nothing. The app no longer fetches the column
  (it selects explicit columns and learns which quests need a code from
  `.select("id").not("qr_code", "is", null)`), but the grant still exposes it. Please
  `revoke select (qr_code)` from `anon` and `authenticated` and add a `has_qr boolean`
  (generated column) the app can read. Tell us when: the app's "which quests need a code"
  query switches to `has_qr` then.
- [ ] **QR codes: compare case-insensitively?** `check_in()` compares exactly. The app
  sends what the player types in capitals, which matches `OUTBOUND-EXPO`. Lowercase codes
  would never match unless `check_in()` uses `upper()` on both sides.
- [ ] **`DEMO_PASSWORD` in Vercel.** The login screen's one-tap demo buttons call
  `POST /api/demo-login`, which signs in on the server with `DEMO_PASSWORD` and only
  accepts the 4 `outbound-demo*` emails. Please add `DEMO_PASSWORD` to Vercel's env
  (server-only, no `NEXT_PUBLIC_`).
- [ ] **Starter quests vs Suki's content.** `content/seed.sql` loads Suki's quests next to
  the starter quests (`central-graffiti-alley` is in both; Suki's version wins). To drop
  the other starter quests, there's a commented `delete` at the end of `content/seed.sql`,
  but deleting a quest deletes its visits, so re-run `scripts/seed-demo.mjs` afterward.
  Your call.
- [ ] **Hours format.** `schema.sql` documents `hours` as `"HH:MM-HH:MM"` or `"always"`.
  The app now also reads per-day hours (`Mon-Thu 09:00-20:00; Sat,Sun 10:00-14:00`,
  documented in `content/README.md`), which Suki's content uses. The column is text, so no
  migration, but please update the comment.
- [ ] **Search tags.** `/api/search` lets Gemini pick tags only from `KNOWN_TAGS` in
  `src/lib/search.ts` (`photo-spot`, `study-spot`, …), but Suki's quests use other tags
  (`photo`, `coffee`, `pastry`, `park`). Could `KNOWN_TAGS` come from the quests' actual
  tags, or be updated to match `content/quests.csv`?
- [ ] **Ride time for the time filter.** The rule is
  `ride_min + 2 * walk_min + duration_min <= minutes`, but nothing provides `ride_min`
  (time from the user to the station). Until something does, the hub uses 0 and labels
  times "from the station". Is there a source planned (an API route, or Verna's map)?
- [ ] **QR quests.** Which quests will have a `qr_code`, and where will judges see the
  codes? The frontend can take a typed code without adding a scanner library.
- [ ] **Vercel env var.** Set `NEXT_PUBLIC_DATA_SOURCE` in the Vercel project (`mock`
  until integration).
- [ ] **Squad score.** The plan's squad cards show a score, but there's no squad score in
  the schema (no view or column). The Squads tab shows members and a cross-school badge
  for now. Want a `squad_weekly` view (sum of `visits.xp_awarded` with that `squad_id` this
  week), or skip squad scores?
- [ ] **Leaderboard wording.** Unless you want different wording, the Schools tab will
  say: "Total XP earned this week. Schools need 5 active players to rank. Resets Monday."
- [ ] **One craving per search** (low priority). `Filters.craving` holds one value, so
  "cheap spicy noodles" keeps `spicy` and drops `noodles`. A `cravings: string[]` would
  allow both. Fine to leave as is.

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
- [ ] **Neighborhood names must match Bharath's stations.** The passport groups by the
  station's `neighborhood`, so spelling decides which quests share a tier. Fixed: your CSV
  had `Fenway–Kenmore` (en dash) but the other 6 Fenway stations use `Fenway-Kenmore`
  (hyphen); the CSV now uses the hyphen. Please confirm two choices that differ from
  Bharath's seed: Park Street is `Downtown` (his says `Beacon Hill`), which groups it with
  Government Center (6 quests, Gold reachable); Haymarket is `North End / Downtown` (his
  says `Downtown`), its own 3-quest neighborhood.
- [ ] **Quests per neighborhood.** Gold takes 5 different quests in a neighborhood, but
  only Fenway–Kenmore and Downtown have 5+. Chinatown, Harvard Square, Central Square,
  Back Bay, and North End / Downtown have 3 each, so players there top out at Silver. The
  passport says so ("Gold unlocks as new quests are added"). Add 2+ quests to those, or
  merge neighborhoods.
- [ ] **Sample deals.** None in the CSV. The mock has three made-up sample deals (Pavement,
  Winsor Dim Sum, Thinking Cup Newbury). Keep `is_sample = true` and the `SAMPLE:` prefix
  on any real ones.
- [ ] **Into Supabase.** `content/seed.sql` is ready (`npm run content` regenerates it).
  Whoever has Supabase access (Suki or Bharath): paste it into the SQL Editor and run it.
  It upserts Suki's 27 quests and 9 station stories and keeps the starter quests and their
  visits. Tested on a local Postgres with the real tables: 17 starter + 27 = 43 quests,
  and re-running changes nothing.
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
- [ ] **Shared layout.** `src/app/layout.tsx` now wraps every page, including the map,
  in the app shell (bottom tab bar on phones, left rail on desktop), Archivo, and dark
  mode. The map gets the space that's left; please check it still fills it.
- [ ] **Hub contract.** Station markers call `openStationHub(stationId: string)` from
  `src/features/hub`. On mobile it's a bottom drawer, and at 768 px and up a 420 px right
  sheet. The map stays mounted and usable underneath. OK?
- [ ] **Arrival slot.** The hub header renders `<ArrivalSlot stationId={id} />`. Tell us
  its file path and export name when it exists. Until then it shows "Next train: —".
- [ ] **Theme.** Line colors stay in `src/lib/lines.ts`. Please use the theme tokens in
  `src/app/globals.css` instead of hard-coded colors in map UI chrome.

## Resolved

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
