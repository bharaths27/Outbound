# Main roads and big lakes for all of Massachusetts and its neighbors (Overture Maps / OpenStreetMap, ODbL), so the offline
# map is not blank outside the T area. Output: public/data/base/ma-roads.json, ma-water.json.  Usage: python3 overture_state.py
import os, json
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
from shapely import wkb
OUT = os.path.join(os.path.dirname(__file__), "../../public/data/base")
REL = "2026-11-18.0"
W, S, E, N = -73.6, 41.15, -69.85, 43.0
fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
def get(theme, typ, cols, extra):
    d = ds.dataset(f"overturemaps-us-west-2/release/{REL}/theme={theme}/type={typ}/", filesystem=fs, format="parquet")
    f = (pc.field("bbox", "xmin") > W) & (pc.field("bbox", "xmax") < E) & (pc.field("bbox", "ymin") > S) & (pc.field("bbox", "ymax") < N) & extra
    return d.to_table(filter=f, columns=cols).to_pylist()
R = lambda cs: [[round(x, 4), round(y, 4)] for x, y in cs]
RANK = {"motorway": 3, "trunk": 2, "primary": 1, "secondary": 0}
from shapely.ops import linemerge
from shapely.geometry import MultiLineString
byrank = {v: [] for v in RANK.values()}
for r in get("transportation", "segment", ["geometry", "class"], pc.field("class").isin(list(RANK))):
    g = wkb.loads(r["geometry"])
    if g.geom_type == "LineString": byrank[RANK[r["class"]]].append(g)
roads = []
for rank, ls in byrank.items():  # join the short segments into long lines, then simplify (~20 m)
    m = linemerge(MultiLineString(ls)).simplify(0.0002)
    lines = [m] if m.geom_type == "LineString" else list(m.geoms)
    roads.append({"type": "Feature", "properties": {"r": rank}, "geometry": {"type": "MultiLineString", "coordinates": [R(l.coords) for l in lines if len(l.coords) > 1]}})
json.dump({"type": "FeatureCollection", "features": roads}, open(f"{OUT}/ma-roads.json", "w"), separators=(",", ":"))
water = []
for r in get("base", "water", ["geometry", "subtype"], pc.field("subtype").isin(["lake", "reservoir", "pond", "river", "ocean"])):
    g = wkb.loads(r["geometry"])
    if g.geom_type in ("Polygon", "MultiPolygon") and g.area > 4e-6:  # ~3 hectares and up... in deg^2 (~0.04 km2)
        g = g.simplify(0.0003)
        polys = [g] if g.geom_type == "Polygon" else list(g.geoms)
        water.append({"type": "Feature", "properties": {}, "geometry": {"type": "MultiPolygon", "coordinates": [[R(p.exterior.coords)] for p in polys if not p.is_empty]}})
json.dump({"type": "FeatureCollection", "features": water}, open(f"{OUT}/ma-water.json", "w"), separators=(",", ":"))
print(sum(len(f["geometry"]["coordinates"]) for f in roads), "roads", len(water), "water")
