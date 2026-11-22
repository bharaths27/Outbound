# Street-level map for the whole T area from Overture Maps (OpenStreetMap data, ODbL): every road, path and sidewalk,
# water, parks, woods. Read from Overture's public S3 bucket.
# Output (public/data/ground/): major.json (big roads, always loaded), minor_<i>_<j>.json (residential/service roads and
# footpaths per 0.06 deg cell, loaded near the view), water.json, green.json, manifest.json.
# Usage: python3 overture_ground.py <out dir>
import sys, os, json, collections
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
from shapely import wkb
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
REL = "2026-11-18.0"
W, S, E, N = -71.30, 42.195, -70.955, 42.475
CELL = 0.06
fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
def get(theme, typ, cols):
    d = ds.dataset(f"overturemaps-us-west-2/release/{REL}/theme={theme}/type={typ}/", filesystem=fs, format="parquet")
    f = (pc.field("bbox", "xmin") > W - 0.05) & (pc.field("bbox", "xmax") < E + 0.05) & (pc.field("bbox", "ymin") > S - 0.05) & (pc.field("bbox", "ymax") < N + 0.05)
    return d.to_table(filter=f, columns=cols).to_pylist()
TOL = 0.000009  # ~1 m
def coords(g, tol=TOL):
    g = g.simplify(tol, preserve_topology=False)
    if g.is_empty: return None
    r = lambda cs: [[round(x, 5), round(y, 5)] for x, y in cs]
    if g.geom_type == "LineString": return {"type": "LineString", "coordinates": r(g.coords)}
    if g.geom_type == "Polygon": return {"type": "Polygon", "coordinates": [r(g.exterior.coords)] + [r(i.coords) for i in g.interiors]}
    if g.geom_type == "MultiPolygon": return {"type": "MultiPolygon", "coordinates": [[r(p.exterior.coords)] + [r(i.coords) for i in p.interiors] for p in g.geoms]}
    if g.geom_type == "MultiLineString": return {"type": "MultiLineString", "coordinates": [r(l.coords) for l in g.geoms]}
    return None
def feat(g, props, tol=TOL):
    c = coords(g, tol)
    return c and {"type": "Feature", "properties": props, "geometry": c}
def dump(name, feats):
    json.dump({"type": "FeatureCollection", "features": [f for f in feats if f]}, open(f"{OUT}/{name}", "w"), separators=(",", ":"))

MAJOR = {"motorway": 5, "trunk": 4, "primary": 3, "secondary": 2, "tertiary": 1}
MINOR = {"residential", "unclassified", "living_street", "service", "pedestrian"}
PATHS = {"footway", "path", "steps", "cycleway"}
major, minor = [], collections.defaultdict(list)
for r in get("transportation", "segment", ["geometry", "subtype", "class", "names"]):
    if r["subtype"] != "road": continue
    c = r["class"]; g = wkb.loads(r["geometry"])
    name = (r["names"] or {}).get("primary") or ""
    if c in MAJOR: major.append(feat(g, {"k": "major", "r": MAJOR[c], "n": name}))
    elif c in MINOR or c in PATHS:
        p = g.interpolate(0.5, normalized=True)
        cell = (int((p.x - W) // CELL), int((p.y - S) // CELL))
        k = "path" if c in PATHS else ("service" if c == "service" else "minor")
        minor[cell].append(feat(g, {"k": k, "n": name if k == "minor" else ""}))
dump("major.json", major)
cells = []
for (i, j), fs_ in minor.items():
    dump(f"minor_{i}_{j}.json", fs_); cells.append({"file": f"minor_{i}_{j}.json", "bbox": [W + i * CELL, S + j * CELL, W + (i + 1) * CELL, S + (j + 1) * CELL]})
WATER = {"water", "river", "pond", "bay", "reservoir", "basin", "lake", "canal", "dock", "tidal_channel", "oxbow", "swimming_pool", "ocean", "lagoon", "fountain"}
water = []
for r in get("base", "water", ["geometry", "subtype", "class"]):
    g = wkb.loads(r["geometry"])
    if g.geom_type in ("Polygon", "MultiPolygon") and (r["class"] in WATER or r["subtype"] in ("ocean", "lake", "pond", "reservoir", "water")):
        water.append(feat(g, {"k": "pool" if r["class"] == "swimming_pool" else "water"}, TOL * 2))
    elif g.geom_type in ("LineString", "MultiLineString") and r["class"] in ("stream", "river", "canal"):
        water.append(feat(g, {"k": "stream"}))
dump("water.json", water)
GREEN = {"park": "park", "grass": "grass", "pitch": "pitch", "playground": "park", "garden": "park", "recreation_ground": "park", "golf_course": "grass", "fairway": "grass",
         "green": "grass", "tee": "grass", "cemetery": "cemetery", "village_green": "grass", "meadow": "grass", "nature_reserve": "wood", "forest": "wood", "school": "school", "college": "school", "university": "school"}
green = []
for r in get("base", "land_use", ["geometry", "subtype", "class"]):
    k = GREEN.get(r["class"])
    g = wkb.loads(r["geometry"])
    if k and g.geom_type in ("Polygon", "MultiPolygon") and g.area > 1.5e-8: green.append(feat(g, {"k": k}, TOL * 2.5))
for r in get("base", "land", ["geometry", "subtype", "class"]):
    k = {"wood": "wood", "tree": "wood", "forest": "wood", "wetland": "wetland", "beach": "beach", "sand": "beach", "grass": "grass", "grassland": "grass", "scrub": "wood", "shrub": "wood"}.get(r["class"])
    g = wkb.loads(r["geometry"])
    if k and g.geom_type in ("Polygon", "MultiPolygon") and g.area > 8e-8: green.append(feat(g, {"k": k}, TOL * 3))  # skip small tree clumps (~700 m2)
dump("green.json", green)
json.dump({"source": f"Overture Maps {REL} (OpenStreetMap contributors, ODbL)", "minor": cells}, open(f"{OUT}/manifest.json", "w"))
print(len(major), "major", sum(len(v) for v in minor.values()), "minor in", len(cells), "cells", len(water), "water", len(green), "green")
