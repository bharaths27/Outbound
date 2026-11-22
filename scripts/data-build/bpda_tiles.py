"""Convert the BPDA 3D Smart Model web export (github.com/Lilit-Lele/city-mapping, web/data) into map-ready tiles.
Output per tile: <tile>.bin.gz = uint32 header length + JSON header + arrays; <tile>.jpg aerial photo; manifest.json."""
import sys, json, gzip, struct, math, hashlib, os
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from lcc import scene_to_lnglat
SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
man = json.load(open(f"{SRC}/manifest.json"))
UNIT = 0.05  # meters per int16 step
C = 40075016.686
PALETTE = ["#d9cfc2", "#cdbfae", "#b98f76", "#a9705a", "#e3ddd3", "#c8c4bd", "#d6c3a8", "#bfae9a"]
TALL = ["#b9c6d3", "#a9b8c8", "#c9d2db", "#9fb0c2"]
def rgb(h): return [int(h[i:i+2], 16) for i in (1, 3, 5)]
tiles = []
for t in man["tiles"]:
    raw = gzip.open(f"{SRC}/{t['file']}").read()
    hl = struct.unpack("<I", raw[:4])[0]; h = json.loads(raw[4:4+hl]); body = raw[4+hl:]
    def arr(name, dt):
        d = h["arrays"][name]; cnt = int(np.prod(d["shape"]))
        return np.frombuffer(body, dtype=dt, count=cnt, offset=d["start"]).reshape(d["shape"])
    q = arr("positions", np.uint16).astype(np.float64) / 65535.0
    low, high = np.array(h["low"]), np.array(h["high"])
    p = low + q * (high - low)  # scene feet
    bid = arr("building", np.uint16).astype(np.int64)
    tri = arr("triangles", np.uint32)
    # ground each building at 0 (terrain is not drawn)
    base = np.full(bid.max() + 1, np.inf); np.minimum.at(base, bid, p[:, 2])
    z = (p[:, 2] - base[bid]) * 1200 / 3937
    lon, lat = scene_to_lnglat(p[:, 0], p[:, 1])
    L, R, B, T = h["terrain"]["bounds"]
    clon, clat = scene_to_lnglat((L + R) / 2, (B + T) / 2); clon, clat = float(clon), float(clat)
    s = C * math.cos(math.radians(clat))  # meters per mercator unit at the center
    mx = lon / 360; my = np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) / (2 * np.pi)
    mxc = clon / 360; myc = math.log(math.tan(math.pi / 4 + math.radians(clat) / 2)) / (2 * math.pi)
    east = (mx - mxc) * s; north = (my - myc) * s
    pos = np.stack([east, z, -north], 1) / UNIT  # three.js y-up, -z north
    assert np.abs(pos).max() < 32767, np.abs(pos).max()
    pos = np.round(pos).astype(np.int16)
    # per-building color: brick / brownstone / limestone; glassier for tall towers
    height = np.zeros(bid.max() + 1); np.maximum.at(height, bid, z)
    cols = np.zeros((bid.max() + 1, 3), np.uint8)
    for b in range(bid.max() + 1):
        k = int(hashlib.md5(f"{t['name']}{b}".encode()).hexdigest(), 16)
        cols[b] = rgb((TALL if height[b] > 60 else PALETTE)[k % (len(TALL) if height[b] > 60 else len(PALETTE))])
    col = cols[bid]
    tri_dt = np.uint16 if len(pos) < 65536 else np.uint32
    arrays = {"position": pos.tobytes(), "color": col.tobytes(), "index": tri.astype(tri_dt).tobytes()}
    hdr = {"tile": t["name"], "unit": UNIT, "center": [clon, clat], "vertices": len(pos), "indexType": "uint16" if tri_dt == np.uint16 else "uint32", "arrays": {}}
    off = 0
    for k, v in arrays.items():
        hdr["arrays"][k] = {"start": off, "length": len(v)}; off += len(v) + (-len(v)) % 4
    hb = json.dumps(hdr).encode(); hb += b" " * ((-len(hb)) % 4)
    blob = struct.pack("<I", len(hb)) + hb + b"".join(v + b"\0" * ((-len(v)) % 4) for v in arrays.values())
    with gzip.open(f"{OUT}/{t['name']}.bin.gz", "wb", 9) as fh: fh.write(blob)
    corners = [scene_to_lnglat(x, y) for x, y in [(L, T), (R, T), (R, B), (L, B)]]
    Image.open(f"{SRC}/{t['photo']}").convert("RGB").resize((1536, 1536), Image.LANCZOS).save(f"{OUT}/{t['name']}.jpg", quality=72, optimize=True)
    tiles.append({"name": t["name"], "center": [clon, clat], "file": f"{t['name']}.bin.gz", "photo": f"{t['name']}.jpg",
                  "photoCorners": [[round(float(a), 7), round(float(b), 7)] for a, b in corners]})
    print(t["name"], len(pos), len(tri), os.path.getsize(f"{OUT}/{t['name']}.bin.gz") // 1024, "KB")
json.dump({"source": "Boston Planning Department (BPDA) 3D Smart Model: buildings and 2023 aerial photo", "tiles": tiles},
          open(f"{OUT}/manifest.json", "w"), indent=1)
