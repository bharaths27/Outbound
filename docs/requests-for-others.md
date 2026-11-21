# Requests for others

Notes from Angie (app frontend) about things in someone else's area. Answer inline or in
the team chat, then check the item off.

**Decision:** the backend is the source of truth. The frontend uses `src/lib/types.ts`
as-is, and `src/lib/data/types.ts` re-exports it, plus row types that copy
`backend/supabase/schema.sql` column for column. Nothing in `src/lib/types.ts` has been
changed.

## Everyone

- [ ] **Move the row types into `src/lib/types.ts`?** `School`, `Profile`, `Squad`,
  `Visit`, `Deal`, `Friendship`, `PassportNeighborhood` (view `passport`), and
  `LeaderboardRow` (view `leaderboard_weekly`) live in `src/lib/data/types.ts` for now.
  They copy the schema exactly. Moving them into the shared file would keep one copy.

## Bharath and Suki (schema, check-in, content)

Ordered by demo impact.

- [ ] **Time filter has nothing to filter on.** `Filters.minutes` exists, but `quests` has
  no duration or walk-time column, so "I have 30 minutes" can't narrow results. Judges
  will look at this filter. Could we add `duration_min int` and `walk_min int` to
  `quests`?
- [ ] **Demo accounts can't check in.** `check_in()` raises `location required` without
  coordinates or a QR code. Judges using demo accounts won't be at the spot. Options:
  accept a null location for the demo users, or give demo-friendly quests a `qr_code`
  and show it on the screen. Which do you prefer?
- [ ] **Squad members are hidden by RLS.** `profiles` is readable only for yourself,
  `public` profiles, or friends. Squad member lists, school rings, and the
  cross-school badge break for members who are `friends` or `ghost` and not your friend.
  Could we get a view, or a policy, exposing `id, display_name, avatar_url, school_id`
  for members of squads you're in?
- [ ] **Next-tier progress.** The passport shows "2 more for Silver." The tier thresholds
  (3 and 5) live only in SQL. Could the `passport` view add `next_tier` and
  `quests_to_next_tier`, so the UI doesn't copy the thresholds?
- [ ] **Level.** `profiles` has `xp` but no level, and the level formula should live
  with the XP rules. Could `profiles` (or a view) return `level` and `xp_to_next_level`?
  If levels aren't planned, we'll show XP only and drop "level" from the profile.
- [ ] **XP breakdown.** The check-in celebration lists why you earned XP. `check_in()`
  returns flags (`first_visit`, `new_neighborhood`, `cross_school`) but not per-reason
  amounts, so the UI will show the labels with the total `xp_awarded` rather than
  copying the +25 and x2 rules. If you want amounts per line, add an `xp_breakdown`
  array to the result.
- [ ] **Check-in error messages.** The frontend sorts `check_in()` exception text into
  error screens (`src/lib/data/checkInErrors.ts`). Please keep these messages stable, or
  tell us when they change: `too far: N m away (need within N m)`,
  `already checked in to this quest today`, `location required`,
  `QR code does not match this quest`, `you are not in that squad`, `quest not found`,
  `not signed in`.
- [ ] **Leaderboard wording.** Unless you want different wording, the Schools tab will
  say: "Total XP earned this week. Schools need 5 active players to rank. Resets Monday."
- [ ] **Hours format.** `quests.hours` is text. The frontend will read `"HH:MM-HH:MM"` or
  `"always"`, with past-midnight closes written as `"11:00-02:00"`, for the open-now
  label. OK?
- [ ] **Rename in the sign-up error.** `handle_new_user()` still says "T Quest is only
  open to…". It should say Outbound. The frontend shows this message on the login
  screen.
- [x] **Data-source switch.** `NEXT_PUBLIC_DATA_SOURCE` added to `.env.example` on `main`
  (8ab6ea5). Still needs setting in Vercel (`mock` until integration).
- [x] **`npm run start` crashes after `npm run build`.** Fixed on `main` (8ab6ea5): `build` no
  longer uses `--turbopack`.
- [ ] **Tournaments.** The schema has no tournament tables. The frontend plan had
  restaurant-hosted tournaments with prizes. Are they in scope? If not, we'll drop them
  for the hackathon.
- [ ] **One craving per search** (low priority). `Filters.craving` holds one value, so
  "cheap spicy noodles" keeps `spicy` and drops `noodles`. A `cravings: string[]` would
  allow both. Fine to leave as is.

## Suki (content)

- [ ] **Vibe tags.** Please use lowercase, hyphenated tags (`late-night`, `study-spot`).
  Avoid budget or time words as tags (`cheap`, `free`, `quick`): `price_tier` covers
  those, and the search parser ignores those words as cravings.
- [ ] **Sample deals.** Keep `deals.is_sample = true` and the `SAMPLE:` prefix. The UI
  shows a visible "Sample" label as well.
- [ ] **Mock content.** The mock uses 7 real stations (Kenmore, Park Street, Harvard,
  Central, Chinatown, Haymarket, Copley) with placeholder quests in
  `src/lib/data/mock/seed.ts`. If your real content starts with the same stations, the
  demo transfers cleanly.

## Verna (map)

- [x] **Station IDs.** These are MBTA parent stop IDs (`place-kencl`), as in the schema.
- [ ] **Hub contract.** Station markers call `openStationHub(stationId: string)`. On
  mobile it's a bottom drawer, and at 768 px and up a 420 px right sheet. The map stays
  mounted and usable underneath. The export path is coming with the hub milestone. OK?
- [ ] **Arrival slot.** The hub header renders `<ArrivalSlot stationId={id} />`. Tell us
  its file path and export name when it exists. Until then it shows "Next train: —".
- [ ] **Theme.** Line colors stay in `src/lib/lines.ts`. Theme tokens (DESIGN.md) are
  coming to `src/app/globals.css` as CSS variables. Please use them instead of
  hard-coded colors in map UI chrome.
