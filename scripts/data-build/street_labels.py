# Street name labels for the offline map (the online basemap already labels every street in MA).
#   Boston: City of Boston street segments, sampled every ~1,000 ft (city-mapping streets.json)
#   Cambridge: City of Cambridge GIS street centerlines (Trans/Street_Centerlines/TRANS_Centerlines.geojson)
# Usage: python3 street_labels.py <boston streets.json> <cambridge centerlines.geojson> public/data/street-labels.geojson
import json, sys, math, collections
sys.path.insert(0, __import__('os').path.dirname(__file__))
from lcc import scene_to_lnglat
bos, cam, out = sys.argv[1:4]
feats = []
def r5(c): return [round(float(c[0]), 5), round(float(c[1]), 5)]
# Boston: consecutive samples of the same street make a rough line, so the label follows the street
s = json.load(open(bos)); col = s['columns']; ni, ci, xi, yi = col.index('name'), col.index('road_class'), col.index('x'), col.index('y')
runs = []
for r in s['rows']:
    if not r[ni] or r[ni].lower().startswith('public alley'): continue  # numbered alleys clutter the map
    if runs and runs[-1][0] == r[ni] and math.dist(runs[-1][2][-1], (r[xi], r[yi])) < 1600: runs[-1][2].append((r[xi], r[yi]))
    else: runs.append((r[ni], r[ci], [(r[xi], r[yi])]))
for name, cls, pts in runs:
    name = name.title() if name.isupper() else name
    ll = [r5(scene_to_lnglat(x, y)) for x, y in pts]
    g = {'type': 'LineString', 'coordinates': ll} if len(ll) > 1 else {'type': 'Point', 'coordinates': ll[0]}
    feats.append({'type': 'Feature', 'properties': {'n': name, 'm': 1 if cls in ('major', 'highway') else 0}, 'geometry': g})
# Cambridge: real centerlines
for f in json.load(open(cam))['features']:
    p, g = f['properties'], f['geometry']
    if not p.get('Label') or not g or p['Label'].lower().startswith('public alley'): continue
    lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
    for co in lines:
        if len(co) < 2: continue
        feats.append({'type': 'Feature', 'properties': {'n': p['Label'], 'm': 1 if p.get('MajorRoad') in (1, 2) else 0}, 'geometry': {'type': 'LineString', 'coordinates': [r5(c) for c in co]}})
json.dump({'type': 'FeatureCollection', 'features': feats}, open(out, 'w'), separators=(',', ':'))
print(len(feats), 'labels')
