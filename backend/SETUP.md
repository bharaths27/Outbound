# Outbound backend: step-by-step setup

Files in this folder:

| File | What it is |
| --- | --- |
| `supabase/schema.sql` | Every Supabase table, the school-email sign-up gate, `check_in()` with all game rules, passport and weekly leaderboard views, row-level security, starter schools |
| `tigerdata/schema.sql` | Tiger Data tables for train positions and arrival predictions, hourly lateness summary, compression |
| `tracker/tracker.py` | Polls the MBTA every 15 s and saves into Tiger Data. Leave it running |
| `tracker/export_replay.py` | Dumps recorded trains to `replay.json` for Verna's replay mode |
| `web-api/app/api/trains/route.ts` | `GET /api/trains` (live trains) and `?stop=place-kencl` (hub countdown) |
| `web-api/app/api/lateness/route.ts` | `GET /api/lateness` ("Green Line +6 min" badges and line colors for Verna) |

Tested against Postgres 16: sign-up gate, check-in (distance, QR, once per day, squad, cross-school x2), passport tiers, leaderboard, lateness queries, tracker inserts. Not tested against live Supabase, Tiger Data or the MBTA API from here, so watch the first run.

---

## Step 1. Tiger Data (you, now, 10 min)

1. Sign up at tigerdata.com and create a free service. Copy the **connection string** (`postgres://tsdbadmin:...@...:PORT/tsdb?sslmode=require`).
2. Get an MBTA key at https://api-v3.mbta.com (Portal, then create a key).
3. Create the tables. Either paste `tigerdata/schema.sql` into the Tiger Data console SQL editor, or:
   ```bash
   psql "$TIGER_DATA_URL" -f tigerdata/schema.sql
   ```

## Step 2. Start the tracker (you, 5 min)

```bash
cd tracker
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TIGER_DATA_URL="postgres://..."
export MBTA_API_KEY="..."
python tracker.py
```

You should see a line every 15 s like `13:40:15 trains=58 predictions=140 with_schedule=95`.

- **Check `with_schedule`.** If it stays at 0 for Red or Orange, the lateness endpoint automatically falls back to "drift" (how much later trains are than first predicted). That's fine.
- To track the quest stations, set `KEY_STOPS` to Suki's station ids (comma-separated), then restart.
- Your laptop must stay awake. Move it to a Vultr VM later (Step 6) so it runs overnight.

## Step 3. Supabase (Suki runs it, 5 min)

1. Supabase, then **SQL Editor**, then **New query**. Paste all of `supabase/schema.sql` and **Run**.
   Then, one new query each, in order: `supabase/002_frontend_requests.sql`, `supabase/003_passport_privacy.sql`, `supabase/004_api_grants.sql`, `supabase/005_rewards.sql` (then the secret line that `node scripts/solana-setup.mjs` prints), `supabase/seed_stations.sql`, `supabase/seed_quests_starter.sql` (all safe to re-run; they keep data).
2. Re-running it wipes Outbound data (not logins), so only re-run before real users exist.
3. **Authentication, then Providers, then Email**: keep enabled. Turn **Confirm email** off for the hackathon, so sign-up works instantly without the low built-in email limit. Or add custom SMTP (Resend) under **Authentication, then Emails, then SMTP Settings**.
4. **Authentication, then URL Configuration**: Site URL = the Vercel URL; add `http://localhost:3000/**` to redirect URLs.
5. Make 3 or 4 demo accounts from different schools (sign up through the app, or **Authentication, then Users, then Add user** with an email like `demo1@bu.edu`).

### Step 3b. Social profiles and security (run after the others)

