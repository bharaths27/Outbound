# Commuter Rail lines and stations (so the map reaches Brandeis, Salem, Worcester, Providence...), from an MBTA
# GTFS feed (copy at github.com/OkuraKenG/Trains gtfs_data/mbta: routes, trips, shapes, stops).
# Usage: python3 commuter_rail.py <gtfs dir> <out dir>  ->  cr-lines.geojson, cr-stations.json
import csv, sys, json, collections, math, re
G, OUT = sys.argv[1], sys.argv[2]
rows = lambda f: list(csv.DictReader(open(f"{G}/{f}", encoding="utf-8-sig")))
routes = {r["route_id"]: r for r in rows("routes.txt") if r["route_id"].startswith("CR-") and r["route_id"] != "CR-Foxboro"}
use = collections.Counter()
for t in rows("trips.txt"):
    if t["route_id"] in routes and t["shape_id"]: use[(t["route_id"], t["shape_id"])] += 1
best = collections.defaultdict(list)
for (r, s), n in use.items(): best[r].append((n, s))
keep = {}
for r, lst in best.items():
    top = max(n for n, _ in lst)
    for n, s in lst:
        if n >= top * 0.15: keep[s] = r
pts = collections.defaultdict(list)
for p in csv.DictReader(open(f"{G}/shapes.txt")):
    if p["shape_id"] in keep: pts[p["shape_id"]].append((int(p["shape_pt_sequence"]), float(p["shape_pt_lon"]), float(p["shape_pt_lat"])))
def simplify(c, tol=0.00004):
    if len(c) < 3: return c
    a, b = c[0], c[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1e-12
    i, dmax = 0, 0
    for k in range(1, len(c) - 1):
        d = abs(dy * c[k][0] - dx * c[k][1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax: i, dmax = k, d
    return simplify(c[:i + 1], tol)[:-1] + simplify(c[i:], tol) if dmax > tol else [a, b]
feats, lines = [], collections.defaultdict(list)
for s, p in pts.items():
    c = [[round(x, 5), round(y, 5)] for _, x, y in sorted(p)]
    c = simplify(c)
    r = routes[keep[s]]
    feats.append({"type": "Feature", "properties": {"route": r["route_id"], "name": r["route_long_name"], "color": "#" + r["route_color"]}, "geometry": {"type": "LineString", "coordinates": c}})
    lines[r["route_id"]].append(c)
json.dump({"type": "FeatureCollection", "features": feats}, open(f"{OUT}/cr-lines.geojson", "w"), separators=(",", ":"))
# stations: commuter rail parent stations, tagged with the nearest line(s)
stops = rows("stops.txt"); by = {s["stop_id"]: s for s in stops}
par = {}
for s in stops:
    if s["location_type"] == "1" and re.match(r"place-[A-Z]+-\d{4}$", s["stop_id"]):  # commuter rail stations
        par[s["stop_id"]] = s
out = []
for sid, p in par.items():
    x, y = float(p["stop_lon"]), float(p["stop_lat"]); kx = math.cos(math.radians(y))
    dist = {r: min(math.hypot((q[0] - x) * kx, q[1] - y) for c in cs for q in c) for r, cs in lines.items()}
    dmin = min(dist.values())
    if dmin > 0.01: continue  # ~1 km from any line we draw (e.g. CapeFlyer-only stops)
    near = sorted(r for r, d in dist.items() if d < max(0.0015, dmin * 1.5))
    out.append({"id": sid, "name": p["stop_name"], "lat": round(y, 6), "lon": round(x, 6), "routes": near, "town": p["municipality"]})
json.dump(out, open(f"{OUT}/cr-stations.json", "w"), separators=(",", ":"))
print(len(feats), "shapes", len(out), "stations")
