import math, sys
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from glyphs import STATIONS

TIERS = {
    "bronze": ("#A8643A", "#FBF1EA", "#A8643A"),
    "silver": ("#6B7486", "#F4F5F8", "#9AA3B2"),
    "gold": ("#1F4A7A", "#FFF4D6", "#D9A21B"),
    "locked": ("#8C7F79", "#F3EDE3", "#B7ABA4"),
}
LINE = {"R": "#DA291C", "O": "#C46A00", "G": "#00843D", "B": "#003DA5"}

def scallop(cx, cy, r, n=36, depth=1.6):
    pts = []
    for i in range(n):
        a0 = 2 * math.pi * i / n
        a1 = 2 * math.pi * (i + 1) / n
        x0, y0 = cx + r * math.cos(a0), cy + r * math.sin(a0)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        if i == 0:
            pts.append(f"M{x0:.2f} {y0:.2f}")
        chord = 2 * r * math.sin(math.pi / n)
        pts.append(f"A{chord/2:.2f} {chord/2:.2f} 0 0 1 {x1:.2f} {y1:.2f}")
    return "".join(pts) + "z"

SCALLOP = scallop(50, 50, 45.5)

def stamp(sid, top, ribbon, lines, scene, tier="gold", size=160, cross=False, uid="x"):
    ink, bg, ring = TIERS[tier]
    locked = tier == "locked"
    parts = []
    if cross and not locked:
        parts.append(f'<circle cx="50" cy="50" r="51.5" fill="none" stroke="{"#6B1F33" if tier=="gold" else "#D9A21B"}" stroke-width="1.6"/>')
    parts.append(f'<path d="{SCALLOP}" fill="{bg}" stroke="{ring}" stroke-width="1.4"/>')
    dash = ' stroke-dasharray="3 3"' if locked else ""
    parts.append(f'<circle cx="50" cy="50" r="41.5" fill="none" stroke="{ink}" stroke-width="1.5"{dash}/>')
    parts.append(f'<circle cx="50" cy="50" r="39" fill="none" stroke="{ink}" stroke-width="0.6"{dash}/>')
    parts.append(f'<defs><clipPath id="c{uid}"><circle cx="50" cy="50" r="29.5"/></clipPath>'
                 f'<path id="a{uid}" d="M19 50A31 31 0 0 1 81 50"/></defs>')
    op = ' opacity="0.55"' if locked else ""
    g = [f'<g clip-path="url(#c{uid})"{op}><g transform="translate(50 66) scale(0.8) translate(-50 -66)">']
    for role, d in scene:
        if role == "ink":
            g.append(f'<path d="{d}" fill="{ink}"/>')
        elif role == "tint":
            g.append(f'<path d="{d}" fill="{ink}" fill-opacity="0.3"/>')
        elif role == "bg":
            g.append(f'<path d="{d}" fill="{bg}"/>')
        elif role == "line":
            g.append(f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="1.6" stroke-linecap="round"/>')
        elif role == "accent":
            g.append(f'<path d="{d}" fill="{ring if not locked else ink}"/>')
        elif role == "bgline":
            g.append(f'<path d="{d}" fill="none" stroke="{bg}" stroke-width="1.1" stroke-linecap="round"/>')
    g.append("</g></g>")
    parts += g
    fs = 6.6 if len(top) <= 10 else (6.0 if len(top) <= 14 else 5.3)
    parts.append(f'<text font-family="DM Sans, sans-serif" font-size="{fs}" font-weight="700" letter-spacing="1" fill="{ink}">'
                 f'<textPath href="#a{uid}" startOffset="50%" text-anchor="middle">{top}</textPath></text>')
    # ribbon: tier-ring outline, then a paper-colored keyline, then the ink band
    rib = "M19 64.5h62l-2.8 5.5 2.8 5.5H19l2.8-5.5z"
    outline = ink if locked else ("#D9A21B" if tier == "gold" else ring)
    parts.append(f'<path d="{rib}" fill="{outline}" stroke="{outline}" stroke-width="3.6" stroke-linejoin="round"/>')
    parts.append(f'<path d="{rib}" fill="{ink}" stroke="{bg}" stroke-width="1.5" stroke-linejoin="round"/>')
    rf = 5.6 if len(ribbon) <= 10 else 5.1
    parts.append(f'<text x="50" y="71.9" font-family="DM Sans, sans-serif" font-size="{rf}" font-weight="700" letter-spacing="0.6" text-anchor="middle" fill="{bg}">{ribbon}</text>')
    # line badges
    n = len(lines)
    for i, l in enumerate(lines):
        cx = 50 + (i - (n - 1) / 2) * 7
        col = ink if locked else LINE[l]
        parts.append(f'<circle cx="{cx}" cy="82.6" r="3" fill="{col}"/>'
                     f'<text x="{cx}" y="84.4" font-family="DM Sans, sans-serif" font-size="4.6" font-weight="700" text-anchor="middle" fill="#fff">{l}</text>')
    return (f'<svg width="{size}" height="{size}" viewBox="-4 -4 108 108" role="img" '
            f'aria-label="{ribbon.title()} stamp">' + "".join(parts) + "</svg>")