Run, in order: `supabase/011_social.sql` (reviews, want-to-visit lists, likes, comments, all behind the
profile privacy setting) and `supabase/012_profile_extras.sql` (grad year, bio, banner, profile photos,
private notes, and two lockdowns: players can only edit their own display fields, and nobody can read
other players' emails).

Then in the Supabase dashboard (these can't be set from SQL):

1. **Authentication → Sign In / Providers → Email:** turn on **Confirm email**. Without it, anyone can
   sign up as any `@bu.edu` address without owning that inbox, which defeats the school check.
2. **Authentication → Policies → Password:** minimum length 8; require lowercase, uppercase, and digits
   or symbols. This matches the checklist on the sign-up screen, so the server enforces the same rules.
3. **Google sign-in (optional):** Authentication → Sign In / Providers → Google: enable it and paste the
   OAuth client ID and secret from Google Cloud (OAuth consent screen + "Web application" credentials).
   Add `https://outboundwith.us/auth/callback` (and `http://localhost:3000/auth/callback` for dev) under
   Authentication → URL Configuration → Redirect URLs. Personal Gmail accounts are still rejected:
   `handle_new_user()` only creates profiles for supported school domains.
4. **Rate limits:** the app limits its paid AI/Maps routes per visitor in memory. For real protection on
   Vercel, also add a Firewall rate-limit rule on `/api/*`.

## Step 4. Add the API routes to the Next.js app (you, 10 min)

1. Copy `web-api/app/api/trains` and `web-api/app/api/lateness` into the app's `app/api/` folder.
2. `npm i pg` and `npm i -D @types/pg`
3. Add to `.env.local` **and** to Vercel's Environment Variables (server-only, **no** `NEXT_PUBLIC_` prefix):
   ```
   TIGER_DATA_URL=postgres://...
   MBTA_API_KEY=...
   ```
4. Test: `http://localhost:3000/api/trains`, `/api/trains?stop=place-kencl`, `/api/lateness`.

## Step 5. Tell the frontend how to call things

**Live trains and countdown (Verna):** `GET /api/trains` every 10 to 15 s. Hub countdown: `GET /api/trains?stop=<station id>` returns `arrivals[].minutes`.

**Lateness (Verna):** `GET /api/lateness` every 30 s. Use `lines[].color` for the line color and `lines[].badge` for the text.

**Check-in (Angie):**
```ts
const { data, error } = await supabase.rpc("check_in", {
  p_quest_id: quest.id,
  p_lat: pos.coords.latitude,
  p_lon: pos.coords.longitude,
  p_qr: null,          // or the scanned code for event quests
  p_squad_id: null,    // or the active squad id
});
// data = { xp_awarded, xp_breakdown: [{reason, xp}], first_visit, new_neighborhood, cross_school,
//          neighborhood, neighborhood_quests, tier, next_tier, quests_to_next_tier,
//          total_xp, level, xp_to_next_level }
// reasons: base | first_visit | new_neighborhood | squad | cross_school
// error.hint is a stable code: NOT_SIGNED_IN, QUEST_NOT_FOUND, QR_MISMATCH, LOCATION_REQUIRED,
//   TOO_FAR, NOT_IN_SQUAD, ALREADY_CHECKED_IN_TODAY. error.message is human text and may change.
```

Demo accounts (`profiles.is_demo = true`) can check in without a location:
`update public.profiles set is_demo = true where email in ('demo1@bu.edu', ...);`

**Squad members:** `supabase.from("squad_member_profiles").select("*").eq("squad_id", id)`

**Time filter:** `quests.duration_min` (at the spot) and `quests.walk_min` (station to spot, one way). A quest fits when ride + 2 x walk_min + duration_min <= minutes available.

**Levels:** `profiles.level` and `profiles.xp_to_next_level` (a level every 250 XP).

**Passport:** `supabase.from("passport").select("*").eq("user_id", user.id)` (includes `next_tier`, `quests_to_next_tier`)

**Leaderboard:** `supabase.from("leaderboard_weekly").select("*")`

**Sign-up error:** a non-school email fails (Supabase may show only "Database error saving new user"; the database hint is SCHOOL_NOT_SUPPORTED). Check the domain in the UI first and show "Use your school email."

**Demo tip:** to make the table QR quest, set `qr_code = 'OUTBOUND-EXPO'` on one event quest, and print that text as a QR code.

## Step 6. Vultr (optional, only after Steps 1 to 5 work)

1. Create the smallest Ubuntu VM with the MLH credits.
2. `ssh root@<ip>`, then `apt update && apt install -y python3-venv git`.
3. Copy the `tracker` folder over (`scp -r tracker root@<ip>:~/`), repeat Step 2's install.
4. Run it in the background: `nohup python tracker.py > tracker.log 2>&1 &`
5. Stop the laptop copy so you don't double-record.

## Step 7. Replay mode file (before the Green Line ride and before judging)

```bash
python export_replay.py --minutes 30 --out replay.json
# or a specific window: --start "2026-11-21 19:30" --minutes 20
```

Give `replay.json` to Verna.

## XP rules (Suki can change the numbers in `check_in()`)

- Base: the quest's `xp`
- +25 the first time you ever do that quest
- +25 your first quest in a new neighborhood
- x1.2 when done with a squad
- x2 when a squad-mate from a **different school** checked in to the same quest within 60 min (both get the gold border)
- Passport tier per neighborhood: bronze 1 to 2 quests, silver 3 to 4, gold 5+
- Leaderboard: resets Mondays (Boston time); a school needs 5+ players to be `eligible`

## Gamification handoff

On an existing Outbound database, run only `supabase/005_gamification.sql` after 004.
Then wire these calls into the frontend:

| UI | Backend |
| --- | --- |
| Signed-in passport or profile | `supabase.rpc("my_game_progress")` returns `badges`, `current_streak`, and `longest_streak`. Refresh after check-in. |
| Players tab by the school rankings | `supabase.from("leaderboard_players_weekly").select("*").order("rank").order("user_id").limit(10)` |
| Weekly quest highlight | `supabase.rpc("quest_of_the_week")` returns zero or one row with `quest_id`, `week_start`, and `base_xp_multiplier`. The `check_in` response lists the extra base XP as `quest_of_the_week` in `xp_breakdown`. |
| Share a quest | `/api/share-card/<questId>` renders a PNG with a QR linking to `/q/<questId>`. That page shows the quest and station. The card contains only catalog details. |

Line Collector credits the Red, Orange, and Green lines served by visited stations,
including multiple lines at a transfer stop. Night Owl credits check-ins from
10 PM up to midnight. Squad Goals counts three distinct players including you
in the same squad at the same station within one hour. Cross-town counts four
distinct neighborhoods in one Monday–Sunday week. A streak stays active until
you miss a full Boston calendar day.

Rankings show only public players and count only visible visits. The featured quest is fixed for each Boston calendar week. It is selected on first access using last week's recommendations among non-QR quests with positive XP. Ties and weeks without votes use quest ID order. The first check-in to the featured quest each week earns an extra copy of its base XP.
After check-in, call `supabase.rpc("recommend_quest", { p_quest_id: quest.id })` to record a recommendation for the current week.
