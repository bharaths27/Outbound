"""Sample bus routes for when the live MBTA bus feed can't be reached: every MBTA bus route on its real street shape.

Source: MBTA GTFS (copy at github.com/transitmatters/mbta-gtfs-edgedb `feed/`: routes.txt, trips.txt, shapes.txt).
For each bus route (route_type 3), takes the shape most trips use in direction 0, simplifies it to ~4 m,
and sets how many sample buses run on it by its length (about one per 3 km, 2 to 10).
On the map the shapes are snapped onto the drawn streets (bus-track.ts snapToRoads).
Usage: python3 bus_samples.py <gtfs dir>  ->  public/data/bus-samples.json
  {"routes": [{route, number, silver, ends, buses, path: [[lng, lat], ...]}]}
"""
import csv, json, math, sys, collections

gtfs = sys.argv[1]
SILVER = {"741": "SL1", "742": "SL2", "743": "SL3", "746": "SLW", "749": "SL5", "751": "SL4"}

# regular bus routes only (no rail-replacement shuttles)
routes = [r for r in csv.DictReader(open(f"{gtfs}/routes.txt")) if r["route_type"] == "3" and "shuttle" not in (r["route_long_name"] + r["route_short_name"] + r["route_desc"]).lower() and not r["route_id"].startswith("Shuttle")]
use = collections.defaultdict(collections.Counter)
heads = {}
for t in csv.DictReader(open(f"{gtfs}/trips.txt")):
    if t["direction_id"] == "0" and t["shape_id"]:
        use[t["route_id"]][t["shape_id"]] += 1
        heads[(t["route_id"], t["shape_id"])] = t["trip_headsign"]
want = {rid: c.most_common(1)[0][0] for rid, c in use.items() if c}
pts = collections.defaultdict(list)
wanted = set(want.values())
for s in csv.DictReader(open(f"{gtfs}/shapes.txt")):
    if s["shape_id"] in wanted:
        pts[s["shape_id"]].append((int(s["shape_pt_sequence"]), float(s["shape_pt_lon"]), float(s["shape_pt_lat"])))

def meters(a, b):
    return math.hypot((a[0] - b[0]) * 111_320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 110_570)

def simplify(p, tol=4.0):
    """Douglas-Peucker in meters."""
    if len(p) < 3: return p
    keep = [False] * len(p); keep[0] = keep[-1] = True
    stack = [(0, len(p) - 1)]
    while stack:
        i, j = stack.pop()
        a, b = p[i], p[j]; L = meters(a, b) or 1e-9
        best, k = 0, -1
        for m in range(i + 1, j):
            # distance from p[m] to segment a-b (local meters)
            kx = 111_320 * math.cos(math.radians(a[1]))
            ax, ay, bx, by, px, py = 0, 0, (b[0] - a[0]) * kx, (b[1] - a[1]) * 110_570, (p[m][0] - a[0]) * kx, (p[m][1] - a[1]) * 110_570
            t = max(0, min(1, (px * bx + py * by) / (L * L)))
            d = math.hypot(px - bx * t, py - by * t)
            if d > best: best, k = d, m
        if best > tol:
            keep[k] = True; stack += [(i, k), (k, j)]
    return [q for q, f in zip(p, keep) if f]

out = []
for r in sorted(routes, key=lambda r: int(r["route_sort_order"] or 0)):
    sid = want.get(r["route_id"])
    if not sid or len(pts[sid]) < 2: continue
    line = [(lng, lat) for _, lng, lat in sorted(pts[sid])]
    length = sum(meters(a, b) for a, b in zip(line, line[1:]))
    path = [[round(x, 5), round(y, 5)] for x, y in simplify(line)]
    a, _, b = r["route_long_name"].partition(" - ")
    out.append({
        "route": r["route_id"],
        "number": SILVER.get(r["route_id"], r["route_short_name"] or r["route_id"]),
        **({"silver": True} if r["route_id"] in SILVER else {}),
        "ends": [heads.get((r["route_id"], sid)) or a, b or a],  # [direction 0 (along the path), the way back]
        "buses": max(2, min(10, round(length / 3000))),
        "path": path,
    })
json.dump({"source": "MBTA GTFS (route shapes); positions are simulated", "routes": out}, open("public/data/bus-samples.json", "w"), separators=(",", ":"))
print(len(out), "routes,", sum(r["buses"] for r in out), "buses,", sum(len(r["path"]) for r in out), "points")
