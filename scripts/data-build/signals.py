"""Traffic lights for the map: intersections where two different main roads meet.

Input:  public/data/ground/major.json (Overture/OpenStreetMap main roads, property r = road class 1-5, n = name)
Output: public/data/ground/signals.json  {"signals": [[lng, lat, [arm bearings in degrees]], ...]}

OpenStreetMap's own traffic_signals tags aren't in our offline road data, so this picks the intersections where a
light is very likely: two differently named roads of class 2+ (secondary and up) crossing. Highways (r = 5) are
skipped since they have ramps, not lights. Nearby duplicates (divided roads) are merged.
"""
import json, math, collections, sys

src = sys.argv[1] if len(sys.argv) > 1 else "public/data/ground/major.json"
out = sys.argv[2] if len(sys.argv) > 2 else "public/data/ground/signals.json"
feats = json.load(open(src))["features"]

def key(p): return (round(p[0], 6), round(p[1], 6))
def bearing(a, b):
    dx = (b[0] - a[0]) * math.cos(math.radians(a[1])); dy = b[1] - a[1]
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360

nodes = collections.defaultdict(lambda: {"names": set(), "arms": []})
for f in feats:
    r = f["properties"].get("r", 0); name = f["properties"].get("n") or ""
    if r < 2 or r >= 5: continue
    g = f["geometry"]
    lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []
    for c in lines:
        if len(c) < 2: continue
        for i, p in enumerate(c):
            n = nodes[key(p)]
            n["names"].add(name or f"?{id(f)}")
            if i > 0: n["arms"].append(bearing(p, c[i - 1]))
            if i < len(c) - 1: n["arms"].append(bearing(p, c[i + 1]))

M = 111_320
picked = []
grid = {}
for k, n in nodes.items():
    if len(n["names"]) < 2 or len(n["arms"]) < 3: continue
    lng, lat = k
    cell = (int(lng * 2000), int(lat * 2000))  # ~40 m cells
    near = [j for dx in (-1, 0, 1) for dy in (-1, 0, 1) for j in grid.get((cell[0] + dx, cell[1] + dy), [])]
    if any(math.hypot((picked[j][0] - lng) * M * math.cos(math.radians(lat)), (picked[j][1] - lat) * 110_570) < 30 for j in near): continue
    arms = []
    for b in sorted(n["arms"]):
        if all(min(abs(b - a), 360 - abs(b - a)) > 25 for a in arms): arms.append(round(b))
    grid.setdefault(cell, []).append(len(picked))
    picked.append([round(lng, 6), round(lat, 6), arms])

json.dump({"source": "intersections of main roads in major.json (scripts/data-build/signals.py)", "signals": picked}, open(out, "w"), separators=(",", ":"))
print(len(picked), "signals")
