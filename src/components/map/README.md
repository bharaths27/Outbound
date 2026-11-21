# Map (Person 1)

Live 3D map of the T on a globe: whole USA, zooms into Massachusetts and Boston.

| File | What |
| --- | --- |
| `TransitMap.tsx` | The map page: controls, station card with live countdown, train card, replay bar |
| `style.ts` | Basemap: OpenFreeMap Liberty (real OpenStreetMap data, no key) restyled, 3D buildings, campus highlight, Esri satellite toggle |
| `trains3d.ts` | Train animation along the real track + three.js layer that draws every car |
| `trainModels.ts` | 3D models of the current cars: Red #1900, Orange #1400, Green Type 9 |
| `track.ts` | Snaps trains onto the track and walks along it (so cars follow curves) |
| `feed.ts` | Live `/api/trains` every 12 s, `/api/lateness`, replay, demo fallback |
| `places.ts` | Campus pins and sample friend visits |

Data in `public/data/` comes from `scripts/build_transit_data.py` (MassGIS track + stations, TransitMatters stop ids).

## Fallbacks for the demo
1. Live: `GET /api/trains` every 12 s (needs `MBTA_API_KEY` in `.env.local`).
2. Replay: if live fails twice, plays `public/replay.json` (make it with `backend/tracker/export_replay.py --minutes 30 --out ../../public/replay.json`),
   or else the last ~12 min of live trains this browser saved.
3. Demo: simulated trains on the real track, clearly labelled, only if there is nothing to replay.

Lateness numbers fall back to labelled sample values until `/api/lateness` returns data.
Friends use `SAMPLE_FRIEND_VISITS` in `places.ts` until the friends endpoint exists.
