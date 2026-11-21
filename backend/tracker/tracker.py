"""
T Quest train tracker: polls the MBTA V3 API and saves into Tiger Data.

  - every 15 s: positions of every Red, Orange and Green Line train -> train_positions
  - every 30 s: predicted vs scheduled arrivals at key stations     -> arrival_predictions

Run:
  pip install -r requirements.txt
  export TIGER_DATA_URL="postgres://..."      # from the Tiger Data console
  export MBTA_API_KEY="..."                   # from api-v3.mbta.com
  python tracker.py

Leave it running. Ctrl+C to stop. Safe to restart any time.
"""
import os
import sys
import time
from datetime import datetime, timezone

import psycopg
import requests

MBTA = "https://api-v3.mbta.com"
API_KEY = os.environ.get("MBTA_API_KEY", "")
DB_URL = os.environ.get("TIGER_DATA_URL")
ROUTES = os.environ.get("ROUTES", "Red,Orange,Green-B,Green-C,Green-D,Green-E")
# Parent station ids to track arrival predictions at. Put the quest stations here.
KEY_STOPS = os.environ.get(
    "KEY_STOPS",
    "place-bucen,place-kencl,place-coecl,place-pktrm,place-gover,place-north,"
    "place-dwnxg,place-sstat,place-harsq,place-chncl,place-bbsta",
)
POSITIONS_EVERY_S = int(os.environ.get("POSITIONS_EVERY_S", "15"))
PREDICTIONS_EVERY_S = int(os.environ.get("PREDICTIONS_EVERY_S", "30"))

session = requests.Session()
session.headers.update({"Accept": "application/vnd.api+json"})
if API_KEY:
    session.headers["x-api-key"] = API_KEY


def line_of(route_id: str) -> str:
    return route_id.split("-")[0]  # Green-B -> Green


def ts(value):
    if not value:
        return None
    return datetime.fromisoformat(value)


def rel_id(resource, name):
    data = (resource.get("relationships", {}).get(name) or {}).get("data")
    return data.get("id") if data else None


def get(path, params):
    r = session.get(f"{MBTA}{path}", params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def poll_positions(conn):
    body = get("/vehicles", {"filter[route]": ROUTES})
    now = datetime.now(timezone.utc)
    rows = []
    for v in body.get("data", []):
        a = v["attributes"]
        route_id = rel_id(v, "route")
        if not route_id:
            continue
        rows.append((
            now, v["id"], route_id, line_of(route_id), a.get("direction_id"),
            a.get("latitude"), a.get("longitude"), a.get("bearing"),
            a.get("current_status"), rel_id(v, "stop"), rel_id(v, "trip"),
            a.get("label"), a.get("occupancy_status"), ts(a.get("updated_at")),
        ))
    with conn.cursor() as cur:
        cur.executemany(
            """insert into train_positions (time, vehicle_id, route_id, line, direction_id,
                 lat, lon, bearing, current_status, stop_id, trip_id, label, occupancy, updated_at)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            rows,
        )
    conn.commit()
    return len(rows)


def poll_predictions(conn):
    body = get("/predictions", {
        "filter[route]": ROUTES,
        "filter[stop]": KEY_STOPS,
        "include": "schedule,stop",
    })
    now = datetime.now(timezone.utc)
    included = {(i["type"], i["id"]): i for i in body.get("included", [])}
    rows, with_schedule = [], 0
    for p in body.get("data", []):
        a = p["attributes"]
        route_id, trip_id, stop_id = rel_id(p, "route"), rel_id(p, "trip"), rel_id(p, "stop")
        predicted = ts(a.get("arrival_time") or a.get("departure_time"))
        if not (route_id and trip_id and stop_id and predicted):
            continue
        scheduled = None
        sched_id = rel_id(p, "schedule")
        if sched_id and ("schedule", sched_id) in included:
            sa = included[("schedule", sched_id)]["attributes"]
            scheduled = ts(sa.get("arrival_time") or sa.get("departure_time"))
        delay = (predicted - scheduled).total_seconds() if scheduled else None
        if scheduled:
            with_schedule += 1
        parent = None
        stop = included.get(("stop", stop_id))
        if stop:
            parent = rel_id(stop, "parent_station")
        rows.append((now, route_id, line_of(route_id), stop_id, parent, trip_id,
                     a.get("direction_id"), predicted, scheduled, delay))
    with conn.cursor() as cur:
        cur.executemany(
            """insert into arrival_predictions (time, route_id, line, stop_id, parent_station,
                 trip_id, direction_id, predicted_arrival, scheduled_arrival, delay_s)
               values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            rows,
        )
    conn.commit()
    return len(rows), with_schedule


def main():
    if not DB_URL:
        sys.exit("Set TIGER_DATA_URL first (the postgres:// connection string from Tiger Data).")
    if not API_KEY:
        print("warning: no MBTA_API_KEY set; you'll hit the low anonymous rate limit")
    last_pred = 0.0
    conn = None
    while True:
        started = time.time()
        try:
            if conn is None or conn.closed:
                conn = psycopg.connect(DB_URL)
            n = poll_positions(conn)
            msg = f"{datetime.now():%H:%M:%S} trains={n}"
            if started - last_pred >= PREDICTIONS_EVERY_S:
                np_, ns = poll_predictions(conn)
                last_pred = started
                msg += f" predictions={np_} with_schedule={ns}"
            print(msg, flush=True)
        except KeyboardInterrupt:
            break
        except Exception as e:  # keep running through Wi-Fi blips and API hiccups
            print(f"{datetime.now():%H:%M:%S} error: {e}", flush=True)
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass
            conn = None
        time.sleep(max(1.0, POSITIONS_EVERY_S - (time.time() - started)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("stopped")
