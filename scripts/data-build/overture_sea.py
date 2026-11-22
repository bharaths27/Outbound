# The sea around Boston, from real coastlines (Overture Maps "land", built from OpenStreetMap coastlines, ODbL).
# The US-states outline is too coarse at the coast, so this paints the harbor and the open sea over it.
# Output: public/data/base/sea.json.  Usage: python3 overture_sea.py
import os, json
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
from shapely import wkb
from shapely.geometry import box, mapping
from shapely.ops import unary_union
OUT_PATH = os.path.join(os.path.dirname(__file__), "../../public/data/base/sea.json")
REL = "2026-11-18.0"
W, S, E, N = -71.9, 41.9, -70.3, 42.8  # well past the farthest the map can show
fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
d = ds.dataset(f"overturemaps-us-west-2/release/{REL}/theme=base/type=land/", filesystem=fs, format="parquet")
f = (pc.field("bbox", "xmax") > W) & (pc.field("bbox", "xmin") < E) & (pc.field("bbox", "ymax") > S) & (pc.field("bbox", "ymin") < N) & (pc.field("subtype") == "land")
area = box(W, S, E, N)
land = []
for r in d.to_table(filter=f, columns=["geometry", "subtype"]).to_pylist():
    g = wkb.loads(r["geometry"])
    if g.geom_type in ("Polygon", "MultiPolygon"):
        land.append(g.intersection(area))
sea = area.difference(unary_union(land)).simplify(0.0001)
sea = sea.buffer(0)
def rnd(o):
    if isinstance(o, (list, tuple)):
        return [rnd(x) for x in o] if not isinstance(o[0], float) else [round(o[0], 5), round(o[1], 5)]
    return o
geom = mapping(sea)
geom = {"type": geom["type"], "coordinates": rnd(geom["coordinates"])}
json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": geom}]}, open(OUT_PATH, "w"), separators=(",", ":"))
print(geom["type"], os.path.getsize(OUT_PATH))
