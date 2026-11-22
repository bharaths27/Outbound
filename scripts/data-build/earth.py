"""public/data/base/earth.jpg: NASA Blue Marble (public domain; copy from three.js examples/textures/planets/earth_day_4096.jpg)
reprojected from plate carree to Web Mercator (4096 x 4096) for a MapLibre image source."""
import sys, math, numpy as np
from PIL import Image, ImageEnhance
src = ImageEnhance.Color(Image.open(sys.argv[1]).convert("RGB")).enhance(1.15)
a = np.asarray(src); H, W = a.shape[:2]; N = 4096
lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (np.arange(N) + 0.5) / N))))
rows = np.clip(((90 - lat) / 180 * H).astype(int), 0, H - 1)
Image.fromarray(a[rows][:, np.arange(N) * W // N]).save(sys.argv[2], quality=82, optimize=True)
