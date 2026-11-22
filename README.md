# Outbound

Boston's T as a multiplayer exploration game for college students. Live 3D/2D map of Red, Orange and Green Line trains, station hubs with food, event and scenic quests filtered by craving, budget and time, XP, a Boston Passport, and a school leaderboard. Built at BostonHacks 2026.

## Run it

Use Node.js 22.13 or later.

```bash
npm install
cp .env.example .env.local   # fill in the keys (ask Bharath in DMs)
npm run dev                  # http://localhost:3000
```

### Try a Guide photo trip

Set `GEMINI_API_KEY` and a server-side `GOOGLE_MAPS_KEY` with Places API (New) and Routes API enabled in `.env.local`. In the app, open **Ask Guide** in the bottom-left of Explore or in the header on other app pages, click the camera, choose a dish or Boston landmark photo, and click **Ask**. Click **Use my location** and allow location access to see available MBTA directions. For dish photos, **Show Boston matches** searches near downtown without requesting location.

Run the photo-trip integration tests with `npm run test:photo-trip`.

## Where things live

| Path | What | Owner |
| --- | --- | --- |
| `src/app/page.tsx`, `src/components/map/` | Live map, trains, station markers, lateness colors, replay mode | Verna |
| `src/app/login`, `passport`, `leaderboard`, `station/[id]`, `q/[questId]`, `src/components/ui/` | App screens, filters, share card | Angie |
| `src/app/api/trains` | `GET /api/trains` live trains; `?stop=place-kencl` adds next arrivals | Bharath |
| `src/app/api/lateness` | `GET /api/lateness` per-line lateness from Tiger Data | Bharath |
| `backend/supabase/schema.sql` | All tables, school-email gate, `check_in()` RPC, passport and leaderboard views, RLS | Bharath, Suki |
| `backend/tigerdata/schema.sql`, `backend/tracker/` | Train tracker that saves MBTA data into Tiger Data; replay export | Bharath |
| `src/lib/types.ts` | Shared data shapes for every API | Everyone |
| `src/lib/lines.ts` | Official line colors | Everyone |

Backend setup steps: [`backend/SETUP.md`](backend/SETUP.md).

## Team rules

- Work on your own branch, merge to `main` at each checkpoint.
- Never commit `.env.local` or Tiger Data credential files.
- Change `src/lib/types.ts` only after telling the other pair.
