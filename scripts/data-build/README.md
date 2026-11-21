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
| `campus_cam.py` | `campuses.geojson` and the Cambridge layers |
| `search_index.py` | `search-places.json` ([name, kind, lng, lat]) |
| `street_labels.py` | `street-labels.geojson` (offline street names: Boston street samples + Cambridge `Trans/Street_Centerlines`) |

`public/data/fonts/*.json` are Noto Sans glyphs (Latin, 0-255) from github.com/maplibre/demotiles (SIL Open Font License),
base64-wrapped so the offline map can draw labels where only text/data files are served.
