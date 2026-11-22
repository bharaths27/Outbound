// Train data sources for the map:
//   live   - GET /api/trains every 12 s (MBTA, via our server so the key stays secret)
//   replay - public/replay.json recorded by backend/tracker/export_replay.py
//   demo   - simulated trains moving along the real track, used only when live and replay are both unavailable
import type { Arrival, LineLateness, Train } from "@/lib/types";
import type { TrackNetwork, LineName } from "./track";
import { toLngLat } from "./track";

export const LIVE_INTERVAL_MS = 12_000;

export interface ReplayFrame {
  t: string;
  trains: Train[];
}

export async function fetchLive(): Promise<{ updatedAt: string; trains: Train[] }> {
  const r = await fetch("/api/trains", { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j.error || !Array.isArray(j.trains)) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export async function fetchReplay(): Promise<ReplayFrame[] | null> {
  try {
    const r = await fetch("/replay.json");
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.frames) && j.frames.length > 1 ? j.frames : null;
  } catch {
    return null;
  }
}

export async function fetchArrivals(stationId: string): Promise<Arrival[] | null> {
  try {
    const r = await fetch(`/api/trains?stop=${encodeURIComponent(stationId)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j.error) return null;
    return j.arrivals ?? [];
  } catch {
    return null;
  }
}

/** Person 3's Tiger Data endpoint. Falls back to sample numbers until it is live. */
export async function fetchLateness(): Promise<{ lines: LineLateness[]; sample: boolean }> {
  try {
    const r = await fetch("/api/lateness", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok || j.error || !Array.isArray(j.lines)) throw new Error();
    return { lines: j.lines, sample: false };
  } catch {
    return { lines: SAMPLE_LATENESS, sample: true };
  }
}

export const SAMPLE_LATENESS: LineLateness[] = [
  { line: "Red", nowDelayMin: 2.4, normalDelayMin: 1.1, vsNormalMin: 1.3, method: "schedule", samples: 40, color: "green", badge: "Red Line +1 min" },
  { line: "Orange", nowDelayMin: 4.0, normalDelayMin: 1.2, vsNormalMin: 2.8, method: "schedule", samples: 31, color: "yellow", badge: "Orange Line +3 min" },
  { line: "Green", nowDelayMin: 7.5, normalDelayMin: 1.6, vsNormalMin: 5.9, method: "schedule", samples: 52, color: "orange", badge: "Green Line +6 min" },
];

export const LATENESS_HEX: Record<LineLateness["color"], string> = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
  gray: "#9ca3af",
};

// Terminal names by direction_id, for the arrival board.
const DEST: Record<string, [string, string]> = {
  Red: ["Ashmont/Braintree", "Alewife"],
  Orange: ["Forest Hills", "Oak Grove"],
  Blue: ["Bowdoin", "Wonderland"],
  "Green-B": ["Boston College", "Government Center"],
  "Green-C": ["Cleveland Circle", "Government Center"],
  "Green-D": ["Riverside", "Union Square"],
  "Green-E": ["Heath Street", "Medford/Tufts"],
};
export const destinationOf = (route: string, dir: number) => DEST[route]?.[dir] ?? (dir === 0 ? "Outbound" : "Inbound");

/** Sample arrivals so the countdown UI can be shown when the MBTA can't be reached. */
export function sampleArrivals(lines: string[]): Arrival[] {
  const now = Date.now();
  const out: Arrival[] = [];
  for (const line of lines) {
    const routes = line === "Green" ? ["Green-B", "Green-D"] : [line];
    for (const route of routes)
      for (const dir of [0, 1])
        for (const m of [2 + dir * 3, 9 + dir * 2]) {
          out.push({
            route,
            line: line as Arrival["line"],
            directionId: dir,
            arrivalTime: new Date(now + m * 60_000 + Math.random() * 40_000).toISOString(),
            minutes: m,
            status: null,
          });
        }
  }
  return out.sort((a, b) => a.arrivalTime.localeCompare(b.arrivalTime)).slice(0, 8);
}

/** Demo trains: evenly spaced along each polyline, moving at ~11 m/s. Clearly labelled as demo in the UI. */
export class DemoFeed {
  private trains: { id: string; line: LineName; poly: number; along: number; dir: 1 | -1 }[] = [];
  constructor(private net: TrackNetwork) {
    let n = 0;
    net.polys.forEach((p, pi) => {
      const count = Math.max(1, Math.floor(p.len / 1800));
      for (let i = 0; i < count; i++)
        this.trains.push({ id: `demo-${n++}`, line: p.line, poly: pi, along: ((i + 0.5) / count) * p.len, dir: i % 2 ? 1 : -1 });
    });
  }
  step(seconds: number): Train[] {
    return this.trains.map((t) => {
      const w = this.net.walk(t.poly, t.along, 11 * seconds, t.dir);
      const p = this.net.polys[w.poly];
      if ((w.dir > 0 && w.along >= p.len - 1) || (w.dir < 0 && w.along <= 1)) w.dir = (-w.dir) as 1 | -1; // turn around at terminals
      Object.assign(t, w);
      const pt = this.net.pointAt(t.poly, t.along);
      const [lon, lat] = toLngLat(pt.x, pt.y);
      const heading = pt.heading + (t.dir < 0 ? Math.PI : 0);
      return {
        id: t.id,
        line: t.line as Train["line"],
        route: t.line === "Green" ? "Green-B" : t.line,
        lat,
        lon,
        bearing: ((90 - (heading * 180) / Math.PI) % 360 + 360) % 360,
        status: "IN_TRANSIT_TO",
        stopId: null,
        directionId: t.dir > 0 ? 0 : 1,
        occupancy: null,
      };
    });
  }
}
