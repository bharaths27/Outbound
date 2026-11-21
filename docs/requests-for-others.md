# Requests for others

Notes from Angie (app frontend) about things in someone else's area. Answer inline or in
the team chat, then check the item off.

**Decision:** the backend is the source of truth. Every shape that matches the database
lives in `src/lib/types.ts`. `src/lib/data/types.ts` re-exports it and adds only
frontend-derived shapes.

## Open

### Bharath (backend)

- [ ] **How do demo accounts sign in on Supabase?** The login screen has "Try a demo
  account" buttons that call `signInDemo(userId)`. With real auth, those users need a way
  in without an email link. Email and password for the 3 demo accounts? If so, please
  create them (one each at different schools), mark them `is_demo`, and tell me which
  env vars hold the credentials.
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
- [ ] **Harvard Square Pastry Pick** (`harvard-tatte-pastry`) has no hours ("check the
  café's posted hours"). Hours would let "Open now" work for it.
- [ ] **Paul Revere House** hours are seasonal. We used the winter hours (10:00–16:15) and
  added the summer closing time to the description. Confirm that's right for the demo date.
- [ ] **XP.** Quests are worth 100–140 XP, about double the schema default of 50, so
  levels (250 XP each) come quickly. Confirm that's intended.
- [ ] **Sample deals.** None in the CSV. The mock has three made-up sample deals (Pavement,
  Winsor Dim Sum, Thinking Cup Newbury). Keep `is_sample = true` and the `SAMPLE:` prefix
  on any real ones.
- [ ] **Into Supabase.** Who loads `content/*.csv` into `public.quests` and the station
  stories (Bharath's seed script or a CSV import)?

### Verna (map)

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
