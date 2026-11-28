# Map (Person 1)

Live 3D map of the T on a globe: whole USA, zooms into Massachusetts and Boston.

| File | What |
| --- | --- |
| `TransitMap.tsx` | The map page: controls, station card with live countdown, train card, replay bar |
| `style.ts` | Basemap: the Boston 3D map (OpenFreeMap Liberty as published, no key) with Map / Light / Satellite looks, streets at real width up close, offline fallback basemap |
| `osmFacades.ts` | Close-up 3D buildings from the basemap's own OSM buildings, with facades (windows, doors, shop fronts, brick, roofs) |
| `buildings3d.ts` | Older BPDA 3D city layer (not on the map since the Boston 3D base map; the manifest still feeds the offline basemap) |
| `SearchBox.tsx` | Search places, streets, stations, campuses (bundled index offline + Photon geocoder online) |
| `buses3d.ts`, `bus-track.ts` | Live buses: articulated 3D model that bends at the joint on turns; route shapes snapped onto the drawn streets |
| `trains3d.ts` | Train animation along the real track + three.js layer that draws every car |
| `trainModels.ts` | 3D models of the current cars: Red #1900, Orange #1400, Green Type 9 |
| `track.ts` | Snaps trains onto the track and walks along it (so cars follow curves) |
| `feed.ts` | Live `/api/trains` every 12 s, `/api/lateness`, replay, demo fallback |
| `places.ts` | Campus pins and sample friend visits |

Data in `public/data/` comes from `scripts/build_transit_data.py` (MassGIS track + stations, TransitMatters stop ids)
and `scripts/data-build/` (buildings, campuses, search index; see its README).

## Buildings, campuses, search
- Central Boston (Back Bay, downtown, Seaport, Fenway, South End, Longwood): real building models + 2023 aerial photos from the
  Boston Planning Department 3D Smart Model (`public/data/bpda/`, loaded tile by tile from zoom 12.5).
- Cambridge: real footprints with real roof heights from City of Cambridge GIS (`public/data/cambridge/`).
- Everywhere else: OpenStreetMap buildings from the basemap (hidden where the real ones are, to avoid doubles).
- Campuses: outline + see-through fill from real parcels/buildings (`public/data/campuses.geojson`); Tufts, BC, UMass Boston and Brandeis are pins only.
- Search: stations, campuses and ~3,000 streets/parks/landmarks work offline; online it also asks Photon (OpenStreetMap geocoder, no key).

## Fallbacks for the demo
1. Live: `GET /api/trains` every 12 s (needs `MBTA_API_KEY` in `.env.local`).
2. Replay: if live fails twice, plays `public/replay.json` (make it with `backend/tracker/export_replay.py --minutes 30 --out ../../public/replay.json`),
   or else the last ~12 min of live trains this browser saved.
3. Demo: simulated trains on the real track, clearly labelled, only if there is nothing to replay.

Lateness numbers fall back to labelled sample values until `/api/lateness` returns data.
Friends use `SAMPLE_FRIEND_VISITS` in `places.ts` until the friends endpoint exists.
