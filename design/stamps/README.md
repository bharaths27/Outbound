# Station stamps

One illustrated passport stamp per station with quests. `glyphs.py` holds each station's scene;
`render.py` draws the full stamp. Run `python3 design/stamps/build.py` from the repo root to rebuild:

- `public/stamps/<station-id>.svg`: standalone Gold stamps, one file per station.
- `src/features/passport/station-art.ts`: the same art, which `Stamp` recolors for each tier.

To add a station, add an entry to `STATIONS` in `glyphs.py` and rebuild.
