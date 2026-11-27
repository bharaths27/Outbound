"""Sample bus routes that follow real streets (used only when the live MBTA bus feed can't be reached).

Each route is a few waypoints; between them we take the shortest path over the main-road network in
public/data/ground/major.json, so sample buses drive on actual streets instead of cutting across blocks.
Output: public/data/bus-samples.json  {"routes": [{route, number, silver, ends, path: [[lng, lat], ...]}]}
"""
import json, math, heapq, collections

ROUTES = [
    ("57", "57", False, ["Watertown Yard", "Kenmore"], [(-71.0950, 42.3489), (-71.1054, 42.3504), (-71.1253, 42.3518), (-71.1337, 42.3530), (-71.1514, 42.3486)]),
    ("1", "1", False, ["Harvard", "Nubian"], [(-71.0838, 42.3294), (-71.0835, 42.3415), (-71.0877, 42.3478), (-71.0942, 42.3601), (-71.1037, 42.3655), (-71.1189, 42.3734)]),
    ("47", "47", False, ["Central", "Broadway"], [(-71.1000, 42.3360), (-71.0935, 42.3411), (-71.0950, 42.3489), (-71.1065, 42.3536), (-71.1037, 42.3655)]),
    ("66", "66", False, ["Nubian", "Harvard"], [(-71.1189, 42.3734), (-71.1310, 42.3610), (-71.1214, 42.3424), (-71.1168, 42.3327), (-71.0954, 42.3314), (-71.0838, 42.3294)]),
    ("39", "39", False, ["Forest Hills", "Back Bay"], [(-71.0757, 42.3474), (-71.0850, 42.3424), (-71.0960, 42.3375), (-71.1105, 42.3236), (-71.1137, 42.3005)]),
    ("749", "SL5", True, ["Nubian", "Downtown"], [(-71.0603, 42.3555), (-71.0640, 42.3498), (-71.0683, 42.3440), (-71.0765, 42.3330), (-71.0838, 42.3294)]),
]

feats = json.load(open("public/data/ground/major.json"))["features"]
K = lambda p: (round(p[0], 6), round(p[1], 6))
def dist(a, b):
    return math.hypot((a[0] - b[0]) * 111_320 * math.cos(math.radians(a[1])), (a[1] - b[1]) * 110_570)

graph = collections.defaultdict(list)
for f in feats:
    if f["properties"].get("r", 0) < 1 or f["properties"].get("r") == 5: continue
    g = f["geometry"]
    for c in ([g["coordinates"]] if g["type"] == "LineString" else g["coordinates"] if g["type"] == "MultiLineString" else []):
        for a, b in zip(c, c[1:]):
            a, b = K(a), K(b); d = dist(a, b)
            graph[a].append((b, d)); graph[b].append((a, d))
nodes = list(graph)
grid = collections.defaultdict(list)
for n in nodes: grid[(int(n[0] * 500), int(n[1] * 500))].append(n)
def nearest(p):
    best = None
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            for n in grid.get((int(p[0] * 500) + dx, int(p[1] * 500) + dy), []):
                d = dist(p, n)
                if best is None or d < best[0]: best = (d, n)
    return best[1]
def path(a, b):
    s, t = nearest(a), nearest(b)
    dd = {s: 0}; prev = {}; pq = [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > dd[u]: continue
        for v, w in graph[u]:
            nd = d + w
            if nd < dd.get(v, 1e18): dd[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    out = [t]
    while out[-1] != s: out.append(prev[out[-1]])
    return out[::-1]

routes = []
for route, number, silver, ends, wps in ROUTES:
    pts = []
    for a, b in zip(wps, wps[1:]):
        seg = path(a, b)
        pts.extend(seg if not pts else seg[1:])
    routes.append({"route": route, "number": number, "silver": silver, "ends": ends, "path": [[round(x, 6), round(y, 6)] for x, y in pts]})
    print(route, len(pts), "points", round(sum(dist(p, q) for p, q in zip(pts, pts[1:]))), "m")
json.dump({"source": "shortest paths over major.json between waypoints (scripts/data-build/bus_samples.py)", "routes": routes}, open("public/data/bus-samples.json", "w"), separators=(",", ":"))
