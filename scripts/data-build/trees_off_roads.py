# Drops trees that sit on a street, a T or commuter rail track, or inside a building (the aerial-photo detector
# sees canopy hanging over those). Run after trees.py / trees_off_water.py.
# Usage: python3 trees_off_roads.py public/data   (rewrites trees.json in place)
import json, math, sys, glob, warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
from shapely.geometry import shape, Point
from shapely.ops import unary_union, transform
from shapely.prepared import prep

D = sys.argv[1]
LAT0 = 42.36
KX, KY = 111_320 * math.cos(math.radians(LAT0)), 110_540
to_m = lambda x, y, z=None: (x * KX, y * KY)

t = json.load(open(f"{D}/trees.json"))
xs = [p[0] for p in t]; ys = [p[1] for p in t]
box = (min(xs) - 0.002, min(ys) - 0.002, max(xs) + 0.002, max(ys) + 0.002)
inside = lambda g: g.bounds[2] >= box[0] and g.bounds[0] <= box[2] and g.bounds[3] >= box[1] and g.bounds[1] <= box[3]

# full road widths in meters (same as the map: useBuses ROAD_W, style.ts widenToReal), plus 1 m of curb
MAJOR_W = {5: 22, 4: 15, 3: 15, 2: 12, 1: 12}
MINOR_W = {"minor": 9, "service": 5, "path": 0}
shapes = []
for f in json.load(open(f"{D}/ground/major.json"))["features"]:
    g = shape(f["geometry"])
    if inside(g): shapes.append(transform(to_m, g).buffer(MAJOR_W.get(f["properties"].get("r"), 12) / 2 + 1, cap_style="flat"))
for fn in glob.glob(f"{D}/ground/minor_*.json"):
    for f in json.load(open(fn))["features"]:
        w = MINOR_W.get(f["properties"].get("k"), 5)
        if not w: continue
        g = shape(f["geometry"])
        if inside(g): shapes.append(transform(to_m, g).buffer(w / 2 + 1, cap_style="flat"))
# T and commuter rail tracks: ~8 m for a double track, plus 2 m
for fn in ("mbta-lines.geojson", "cr-lines.geojson"):
    for f in json.load(open(f"{D}/{fn}"))["features"]:
        g = shape(f["geometry"])
        if inside(g): shapes.append(transform(to_m, g).buffer(6))
# buildings (Cambridge footprints; elsewhere the canopy detector already skipped roofs)
for f in json.load(open(f"{D}/cambridge/buildings.geojson"))["features"]:
    g = shape(f["geometry"]).buffer(0)
    if inside(g): shapes.append(transform(to_m, g))

blocked = prep(unary_union(shapes))
keep = [p for p in t if not blocked.contains(Point(p[0] * KX, p[1] * KY))]
json.dump(keep, open(f"{D}/trees.json", "w"), separators=(",", ":"))
print(len(t), "->", len(keep))
