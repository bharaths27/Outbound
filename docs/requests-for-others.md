# Requests for others

Notes from Angie (app frontend) about things in someone else's area. Answer inline or in
the team chat, then check the item off.

**Decision:** the backend is the source of truth. Every shape that matches the database
lives in `src/lib/types.ts`. `src/lib/data/types.ts` re-exports it and adds only
frontend-derived shapes.

## Open

### Bharath (backend)

- [ ] **Demo sign-in from the login screen.** PR #7 (`scripts/seed-demo.mjs`) answers
  most of this: 4 team logins (`outbound-demo1@bu.edu` …) sharing `DEMO_PASSWORD`, marked
  `is_demo`. Remaining question: the "Try a demo account" buttons can't hold
  `DEMO_PASSWORD` in the browser. OK if the app adds a server route
  (`POST /api/demo-login { email }`) that signs in with the password from the server env and
  sets the session cookie? It would only accept the 4 `outbound-demo*` emails.
- [ ] **Starter quests vs Suki's content.** `seed_quests_starter.sql` (17 quests) and
  Suki's `content/quests.csv` (27 quests) cover the same places with different ids (Frog
  Pond, the BPL courtyard, Graffiti Alley, Chinatown Gate). `central-graffiti-alley` is in
  both. Which set goes into Supabase? Suggestion: Suki's CSV replaces the starter quests,
  keeping `bu-gsu-expo` (the QR quest). The app can generate a
  `seed_quests_content.sql` from the CSV if that helps.
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
- [ ] **Quests per neighborhood.** Gold takes 5 different quests in a neighborhood, but
  only Fenway–Kenmore and Downtown have 5+. Chinatown, Harvard Square, Central Square,
  Back Bay, and North End / Downtown have 3 each, so players there top out at Silver. The
  passport says so ("Gold unlocks as new quests are added"). Add 2+ quests to those, or
  merge neighborhoods.
- [ ] **Sample deals.** None in the CSV. The mock has three made-up sample deals (Pavement,
  Winsor Dim Sum, Thinking Cup Newbury). Keep `is_sample = true` and the `SAMPLE:` prefix
  on any real ones.
- [ ] **Into Supabase.** Who loads `content/*.csv` into `public.quests` and the station
  stories? See "Starter quests vs Suki's content" under Bharath.
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
- [x] **Gemini search:** `POST /api/search { q }` returns `{ filters, tags, keywords,
  source }`, with a keyword fallback (PR #6).
- [x] **Hub countdown data:** `GET /api/trains?stop=<id>` returns `arrivals`.
- [x] **Passport privacy:** the `passport` view follows visit privacy (migration 003).
