# Station stamp art. Each scene is a list of (role, d) drawn in a 100x100 box,
# clipped to a circle (r=32) under the top arc text and above the bottom ribbon.
# Roles: ink (solid tier ink), tint (ink at low opacity), bg (stamp paper, for cutouts),
# line (ink stroke 1.6), bgline (paper-colored stroke 1.2).

def circ(cx, cy, r):
    return f"M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0 {-2*r} 0z"

def rect(x, y, w, h):
    return f"M{x} {y}h{w}v{h}h{-w}z"

def arch(x, y, w, h):
    """Arched window: bottom-left at (x, y+h), round top."""
    r = w / 2
    return f"M{x} {y+h}V{y+r}a{r} {r} 0 0 1 {w} 0V{y+h}z"

def windows(x0, y0, cols, rows, w, h, dx, dy):
    return "".join(rect(x0 + c * dx, y0 + r * dy, w, h) for c in range(cols) for r in range(rows))

def tree(cx, base, r):
    return [("ink", circ(cx, base - r - 3, r) + circ(cx - r * 0.7, base - r * 0.9 - 2, r * 0.75) + circ(cx + r * 0.7, base - r * 0.9 - 2, r * 0.75)),
            ("ink", rect(cx - 0.8, base - 4, 1.6, 4))]

def spark(cx, cy, r):
    k = r * 0.28
    return f"M{cx} {cy-r}L{cx+k} {cy-k}L{cx+r} {cy}L{cx+k} {cy+k}L{cx} {cy+r}L{cx-k} {cy+k}L{cx-r} {cy}L{cx-k} {cy-k}z"

WAVES = "M14 68q4-2.5 8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0t8 0"

