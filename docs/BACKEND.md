# Outbound backend guide (for Verna and Angie)

Everything the frontend can call. Live at **https://outbound-red.vercel.app**. Questions → Bharath.

**Rules**
- Browser code uses only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (via `src/lib/supabase/client.ts`). Never import `MBTA_API_KEY`, `TIGER_DATA_URL`, `GEMINI_API_KEY` or `SUPABASE_SECRET_KEY` in client code; call our `/api/*` routes instead.
- Row-level security decides what each user sees. If a query returns `[]` instead of an error, that's privacy working (e.g. a friends-only player's passport).
- Switch from mock to real data with `NEXT_PUBLIC_DATA_SOURCE=supabase` (in `.env.local`, and in Vercel when ready).

**Demo logins** (password from Bharath, don't post it): `outbound-demo1@bu.edu`, `outbound-demo2@northeastern.edu`, `outbound-demo3@mit.edu`, `outbound-demo4@harvard.edu`. They're `is_demo`, so they can check in anywhere without location. 27 seeded players fill the leaderboard.

---

## 1. Next.js API routes (our server)

### `GET /api/trains` (Verna: poll every 10-15 s)
```
{ updatedAt, trains: [{ id, line, route, lat, lon, bearing, status, stopId, directionId, occupancy }] }
```
`GET /api/trains?stop=place-kencl` adds `arrivals: [{ route, line, directionId, arrivalTime, minutes, status }]` for the station hub countdown.

### `GET /api/lateness` (Verna: poll every 30-60 s)
```
{ updatedAt, lines: [{ line, nowDelayMin, normalDelayMin, vsNormalMin, method, samples, color, badge }] }
```
Use `color` (`green | yellow | orange | red | gray`) for the line and `badge` ("Orange Line +8 min") as the text. `normalDelayMin` is null until there's history.

### `POST /api/search` (Angie: search bar)
```ts
const r = await fetch("/api/search", { method: "POST", body: JSON.stringify({ q: "cheap dumplings 40 min" }) });
// { filters: { craving: "food", budget: 1, minutes: 40 }, tags: ["dumplings"], keywords: [], source: "gemini" }
```
Show quests whose `vibe_tags` overlap `tags`, or whose title/description contains a `keyword`. Never errors on normal input: if Gemini is down it answers with `source: "fallback"`.

---

## 2. Supabase reads

```ts
import { supabase } from "@/lib/supabase/client";
```

| What | Query | Who can read |
| --- | --- | --- |
| Stations (108, Red/Orange/Green) | `supabase.from("stations").select("*")` | everyone |
| Quests | `supabase.from("quests").select("*")` or `.eq("station_id", id)` | everyone |
| Schools (name, color) | `supabase.from("schools").select("*")` | everyone |
| Weekly school leaderboard | `supabase.from("leaderboard_weekly").select("*")` | everyone |
| My profile | `supabase.from("profiles").select("*, schools(name,color)").eq("id", user.id).single()` | logged in |
| My passport | `supabase.from("passport").select("*").eq("user_id", user.id)` | logged in |
| My squad's members | `supabase.from("squad_member_profiles").select("*").eq("squad_id", id)` | logged in, own squads only |
| My squads | `supabase.from("squad_members").select("squad_id, squads(name, code)").eq("user_id", user.id)` | logged in |

**Row shapes**

```ts
// stations
{ id: "place-kencl", name, lines: string[], lat, lon, neighborhood, story: string | null }

// quests
{ id, station_id, type: "food" | "event" | "scenic", title, description, lat, lon,
  price_tier: 0|1|2|3, vibe_tags: string[], hours: string | null, photo_url: string | null,
  xp, checkin_radius_m, qr_code: string | null, duration_min, walk_min }

// profiles
{ id, email, school_id, display_name, avatar_url, xp, level, xp_to_next_level,
  privacy: "public" | "friends" | "ghost", is_demo }

// passport (one row per neighborhood)
{ user_id, neighborhood, quests_done, tier: "bronze"|"silver"|"gold",
  next_tier: "silver"|"gold"|null, quests_to_next_tier, has_cross_school_stamp,
  stamps: [{ quest_id, at, cross_school }] }

// leaderboard_weekly (sorted: eligible first, then XP)
{ school_id, name, color, weekly_xp, players, eligible }   // eligible = 5+ players; resets Monday

// squad_member_profiles
{ squad_id, user_id, display_name, avatar_url, school_id, school_name, school_color, joined_at }
```

**Field rules**
- `hours`: `"HH:MM-HH:MM"` 24 h Boston time, or `"always"`. End earlier than start = closes after midnight (`"11:00-02:00"`).
- Time filter: a quest fits when `ride_min + 2 * walk_min + duration_min <= minutes available`.
- Levels: one every 250 XP. Tiers per neighborhood: bronze 1-2 quests, silver 3-4, gold 5+.

---

## 3. Check in (the core loop)

```ts
const { data, error } = await supabase.rpc("check_in", {
  p_quest_id: quest.id,
  p_lat: pos?.coords.latitude ?? null,
  p_lon: pos?.coords.longitude ?? null,
  p_qr: scannedCode ?? null,     // event quests, e.g. the expo table "OUTBOUND-EXPO"
  p_squad_id: activeSquadId ?? null,
});
```
Success (`data`):
```ts
{ xp_awarded, xp_breakdown: [{ reason: "base"|"first_visit"|"new_neighborhood"|"squad"|"cross_school", xp }],
  first_visit, new_neighborhood, cross_school, neighborhood, neighborhood_quests,
  tier, next_tier, quests_to_next_tier, total_xp, level, xp_to_next_level }
```
Errors: switch on **`error.hint`** (stable), show `error.message` (human text):

| `error.hint` | Show the user |
| --- | --- |
| `NOT_SIGNED_IN` | Send to /login |
| `LOCATION_REQUIRED` | "Turn on location to check in" |
| `TOO_FAR` | message has the distance: "too far: 120 m away (need within 75 m)" |
| `QR_MISMATCH` | "That QR code isn't for this quest" |
| `ALREADY_CHECKED_IN_TODAY` | "Already got this one today. Come back tomorrow!" |
| `NOT_IN_SQUAD` | "You're not in that squad" |
| `QUEST_NOT_FOUND` | "Quest not found" |

XP rules: base quest XP, +25 first time at that quest, +25 first quest in a new neighborhood, +20% with a squad, ×2 if a squad-mate from a **different school** checked in to the same quest within 60 min (both get the gold border: `cross_school: true`).

---

## 4. Sign up / log in

```ts
await supabase.auth.signUp({ email, password });           // school emails only
await supabase.auth.signInWithPassword({ email, password });
```
Non-school emails are rejected by the database (hint `SCHOOL_NOT_SUPPORTED`), but Supabase may only show "Database error saving new user", so check the domain in the UI first. Supported: bu.edu, northeastern.edu, mit.edu, harvard.edu, tufts.edu, emerson.edu, suffolk.edu, bc.edu, umb.edu, berklee.edu, wit.edu, simmons.edu, massart.edu (subdomains like `g.harvard.edu` work). Email confirmation is off.

---

## 5. Squads and friends (writes)

```ts
// create a squad (code is generated, e.g. "7F3A9C")
const { data: squad } = await supabase.from("squads").insert({ name, created_by: user.id }).select().single();
await supabase.from("squad_members").insert({ squad_id: squad.id, user_id: user.id });

// join by code
const { data: s } = await supabase.from("squads").select("id").eq("code", code.toUpperCase()).single();
await supabase.from("squad_members").insert({ squad_id: s.id, user_id: user.id });

// leave
await supabase.from("squad_members").delete().eq("squad_id", id).eq("user_id", user.id);

// friends: send, accept (by the receiver), remove
await supabase.from("friends").insert({ user_id: user.id, friend_id: otherId });
await supabase.from("friends").update({ status: "accepted" }).eq("user_id", otherId).eq("friend_id", user.id);
await supabase.from("friends").delete().or(`user_id.eq.${otherId},friend_id.eq.${otherId}`);

// privacy setting, hide a visit
await supabase.from("profiles").update({ privacy: "friends" }).eq("id", user.id);
await supabase.from("visits").update({ hidden: true }).eq("id", visitId);
```
Visits can't be inserted directly; only `check_in` creates them.

---

## 6. Types
`src/lib/types.ts` is missing the newer fields. When you next touch it, add to `Quest`: `checkin_radius_m: number; qr_code: string | null; duration_min: number; walk_min: number;` and use the `check_in` success shape above for `CheckInResult`.
