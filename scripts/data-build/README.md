# Building / campus / search data

One-off scripts that made the files in `public/data/bpda`, `public/data/cambridge`, `campuses.geojson` and `search-places.json`.
They were run once; the outputs are committed, so the app does not need these to run.

Sources (download them first, then edit the input paths at the top of each script):
- BPDA 3D Smart Model web export: github.com/Lilit-Lele/city-mapping (`web/data`). Note: that repo has no LICENSE file.
- City of Cambridge GIS: github.com/cambridgegis/cambridgegis_data (BASEMAP_Buildings, BASEMAP_Roads, HYDRO_WaterBodies, RECREATION_OpenSpace, landuse).

| Script | Makes |
| --- | --- |
| `lcc.py` | Massachusetts State Plane (EPSG:2249, feet) to lng/lat |
| `bpda_tiles.py` | `bpda/*.bin.gz` building meshes, `*.jpg` aerial photos, `manifest.json` |
| `campus_cam.py` | the Cambridge layers (its old `campuses.geojson` is replaced by `overture_campuses.py`) |
| `search_index.py` | `search-places.json` ([name, kind, lng, lat]) |
| `street_labels.py` | `street-labels.geojson` (offline street names: Boston street samples + Cambridge `Trans/Street_Centerlines`) |

`public/data/fonts/*.json` are Noto Sans glyphs (Latin, 0-255) from github.com/maplibre/demotiles (SIL Open Font License),
base64-wrapped so the offline map can draw labels where only text/data files are served.
| `overture_buildings.py` | `region/` buildings for the rest of the T area (Overture Maps, read from its public S3 bucket; ODbL) |
| `commuter_rail.py` | `cr-lines.geojson`, `cr-stations.json` (MBTA GTFS copy at github.com/OkuraKenG/Trains `gtfs_data/mbta`) |
| `bus_samples.py` | `bus-samples.json` every MBTA bus route on its real shape, for sample buses when the live feed is down (MBTA GTFS copy at github.com/transitmatters/mbta-gtfs-edgedb `feed/`) |
| `trees_off_water.py` | removes trees on water from `trees.json` (run after `trees.py`) |
| `overture_ground.py` | `ground/` streets, paths, sidewalks, parks, water for the T area (Overture Maps; ODbL) |
| `overture_crosswalks.py` | `ground/crosswalks.json` zebra crosswalks at main intersections (Overture Maps; ODbL) |
| `overture_campuses.py` | `campuses.geojson`, one real outline per school (Overture Maps / OpenStreetMap; ODbL) |
| `overture_state.py` | `base/ma-roads.json`, `base/ma-water.json`: main roads and lakes for all of MA and neighbors, for the offline map (Overture Maps; ODbL) |
