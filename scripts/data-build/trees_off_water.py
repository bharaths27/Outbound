# Drops trees that the aerial-photo detector placed on the river/harbor (they floated on the water).
# Usage: python3 trees_off_water.py public/data   (rewrites trees.json in place)
import json, sys
from shapely.geometry import shape, Point
from shapely.ops import unary_union
from shapely.prepared import prep
D = sys.argv[1]
polys = [shape(f["geometry"]).buffer(0) for p in ("base/water.geojson", "cambridge/water.geojson") for f in json.load(open(f"{D}/{p}"))["features"]]
water = prep(unary_union(polys).buffer(0.00004))  # ~4 m off the shore
t = json.load(open(f"{D}/trees.json"))
keep = [p for p in t if not water.contains(Point(p[0], p[1]))]
json.dump(keep, open(f"{D}/trees.json", "w"), separators=(",", ":"))
print(len(t), "->", len(keep))
