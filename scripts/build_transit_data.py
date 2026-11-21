"""
Builds public/data/mbta-lines.geojson and public/data/mbta-stations.json.

Sources (downloaded once, not needed at runtime):
  - Track geometry: MassGIS MBTA Rapid Transit Lines (copy at github.com/ryanswett01/ppa_hw2)
  - Station coords:  MassGIS MBTA Rapid Transit Stops (same repo)
  - Station ids/order: TransitMatters stations.json (github.com/transitmatters/t-performance-dash)

  python scripts/build_transit_data.py <dir with MBTA_Rapid_Transit_Lines.json, MBTA_Rapid_Transit_Stops.json, tm.json>
"""
import json, math, sys, os

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), "..", "public", "data")
COLORS = {"Red": "#DA291C", "Orange": "#ED8B00", "Green": "#00843D", "Blue": "#003DA5"}

lines = json.load(open(os.path.join(src, "MBTA_Rapid_Transit_Lines.json")))
stops = json.load(open(os.path.join(src, "MBTA_Rapid_Transit_Stops.json")))
tm = json.load(open(os.path.join(src, "tm.json")))

def key(p):
    return (round(p[0], 5), round(p[1], 5))

# ---- merge track fragments into long polylines (per line) ----
features = []
for LINE in ["RED", "ORANGE", "GREEN", "BLUE"]:
    segs = []
    for f in lines["features"]:
        if f["properties"]["LINE"] != LINE:
            continue
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        segs += [[[round(x, 6), round(y, 6)] for x, y in part] for part in parts if len(part) > 1]
    # join segments at degree-2 endpoints
    changed = True
    while changed:
        changed = False
        deg = {}
        for s in segs:
            for p in (s[0], s[-1]):
                deg[key(p)] = deg.get(key(p), 0) + 1
        for i in range(len(segs)):
            for j in range(len(segs)):
                if i == j:
                    continue
                a, b = segs[i], segs[j]
                for ra in (False, True):
                    for rb in (False, True):
                        A = a[::-1] if ra else a
                        B = b[::-1] if rb else b
                        if key(A[-1]) == key(B[0]) and deg[key(A[-1])] == 2:
                            segs[i] = A + B[1:]
                            segs.pop(j)
                            changed = True
                            break
                    if changed: break
                if changed: break
            if changed: break
    name = LINE.capitalize()
    for s in segs:
        features.append({"type": "Feature", "properties": {"line": name, "color": COLORS[name]},
                         "geometry": {"type": "LineString", "coordinates": s}})
    print(name, len(segs), "polylines")

json.dump({"type": "FeatureCollection", "features": features},
          open(os.path.join(out, "mbta-lines.geojson"), "w"), separators=(",", ":"))

# ---- stations ----
ALIAS = {"JFK/UMass (Ashmont)": "JFK/UMass", "JFK/UMass (Braintree)": "JFK/UMass", "State Street": "State",
         "Massachusetts Avenue": "Massachusetts Ave", "Science Park": "Science Park/West End",
         "Hynes": "Hynes Convention Center", "Saint Paul Street (C)": "Saint Paul Street",
         "Northeastern University": "Northeastern"}
# stops missing from the MassGIS layer (coords from OpenStreetMap)
EXTRA = {"Museum of Fine Arts": [-71.095512, 42.337711], "Back of the Hill": [-71.111313, 42.330139]}
by_name = {}
for f in stops["features"]:
    p = f["properties"]
    by_name.setdefault(p["STATION"], []).append((p["LINE"], p.get("ROUTE") or "", f["geometry"]["coordinates"]))

stations = {}
for line, v in tm.items():
    if line not in COLORS:
        continue
    for st in v["stations"]:
        nm = ALIAS.get(st["stop_name"], st["stop_name"])
        cands = [c for c in by_name.get(nm, []) if line.upper() in c[0]] or by_name.get(nm, [])
        if not cands and nm in EXTRA:
            cands = [(line.upper(), "", EXTRA[nm])]
        if not cands:
            print("missing", line, nm); continue
        if st["stop_name"] == "Saint Paul Street (C)":
            cands = [c for c in cands if c[1].startswith("C")] or cands
        elif nm == "Saint Paul Street":
            cands = [c for c in cands if c[1].startswith("B")] or cands
        lon, lat = cands[0][2]
        sid = st["station"]
        s = stations.setdefault(sid, {"id": sid, "name": st["stop_name"].replace(" (C)", "").replace(" (Ashmont)", "").replace(" (Braintree)", ""),
                                      "lines": [], "branches": [], "platforms": [], "lat": round(lat, 6), "lon": round(lon, 6)})
        if line not in s["lines"]: s["lines"].append(line)
        for ids in (st.get("stops") or {}).values():
            for pid in ids:
                if pid not in s["platforms"]: s["platforms"].append(pid)
        for b in st.get("branches") or []:
            if b not in s["branches"]: s["branches"].append(b)

json.dump(sorted(stations.values(), key=lambda s: s["name"]),
          open(os.path.join(out, "mbta-stations.json"), "w"), separators=(",", ":"))
print(len(stations), "stations")
