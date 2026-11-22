# Buildings for the whole T area (Riverside/Brandeis to Wonderland, Oak Grove to Braintree) outside the areas that
# already have their own models (BPDA central Boston, Cambridge GIS), from Overture Maps (OSM + Microsoft + Esri,
# ODbL), read straight from Overture's public S3 bucket.
# Output: public/data/region/manifest.json + one tile per ~1.6 km cell: <name>.json = {"data": base64(gzip(binary))}
#   binary: uint32 count, then per building: uint16 nPts, uint16 height (decimeters), nPts x (int16 x, int16 z) in
#   decimeters from the tile center (x east, z south). Outer ring only, simplified to 0.4 m, no closing point.
# Usage: python3 overture_buildings.py <out dir>
import sys, os, json, gzip, base64, struct, math, glob
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc
from shapely import wkb
from shapely.geometry import shape, Point
from shapely.prepared import prep

OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
REL = "2026-11-18.0"
W, S, E, N = -71.30, 42.195, -70.955, 42.475
DX, DY = 0.02, 0.015
ROOT = os.path.join(os.path.dirname(__file__), "../../public/data")

# areas we already model: BPDA tile footprints (from their meshes) and Cambridge
skip = []
man = json.load(open(f"{ROOT}/bpda/manifest.json"))
for t in man["tiles"]:
    b = gzip.open(f"{ROOT}/bpda/{t['file'].replace('.json', '.bin.gz')}").read()
    hl = struct.unpack("<I", b[:4])[0]; h = json.loads(b[4:4 + hl]); a = h["arrays"]["position"]; base = 4 + hl
    import numpy as np
    p = np.frombuffer(b[base + a["start"]:base + a["start"] + a["length"]], dtype="<i2").reshape(-1, 3).astype(float) * h["unit"]
    cx, cy = h["center"]; kx = 111320 * math.cos(math.radians(cy))
    x0, x1 = p[:, 0].min(), p[:, 0].max(); z0, z1 = p[:, 2].min(), p[:, 2].max()
    skip.append((cx + x0 / kx, cy - z1 / 110540, cx + x1 / kx, cy - z0 / 110540))
cam = json.load(open(f"{ROOT}/cambridge/outline.geojson"))
cam_shape = prep(shape(cam["features"][0]["geometry"] if "features" in cam else cam["geometry"]))
def covered(x, y):
    return any(a <= x <= c and b <= y <= d for a, b, c, d in skip) or cam_shape.contains(Point(x, y))

fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
d = ds.dataset(f"overturemaps-us-west-2/release/{REL}/theme=buildings/type=building/", filesystem=fs, format="parquet")
f = (pc.field("bbox", "xmin") > W) & (pc.field("bbox", "xmax") < E) & (pc.field("bbox", "ymin") > S) & (pc.field("bbox", "ymax") < N)
tb = d.to_table(filter=f, columns=["geometry", "height", "num_floors", "class"])
print("read", tb.num_rows, flush=True)

tiles = {}
geoms, hs, fl, cl = tb.column("geometry").to_pylist(), tb.column("height").to_pylist(), tb.column("num_floors").to_pylist(), tb.column("class").to_pylist()
for g, h, nf, c in zip(geoms, hs, fl, cl):
    poly = wkb.loads(g)
    if poly.geom_type == "MultiPolygon": poly = max(poly.geoms, key=lambda q: q.area)
    if poly.geom_type != "Polygon": continue
    ct = poly.centroid
    if covered(ct.x, ct.y): continue
    kx = 111320 * math.cos(math.radians(ct.y))
    area = poly.area * kx * 110540
    if area < 12: continue  # sheds
    if not h:
        h = nf * 3.2 + 1.5 if nf else (7.5 if area < 250 else 9 if area < 900 else 12)  # typical house / block
    i, j = int((ct.x - W) / DX), int((ct.y - S) / DY)
    tiles.setdefault((i, j), []).append((poly, min(h, 300)))

manifest = {"source": f"Overture Maps buildings {REL} (OpenStreetMap, Microsoft, Esri; ODbL)", "tiles": []}
total = 0
for (i, j), items in sorted(tiles.items()):
    cx, cy = W + (i + 0.5) * DX, S + (j + 0.5) * DY
    kx = 111320 * math.cos(math.radians(cy))
    out = bytearray(struct.pack("<I", 0)); n = 0
    for poly, h in items:
        ring = poly.simplify(0.4 / 110540).exterior.coords[:-1]
        if len(ring) < 3 or len(ring) > 400: continue
        pts = [(round((x - cx) * kx * 10), round(-(y - cy) * 110540 * 10)) for x, y in ring]
        if any(abs(a) > 32000 or abs(b) > 32000 for a, b in pts): continue
        out += struct.pack("<HH", len(pts), round(h * 10))
        for a, b in pts: out += struct.pack("<hh", a, b)
        n += 1
    struct.pack_into("<I", out, 0, n); total += n
    name = f"r_{i}_{j}"
    json.dump({"data": base64.b64encode(gzip.compress(bytes(out), 9)).decode()}, open(f"{OUT}/{name}.json", "w"))
    manifest["tiles"].append({"name": name, "center": [round(cx, 5), round(cy, 5)], "file": f"{name}.json", "count": n})
json.dump(manifest, open(f"{OUT}/manifest.json", "w"))
print(len(manifest["tiles"]), "tiles", total, "buildings")
