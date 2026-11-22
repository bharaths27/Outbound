"""Illustrated ground for central Boston, made from the BPDA 2023 aerial photos:
green areas become flat park green, everything else becomes 3 soft pavement tones (roads read darker),
smoothed so it looks drawn rather than photographed. Writes bpda/<tile>_ground.png next to each photo."""
import json, sys, numpy as np
from PIL import Image, ImageFilter
DATA = sys.argv[1] if len(sys.argv) > 1 else "public/data"
man = json.load(open(f"{DATA}/bpda/manifest.json"))
GRASS = np.array([178, 216, 150]); PAVE = np.array([[206, 201, 194], [222, 217, 208], [236, 232, 223]])
for t in man["tiles"]:
    im = Image.open(f"{DATA}/bpda/{t['photo']}").convert("RGB").resize((1024, 1024), Image.LANCZOS)
    im = im.filter(ImageFilter.MedianFilter(5))
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = (r + g + b) / 3
    green = ((g - (r + b) / 2) > 6) & (g > r)
    lvl = np.digitize(lum, [118, 160])
    out = PAVE[lvl]
    out[green] = GRASS
    img = Image.fromarray(out.astype("uint8")).filter(ImageFilter.ModeFilter(5))
    img.save(f"{DATA}/bpda/{t['name']}_ground.png", optimize=True)
    t["ground"] = f"{t['name']}_ground.png"
json.dump(man, open(f"{DATA}/bpda/manifest.json", "w"), indent=1)