STATIONS = [
    # id, top arc, ribbon, lines, scene
    ("place-bucen", "BOSTON UNIVERSITY", "BU CENTRAL", ["G"], [
        ("tint", rect(18, 46, 14, 20) + rect(68, 44, 16, 22) + rect(30, 52, 8, 14)),
        ("bg", windows(20.5, 49, 3, 3, 2, 3, 4, 5) + windows(70.5, 47, 3, 3, 2, 3, 4.5, 5)),
        # Marsh Chapel: nave + central gothic tower
        ("ink", "M36 66V50l14-7 14 7v16z"),
        ("ink", rect(44.5, 30, 11, 36)),
        ("accent", spark(30, 36, 2.6) + spark(70, 34, 2.2)),
        ("ink", "M44.5 30l1.6-5 1.6 5zM52.3 30l1.6-5 1.6 5zM48.4 30l1.6-6 1.6 6z"),
        ("bg", arch(47.5, 34, 5, 9) + arch(47.5, 47, 5, 11) + arch(39, 54, 3, 7) + arch(58, 54, 3, 7)),
        ("bg", rect(44.5, 44, 11, 1)),
        ("line", WAVES),
    ]),
    ("place-kencl", "FENWAY", "KENMORE", ["G"], [
        ("tint", rect(18, 46, 10, 20) + rect(74, 50, 10, 16) + "M18 58Q50 52 84 58V66H18z"),
        # Citgo sign on its building
        ("ink", rect(28, 50, 18, 16)),
        ("bg", windows(30.5, 53, 4, 2, 2.4, 3, 3.8, 5.5)),
        ("ink", rect(30, 32, 14, 13) + rect(32, 45, 1.6, 5) + rect(40.4, 45, 1.6, 5)),
        ("bg", "M37 34.5l5.2 8.5h-10.4z"),
        ("accent", "M37 38.3l2.8 4.5h-5.6z"),
        ("accent", spark(76, 36, 2.6)),
        # Light tower
        ("ink", rect(61, 38, 2, 28)),
        ("ink", rect(55, 28, 14, 10)),
        ("bg", circ(58, 31, 1.2) + circ(62, 31, 1.2) + circ(66, 31, 1.2) + circ(58, 35, 1.2) + circ(62, 35, 1.2) + circ(66, 35, 1.2)),
        # Green Monster wall
        ("ink", rect(46, 56, 34, 10)),
        ("bgline", "M48 59.5h30M48 62.5h30"),
    ]),
    ("place-coecl", "BACK BAY", "COPLEY", ["G"], [
        # Hancock tower behind
        ("tint", "M63 27h11v39H63z"),
        ("line", "M63 27v39"),
        # Trinity Church
        ("ink", rect(42, 42, 16, 24)),
        ("ink", "M40 42l10-12 10 12z"),
        ("ink", "M26 66V52l8-6 8 6v14zM58 66V52l8-6 8 6v14z"),
        ("bg", arch(44.5, 46, 4, 7) + arch(51.5, 46, 4, 7) + arch(47.5, 56, 5, 10)),
        ("bg", arch(31.5, 53, 5, 8) + arch(63.5, 53, 5, 8)),
        ("bg", circ(50, 37.5, 1.6)),
        ("accent", spark(32, 34, 2.6)),
        ("tint", rect(18, 52, 8, 14)),
    ]),
    ("place-pktrm", "BOSTON COMMON", "PARK STREET", ["R", "G"], [
        ("tint", rect(32, 50, 36, 16)),
        # State House
        ("ink", "M34 50l16-6.5 16 6.5z"),
        ("accent", "M39 43.6a11 11 0 0 1 22 0z"),
        ("accent", spark(28, 33, 3) + spark(72, 31, 2.4)),
        ("ink", rect(48.5, 29, 3, 4) + circ(50, 28.5, 1.4)),
        ("ink", rect(32, 64, 36, 2) + rect(34, 50, 32, 2.2)),
        ("ink", "".join(rect(36 + i * 5.2, 53, 2, 11) for i in range(6))),
        ("bg", "M44 43.6v-4M50 43.6v-9M56 43.6v-4"),
        ("bgline", "M44 43.6v-4M50 43.6v-9.5M56 43.6v-4"),
        *tree(23, 66, 6),
        *tree(76, 66, 5),
        # lamp post
        ("ink", rect(67.2, 50, 1.2, 16) + rect(65.8, 45, 4, 5)),
    ]),
    ("place-gover", "CITY HALL", "GOVT CENTER", ["G", "B"], [
        # Custom House tower behind
        ("tint", rect(62, 24, 8, 26) + "M62 24l4-5 4 5z" + rect(18, 40, 10, 26)),
        # Inverted ziggurat
        ("ink", rect(22, 36, 56, 7)),
        ("bg", "".join(rect(24 + i * 3.5, 38, 1.6, 3) for i in range(15))),
        ("ink", rect(25, 43, 50, 6)),
        ("bg", "".join(rect(27 + i * 5, 44.5, 3, 3) for i in range(10))),
        ("tint", rect(28, 49, 44, 12)),
        ("ink", "".join(rect(29 + i * 6.6, 49, 2, 12) for i in range(7))),
        # Plaza steps
        ("ink", rect(18, 61, 64, 1.6)),
        ("line", "M18 64.5h64"),
        ("accent", spark(34, 29, 2.4) + spark(46, 27, 1.6)),
    ]),
    ("place-haecl", "NORTH END", "HAYMARKET", ["O", "G"], [
        # Rowhouses
        ("tint", rect(18, 44, 12, 22) + rect(30, 48, 12, 18) + rect(60, 46, 22, 20)),
        ("bg", windows(20.5, 47, 2, 3, 2.5, 3.5, 5, 6) + windows(32.5, 51, 2, 2, 2.5, 3.5, 5, 6)),
        # Old North Church steeple
        ("ink", rect(44, 44, 12, 22)),
        ("ink", rect(45.5, 37, 9, 7) + rect(46.8, 31.5, 6.4, 5.5) + "M47.5 31.5l2.5-12 2.5 12z"),
        ("bg", circ(50, 40.5, 1.8) + arch(48, 48, 4, 8) + arch(48.2, 32.5, 3.6, 3.5)),
        # Market stall with awning
        ("accent", "M58 50h24l-2 5H60z"),
        ("accent", spark(32, 34, 2.4)),
        ("bg", "".join(rect(60.5 + i * 4.5, 50, 2, 5) for i in range(5))),
        ("ink", rect(60, 55, 1.2, 11) + rect(78.8, 55, 1.2, 11)),
        ("ink", rect(62, 60, 16, 6)),
        ("accent", circ(64, 58.8, 1.8) + circ(68, 58.5, 1.8) + circ(72, 58.8, 1.8) + circ(76, 58.5, 1.8)),
    ]),
    ("place-harsq", "HARVARD SQUARE", "HARVARD", ["R"], [
        # Memorial Church spire behind
        ("tint", rect(44, 40, 12, 26) + rect(46, 32, 8, 8) + "M46.5 32L50 19l3.5 13z"),
        ("tint", rect(18, 46, 14, 20) + rect(68, 46, 14, 20)),
        # Johnston Gate: brick pillars + iron arch
        ("ink", rect(30, 42, 7, 24) + rect(63, 42, 7, 24)),
        ("ink", "M29 42l4.5-4 4.5 4zM62 42l4.5-4 4.5 4z"),
        ("bgline", "M31.5 47h4M31.5 52h4M31.5 57h4M31.5 62h4M64.5 47h4M64.5 52h4M64.5 57h4M64.5 62h4"),
        ("line", "M37 46Q50 38 63 46M37 50h26M41 47.5v18.5M45.5 45v21M50 44v22M54.5 45v21M59 47.5v18.5"),
        ("accent", circ(50, 41.2, 1.8)),
        ("accent", spark(30, 32, 2.4) + spark(70, 32, 2.4)),
        *tree(22, 66, 4.5),
        *tree(78, 66, 4.5),
    ]),
    ("place-cntsq", "CENTRAL SQUARE", "CENTRAL", ["R"], [
        ("tint", rect(18, 40, 12, 26) + rect(64, 44, 18, 22)),
        ("bg", windows(20.5, 43, 2, 3, 2.5, 3.5, 5, 6)),
        # Graffiti Alley wall
        ("ink", rect(28, 38, 34, 28)),
        ("bgline", "M28 45h34M28 52h34M28 59h34M36 38v7M48 38v7M40 45v7M54 45v7M34 52v7M46 52v7M58 52v7M40 59v7M52 59v7"),
        ("tint", circ(37, 49, 5.5) + circ(47, 47, 6) + circ(55, 51, 4.5)),
        ("bg", "M45 41.5l1.6 3.4 3.7.4-2.8 2.5.8 3.6-3.3-1.9-3.3 1.9.8-3.6-2.8-2.5 3.7-.4z"),
        # Ice cream cone
        ("ink", "M67 47l6 17 6-17z"),
        ("bgline", "M69 51l6 5M68.5 49l8.5 7M72 49l-3 3"),
        ("ink", circ(73, 44, 5.4)),
        ("accent", circ(73, 37.5, 4.2)),
        ("accent", spark(36, 31, 2.4)),
        ("bg", circ(71.3, 36.3, 1)),
    ]),
    ("place-chncl", "CHINATOWN", "CHINATOWN", ["O"], [
        ("tint", rect(18, 46, 12, 20) + rect(70, 42, 12, 24)),
        ("bg", windows(20.5, 49, 2, 3, 2.5, 3, 5, 5.5) + windows(72.5, 45, 2, 3, 2.5, 3, 5, 6)),
        # Paifang gate: two tiers of upturned roofs
        ("ink", "M34 31.5Q50 28 66 31.5l3-1.5-2 4.5H33l-2-4.5z"),
        ("ink", rect(38, 34.5, 24, 3)),
        ("ink", "M24 41Q50 37 76 41l3-1.5-2.5 5H23.5L21 39.5z"),
        ("tint", rect(30, 44.5, 40, 5)),
        ("accent", rect(44, 45.3, 12, 3.4)),
        ("ink", rect(30, 44.5, 4, 21.5) + rect(66, 44.5, 4, 21.5) + rect(40, 49.5, 2.5, 16.5) + rect(57.5, 49.5, 2.5, 16.5)),
        # Lanterns
        ("line", "M45 49.5v3M55 49.5v3"),
        ("accent", "M42.4 55.5a2.6 3.2 0 1 0 5.2 0a2.6 3.2 0 1 0 -5.2 0zM52.4 55.5a2.6 3.2 0 1 0 5.2 0a2.6 3.2 0 1 0 -5.2 0z"),
        ("ink", rect(29, 64.5, 6, 1.5) + rect(65, 64.5, 6, 1.5)),
    ]),
]
