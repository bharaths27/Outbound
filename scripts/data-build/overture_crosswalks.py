# Crosswalk stripes at street intersections for the whole T area, from Overture Maps road segments (OpenStreetMap, ODbL).
# An intersection is a connector shared by 3+ road legs where at least one road is a main street (tertiary or bigger).
# Each leg gets a short line across the road, a few meters back from the corner; the map draws it as a thick dashed
# white line, which looks like zebra stripes.
# Output: public/data/ground/crosswalks.json.  Usage: python3 overture_crosswalks.py <out dir>
import sys, os, json, math, collections
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
from shapely import wkb
from shapely.ops import substring
OUT = sys.argv[1]
REL = "2026-11-18.0"
W, S, E, N = -71.30, 42.195, -70.955, 42.475
fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
d = ds.dataset(f"overturemaps-us-west-2/release/{REL}/theme=transportation/type=segment/", filesystem=fs, format="parquet")
f = (pc.field("bbox", "xmin") > W) & (pc.field("bbox", "xmax") < E) & (pc.field("bbox", "ymin") > S) & (pc.field("bbox", "ymax") < N)
rows = d.to_table(filter=f, columns=["geometry", "subtype", "class", "connectors"]).to_pylist()
# road half-widths in meters (sidewalk to sidewalk is wider; the crosswalk spans the roadway)
HALF = {"motorway": 0, "trunk": 9, "primary": 8, "secondary": 7, "tertiary": 6, "residential": 4.5, "unclassified": 4.5, "living_street": 3.5}
MAIN = {"trunk", "primary", "secondary", "tertiary"}
KX, KY = 111320 * math.cos(math.radians(42.34)), 110540
legs = collections.defaultdict(list)  # connector -> [(line, at, class)]
for r in rows:
    if r["subtype"] != "road" or r["class"] not in HALF or not r["connectors"]: continue
    g = wkb.loads(r["geometry"])
    for c in r["connectors"]:
        legs[c["connector_id"]].append((g, c["at"], r["class"]))
out = []
for cid, ls in legs.items():
    n = sum(1 if at in (0, 1) else 2 for _, at, _ in ls)
    if n < 3 or not any(c in MAIN for _, _, c in ls) or any(c == "motorway" for _, _, c in ls): continue
    corner = max(HALF[c] for _, _, c in ls)  # step back past the widest crossing road
    for g, at, cls in ls:
        hw = HALF[cls]
        Lm = g.length * math.hypot(KX, KY) / math.sqrt(2)  # rough meters
        if Lm < 25: continue
        for direction in ([1] if at == 0 else [-1] if at == 1 else [1, -1]):
            dist = (corner + 2.5) / Lm  # fraction along the segment
            t = at + direction * dist
            if not 0 < t < 1: continue
            p = g.interpolate(t, normalized=True)
            q = g.interpolate(min(1, max(0, t + 0.5 / Lm)), normalized=True)
            dx, dy = (q.x - p.x) * KX, (q.y - p.y) * KY
            m = math.hypot(dx, dy)
            if m == 0: continue
            nx, ny = -dy / m * hw, dx / m * hw  # perpendicular, meters
            a = [round(p.x + nx / KX, 5), round(p.y + ny / KY, 5)]
            b = [round(p.x - nx / KX, 5), round(p.y - ny / KY, 5)]
            out.append([a, b])
json.dump({"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": out}}, open(os.path.join(OUT, "crosswalks.json"), "w"), separators=(",", ":"))
print(len(out), "crosswalks")
