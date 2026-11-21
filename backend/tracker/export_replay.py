"""
Export recorded train positions as replay.json for Verna's replay mode.

  python export_replay.py --minutes 30 --out replay.json
  python export_replay.py --start "2026-11-21 19:30" --minutes 20   # times in Boston time

Output: {"frames": [{"t": "<iso time>", "trains": [{id, line, route, lat, lon, bearing, status}]}]}
One frame per poll (about every 15 s). The frontend plays frames in order.
"""
import argparse
import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

p = argparse.ArgumentParser()
p.add_argument("--minutes", type=int, default=30)
p.add_argument("--start", help='Boston local time, e.g. "2026-11-21 19:30". Default: last N minutes')
p.add_argument("--out", default="replay.json")
args = p.parse_args()

if args.start:
    start = datetime.fromisoformat(args.start).replace(tzinfo=ZoneInfo("America/New_York"))
    end = start + timedelta(minutes=args.minutes)
    where, params = "time >= %s and time < %s", (start, end)
else:
    where, params = "time > now() - make_interval(mins => %s)", (args.minutes,)

with psycopg.connect(os.environ["TIGER_DATA_URL"]) as conn, conn.cursor() as cur:
    cur.execute(
        f"""select time, vehicle_id, line, route_id, lat, lon, bearing, current_status
            from train_positions where {where} and lat is not null order by time""",
        params,
    )
    frames, current_t, current = [], None, []
    for t, vid, line, route, lat, lon, bearing, status in cur:
        if t != current_t and current:
            frames.append({"t": current_t.isoformat(), "trains": current})
            current = []
        current_t = t
        current.append({"id": vid, "line": line, "route": route, "lat": lat, "lon": lon,
                        "bearing": bearing, "status": status})
    if current:
        frames.append({"t": current_t.isoformat(), "trains": current})

with open(args.out, "w") as f:
    json.dump({"frames": frames}, f)
print(f"wrote {len(frames)} frames to {args.out}")
