import json, re, sys, collections
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lcc import scene_to_lnglat
OUT = sys.argv[1]; items = []
seen = set()
JUNK = re.compile(r'\b(PDA|Project|Expansion|Parcel|Amendment|Phase|Mixed-Use|Air Rights|Development|Redevelopment|IMP|Master Plan|Proposed|Renovation|Addition)\b|^MBTA-|-SB$', re.I)
def clean(name):
    name = (name or '').strip()
    if name.endswith('.obj'):  # BPDA model file names like BOS_H_4_Opera_House.obj
        name = re.sub(r'^BOS_[A-Z]+_\d+_', '', name[:-4]).replace('_', ' ')
    return None if JUNK.search(name) else name
def add(name, kind, lng, lat):
    name = clean(name)
    key = ((name or '').lower(), kind)
    if not name or key in seen: return
    seen.add(key); items.append([name, kind, round(float(lng), 5), round(float(lat), 5)])
# BPDA named buildings (central Boston)
d = json.load(open('/tmp/claude-0/ext/city-mapping/web/data/buildings.json')); c = d['columns']
ni, bi = c.index('name'), c.index('box')
for r in d['rows']:
    n = r[ni]
    if r[0] != 'current' or not n or n.isupper() or len(n) < 4: continue
    b = r[bi]; lng, lat = scene_to_lnglat((b[0] + b[3]) / 2, (b[1] + b[4]) / 2); add(n, 'place', lng, lat)
# Boston streets (central)
s = json.load(open('/tmp/claude-0/ext/city-mapping/web/data/streets.json')); sc = s['columns']
pts = collections.defaultdict(list)
for r in s['rows']: pts[r[0]].append((r[sc.index('x')], r[sc.index('y')]))
for n, p in pts.items():
    if not n: continue
    x, y = sorted(p)[len(p) // 2]; lng, lat = scene_to_lnglat(x, y); add(n.title() if n.isupper() else n, 'street', lng, lat)
# Cambridge streets
cl = json.load(open('/tmp/claude-0/cam/centerlines.geojson'))
cp = collections.defaultdict(list)
for f in cl['features']:
    n = f['properties'].get('Label'); g = f['geometry']
    if not n or not g: continue
    co = g['coordinates'] if g['type'] == 'LineString' else g['coordinates'][0]
    cp[n].append(co[len(co) // 2])
for n, p in cp.items():
    lng, lat = sorted(p)[len(p) // 2]; add(n + ", Cambridge", 'street', lng, lat)
# Cambridge parks
for f in json.load(open('/tmp/claude-0/bpda/geo/cambridge-parks.geojson'))['features']:
    n = f['properties'].get('name'); g = f['geometry']
    if n:
        ring = g['coordinates'][0] if g['type'] == 'Polygon' else g['coordinates'][0][0]
        add(n, 'park', sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
json.dump(items, open(f'{OUT}/search-places.json', 'w'), separators=(',', ':'))
print(len(items), collections.Counter(i[1] for i in items))
