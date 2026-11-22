import json, math, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lcc import scene_to_lnglat
from shapely.geometry import shape, box, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union, transform
OUT = sys.argv[1]
LON0, LAT0 = -71.08, 42.36
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110574
fwd = lambda x, y, z=None: ((x - LON0) * KX, (y - LAT0) * KY)
inv = lambda x, y, z=None: (x / KX + LON0, y / KY + LAT0)
def rnd(g, d):
    def r(c):
        return [round(c[0], d), round(c[1], d)] if isinstance(c[0], float) else [r(x) for x in c]
    m = mapping(g); return {"type": m["type"], "coordinates": r(json.loads(json.dumps(m["coordinates"])))}
CAMPUS = [  # name, short, color, lng, lat
    ("MIT", "MIT", "#A31F34", -71.0942, 42.3601), ("Harvard University", "Harvard", "#A51C30", -71.1167, 42.3744),
    ("Lesley University", "Lesley", "#00467F", -71.1205, 42.3810),
    ("Boston University", "BU", "#CC0000", -71.1054, 42.3505), ("Northeastern University", "Northeastern", "#C8102E", -71.0892, 42.3398),
    ("Emerson College", "Emerson", "#6C2C91", -71.0657, 42.3521), ("Suffolk University", "Suffolk", "#1F3A70", -71.0616, 42.3588),
    ("Berklee College of Music", "Berklee", "#2D2D2D", -71.0870, 42.3466), ("Wentworth Institute of Technology", "Wentworth", "#B8860B", -71.0951, 42.3363),
    ("MassArt", "MassArt", "#E4002B", -71.0990, 42.3373), ("Simmons University", "Simmons", "#00205B", -71.1002, 42.3389),
    ("Harvard Medical School", "Harvard Med", "#A51C30", -71.1048, 42.3355), ("Emmanuel College", "Emmanuel", "#002F6C", -71.1027, 42.3410),
]
polys = []
# Cambridge: Higher Education parcels
lu = json.load(open('/tmp/claude-0/cam/landuse.geojson'))
for f in lu['features']:
    if f['properties'].get('use_category') in ('Higher Education', 'Education Residential') and f['geometry']:
        polys.append(transform(fwd, shape(f['geometry'])).buffer(0))
# Boston: BPDA college / dorm buildings (bounding boxes)
d = json.load(open('/tmp/claude-0/ext/city-mapping/web/data/buildings.json')); c = d['columns']
li, bi = c.index('land_use'), c.index('box')
for r in d['rows']:
    if r[0] == 'current' and r[li] in ('COLLEGE (academic)', 'PRIV SCHOOL /COLLEGE', 'DORMITORY  bd', 'DORMITORY  rm'):
        b = r[bi]; xs, ys = scene_to_lnglat([b[0], b[3], b[3], b[0]], [b[1], b[1], b[4], b[4]])
        polys.append(Polygon([fwd(x, y) for x, y in zip(xs, ys)]))
merged = unary_union([p.buffer(28) for p in polys]).buffer(-18)
parts = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
groups = {}
for p in parts:
    if p.area < 2500: continue
    cx, cy = p.centroid.x, p.centroid.y
    best = min(CAMPUS, key=lambda k: math.hypot(fwd(k[3], k[4])[0] - cx, fwd(k[3], k[4])[1] - cy))
    dist = math.hypot(fwd(best[3], best[4])[0] - cx, fwd(best[3], best[4])[1] - cy)
    if dist > 900: continue
    groups.setdefault(best[0], []).append(p)
feats = []
for k in CAMPUS:
    if k[0] not in groups: continue
    g = unary_union(groups[k[0]]).simplify(4)
    feats.append({"type": "Feature", "properties": {"name": k[0], "short": k[1], "color": k[2]}, "geometry": rnd(transform(inv, g), 6)})
    print(k[0], len(groups[k[0]]), round(g.area / 1e4, 1), "ha")
json.dump({"type": "FeatureCollection", "features": feats}, open(f"{OUT}/campuses.geojson", "w"), separators=(",", ":"))
# Cambridge basemap layers
def slim(src, dst, keep, prec, filt=lambda p: True, simp=0):
    s = json.load(open(src)); out = []
    for f in s['features']:
        if not f['geometry'] or not filt(f['properties']): continue
        g = shape(f['geometry'])
        if simp: g = transform(inv, transform(fwd, g).simplify(simp))
        out.append({"type": "Feature", "properties": {k2: f['properties'].get(k) for k, k2 in keep}, "geometry": rnd(g, prec)})
    json.dump({"type": "FeatureCollection", "features": out}, open(dst, "w"), separators=(",", ":"))
slim('/tmp/claude-0/cam/BASEMAP_Buildings.geojson', f'{OUT}/cambridge-buildings.geojson', [('TOP_GL', 'h')], 6,
     lambda p: p.get('TYPE') in ('BLDG', 'OUTBLDG', 'OVHD-WALKWAY') and p.get('TOP_GL'), 0.5)
slim('/tmp/claude-0/cam/BASEMAP_Roads.geojson', f'{OUT}/cambridge-roads.geojson', [('TYPE', 't')], 6, simp=0.8)
slim('/tmp/claude-0/cam/HYDRO_WaterBodies.geojson', f'{OUT}/cambridge-water.geojson', [], 6, simp=1)
slim('/tmp/claude-0/cam/RECREATION_OpenSpace.geojson', f'{OUT}/cambridge-parks.geojson', [('NAME', 'name')], 6, simp=1)
