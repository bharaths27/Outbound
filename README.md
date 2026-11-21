# Outbound

Boston's T as a multiplayer exploration game for college students. Live 3D/2D map of Red, Orange and Green Line trains, station hubs with food, event and scenic quests filtered by craving, budget and time, XP, a Boston Passport, and a school leaderboard. Built at BostonHacks 2026.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the keys (ask Bharath in DMs)
npm run dev                  # http://localhost:3000
```

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
