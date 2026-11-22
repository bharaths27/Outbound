"""Tree positions for the game-style map.
Central Boston: found in the BPDA 2023 aerial photos (dark green canopy pixels), one tree per ~7 m cell.
Cambridge: scattered inside park polygons (City of Cambridge GIS).
Output: public/data/trees.json = [[lng, lat, size], ...]"""
import json, random, sys, numpy as np
from PIL import Image, ImageFilter
from shapely.geometry import shape, Point
from shapely.prepared import prep

DATA = sys.argv[1] if len(sys.argv) > 1 else "public/data"
random.seed(7)
out = []
man = json.load(open(f"{DATA}/bpda/manifest.json"))
for t in man["tiles"]:
    im = np.asarray(Image.open(f"{DATA}/bpda/{t['photo']}").convert("RGB")).astype(np.float32)
    H, W, _ = im.shape
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    lum = (r + g + b) / 3
    # tree crowns are green AND textured; lawns are green but smooth
    m1 = np.asarray(Image.fromarray(lum.astype("uint8")).filter(ImageFilter.BoxBlur(3))).astype(np.float32)
    m2 = np.asarray(Image.fromarray(np.clip(lum * lum / 255, 0, 255).astype("uint8")).filter(ImageFilter.BoxBlur(3))).astype(np.float32) * 255
    sd = np.sqrt(np.maximum(m2 - m1 * m1, 0))
    canopy = ((g - (r + b) / 2) > 9) & (lum < 205) & (g > r) & (sd > 16)
    # bilinear map from pixel (u, v) to lng/lat using the 4 corners (TL, TR, BR, BL)
    (tl, tr, br, bl) = [np.array(c) for c in t["photoCorners"]]
    step = 7
    for y in range(step // 2, H - step, step):
        for x in range(step // 2, W - step, step):
            win = canopy[y - 3:y + 4, x - 3:x + 4]
            frac = win.mean()
            if frac < 0.3:
                continue
            u, v = (x + random.uniform(-2, 2)) / W, (y + random.uniform(-2, 2)) / H
            p = (1 - v) * ((1 - u) * tl + u * tr) + v * ((1 - u) * bl + u * br)
            out.append([round(p[0], 6), round(p[1], 6), round(2.2 + 2.4 * frac + random.uniform(0, 0.6), 1)])
n_bos = len(out)
# Cambridge parks
m_lat, m_lng = 110540, 111320 * np.cos(np.radians(42.37))
for f in json.load(open(f"{DATA}/cambridge/parks.geojson"))["features"]:
    g = shape(f["geometry"])
    if g.is_empty:
        continue
    pg = prep(g.buffer(-0.00004))
    area_m2 = g.area * m_lat * m_lng
    n = int(area_m2 / 260)
    x0, y0, x1, y1 = g.bounds
    tries = 0
    while n > 0 and tries < n * 6:
        tries += 1
        p = Point(random.uniform(x0, x1), random.uniform(y0, y1))
        if pg.contains(p):
            out.append([round(p.x, 6), round(p.y, 6), round(random.uniform(2.4, 3.8), 1)])
            n -= 1
json.dump(out, open(f"{DATA}/trees.json", "w"), separators=(",", ":"))
print("boston", n_bos, "cambridge", len(out) - n_bos)
