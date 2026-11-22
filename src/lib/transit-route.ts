// Directions by T + walking from our own MBTA track and station data, with no API key.
// Used by /api/route when Google Routes isn't set up (or fails). Same output shape as the Google
// route, so the map draws it the same way: colored T legs along the real track, dashed walking legs.
//
// How: the track lines become a graph (vertices ~10 m apart are merged, line pieces that touch are
// joined), every station snaps onto its lines, and transfers between lines at one station cost
// 5 minutes. Dijkstra from the stations near the start to the stations near the end, in minutes.

export interface LineFeature {
  properties: { line: string; color: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
}
export interface StationPoint {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lon: number;
}
type LngLat = [number, number];

export const WALK_MIN_PER_KM = 12 / 0.75; // straight-line km; streets add ~1/3
export const RIDE_MIN_PER_KM = 2.2; // ~27 km/h including stops
export const WAIT_MIN = 4;
export const TRANSFER_MIN = 5;

export function km(a: LngLat, b: LngLat) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b[1] - a[1]) / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(r(b[0] - a[0]) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

interface Edge {
  to: number;
  min: number;
  line: string | null; // null = transfer or station link
}
interface Node {
  pt: LngLat;
  line: string;
  station?: StationPoint;
}

export interface Graph {
  nodes: Node[];
  adj: Edge[][];
  colors: Record<string, string>;
  stationNodes: Map<string, number[]>; // station id -> its node per line
  stopAt: Map<number, StationPoint>; // track node -> the station snapped onto it (to count stops)
  stations: StationPoint[];
}

export function buildGraph(lines: LineFeature[], stations: StationPoint[]): Graph {
  const nodes: Node[] = [];
  const adj: Edge[][] = [];
  const colors: Record<string, string> = {};
  const byKey = new Map<string, number>();
  const add = (pt: LngLat, line: string) => {
    const key = `${line}:${Math.round(pt[0] * 1e4)}:${Math.round(pt[1] * 1e4)}`;
    let id = byKey.get(key);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ pt, line });
      adj.push([]);
      byKey.set(key, id);
    }
    return id;
  };
  const link = (a: number, b: number, min: number, line: string | null) => {
    if (a === b) return;
    adj[a].push({ to: b, min, line });
    adj[b].push({ to: a, min, line });
  };
  const ends: { id: number; line: string }[] = [];
  for (const f of lines) {
    const line = f.properties.line;
    colors[line] = f.properties.color;
    const c = f.geometry.coordinates;
    let prev = -1;
    for (const pt of c) {
      const id = add(pt, line);
      if (prev >= 0) link(prev, id, km(nodes[prev].pt, pt) * RIDE_MIN_PER_KM, line);
      prev = id;
    }
    if (c.length) ends.push({ id: add(c[0], line), line }, { id: add(c[c.length - 1], line), line });
  }
  // Join line pieces whose ends nearly touch another piece of the same line.
  for (const e of ends) {
    let best = -1, bestD = 0.08;
    for (let i = 0; i < nodes.length; i++) {
      if (i === e.id || nodes[i].line !== e.line) continue;
      const d = km(nodes[e.id].pt, nodes[i].pt);
      if (d < bestD && !adj[e.id].some((x) => x.to === i)) { best = i; bestD = d; }
    }
    if (best >= 0) link(e.id, best, bestD * RIDE_MIN_PER_KM, e.line);
  }
  // Snap each station onto each of its lines; transfers between a station's lines.
  const stationNodes = new Map<string, number[]>();
  const stopAt = new Map<number, StationPoint>();
  for (const s of stations) {
    const mine: number[] = [];
    for (const raw of s.lines) {
      const line = raw.split("-")[0];
      let best = -1, bestD = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].line !== line || nodes[i].station) continue;
        const d = km([s.lon, s.lat], nodes[i].pt);
        if (d < bestD) { best = i; bestD = d; }
      }
      if (best < 0 || bestD > 0.4) continue;
      const id = nodes.length;
      nodes.push({ pt: nodes[best].pt, line, station: s });
      adj.push([]);
      link(id, best, 0, line);
      if (!stopAt.has(best)) stopAt.set(best, s);
      mine.push(id);
    }
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) link(mine[i], mine[j], TRANSFER_MIN, null);
    if (mine.length) stationNodes.set(s.id, mine);
  }
  return { nodes, adj, colors, stationNodes, stopAt, stations };
}

/** Stations to start or end at: the 3 closest, plus any others within 1.2 km (at most 8). */
function nearestStations(g: Graph, p: LngLat) {
  return g.stations
    .filter((s) => g.stationNodes.has(s.id))
    .map((s) => ({ s, d: km(p, [s.lon, s.lat]) }))
    .sort((a, b) => a.d - b.d)
    .filter((x, i) => i < 3 || x.d < 1.2)
    .slice(0, 8);
}

export interface RouteStep {
  mode: "walk" | "transit";
  text?: string;
  minutes: number;
  meters?: number;
  line?: string;
  color?: string;
  from?: string;
  to?: string;
  stops?: number;
}
export interface TransitRoute {
  minutes: number;
  distanceKm: number;
  path: LngLat[];
  segments: { mode: "walk" | "transit"; color: string; path: LngLat[] }[];
  steps: RouteStep[];
  source: "outbound";
}

const WALK_COLOR = "#5b6b7a";
const walkStep = (from: LngLat, to: LngLat, text: string): RouteStep => {
  const d = km(from, to);
  return { mode: "walk", text, minutes: Math.max(1, Math.round(d * WALK_MIN_PER_KM)), meters: Math.round(d * 1333) };
};

/** Best route from `from` to `to` (both [lng, lat]), by T if that beats walking. */
export function planRoute(g: Graph, from: LngLat, to: LngLat, toName = "your destination"): TransitRoute {
  const walkOnly = (): TransitRoute => {
    const s = walkStep(from, to, `Walk to ${toName}`);
    return { minutes: s.minutes, distanceKm: Math.round(km(from, to) * 13.3) / 10, path: [from, to], segments: [{ mode: "walk", color: WALK_COLOR, path: [from, to] }], steps: [s], source: "outbound" };
  };
  const starts = nearestStations(g, from);
  const goals = nearestStations(g, to);
  const dist = new Float64Array(g.nodes.length).fill(Infinity);
  const prev = new Int32Array(g.nodes.length).fill(-1);
  const via: (string | null)[] = new Array(g.nodes.length).fill(null);
  // Tiny binary heap of [minutes, node].
  const heap: [number, number][] = [];
  const push = (x: [number, number]) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const { s, d } of starts) {
    for (const id of g.stationNodes.get(s.id)!) {
      const t = d * WALK_MIN_PER_KM + WAIT_MIN;
      if (t < dist[id]) { dist[id] = t; push([t, id]); }
    }
  }
  while (heap.length) {
    const [t, u] = pop();
    if (t > dist[u]) continue;
    for (const e of g.adj[u]) {
      const nt = t + e.min;
      if (nt < dist[e.to]) {
        dist[e.to] = nt;
        prev[e.to] = u;
        via[e.to] = e.line;
        push([nt, e.to]);
      }
    }
  }
  let best = -1, bestT = Infinity;
  for (const { s, d } of goals) {
    for (const id of g.stationNodes.get(s.id)!) {
      const t = dist[id] + d * WALK_MIN_PER_KM;
      if (t < bestT) { bestT = t; best = id; }
    }
  }
  const direct = km(from, to) * WALK_MIN_PER_KM;
  if (best < 0 || direct <= bestT) return walkOnly();

  // Walk back through prev to get the node chain from the first station to the last.
  const chain: number[] = [];
  for (let u = best; u >= 0; u = prev[u]) chain.unshift(u);
  const first = g.nodes[chain[0]].station!;
  const last = g.nodes[best].station!;

  const segments: TransitRoute["segments"] = [];
  const steps: RouteStep[] = [];
  steps.push(walkStep(from, [first.lon, first.lat], `Walk to ${first.name}`));
  segments.push({ mode: "walk", color: WALK_COLOR, path: [from, [first.lon, first.lat]] });

  // Group the chain into rides on one line, split at transfers.
  let ride: { line: string; path: LngLat[]; from: StationPoint; minutes: number; stops: Set<string> } | null = null;
  let lastStation: StationPoint = first;
  const flush = (to: StationPoint) => {
    if (!ride || ride.path.length < 2) return;
    const color = g.colors[ride.line] ?? "#555";
    segments.push({ mode: "transit", color, path: ride.path });
    steps.push({
      mode: "transit", line: ride.line, color, from: ride.from.name, to: to.name,
      stops: Math.max(1, ride.stops.size - 1), minutes: Math.max(1, Math.round(ride.minutes)),
    });
  };
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1], b = chain[i];
    const line = via[b];
    const nb = g.nodes[b];
    if (nb.station) lastStation = nb.station;
    if (line === null) {
      // Transfer (or stepping onto the track): close the current ride at this station.
      if (ride && nb.station) {
        flush(nb.station);
        steps.push({ mode: "walk", text: `Transfer at ${nb.station.name}`, minutes: TRANSFER_MIN, meters: 0 });
        ride = null;
      }
      continue;
    }
    if (!ride) ride = { line, path: [g.nodes[a].pt], from: g.nodes[a].station ?? lastStation, minutes: 0, stops: new Set() };
    ride.path.push(nb.pt);
    ride.minutes += km(g.nodes[a].pt, nb.pt) * RIDE_MIN_PER_KM;
    const stop = nb.station ?? g.stopAt.get(b);
    if (stop) ride.stops.add(stop.id);
    if (ride.stops.size === 0) ride.stops.add(ride.from.id);
  }
  flush(last);
  steps.push(walkStep([last.lon, last.lat], to, `Walk to ${toName}`));
  segments.push({ mode: "walk", color: WALK_COLOR, path: [[last.lon, last.lat], to] });

  const path = segments.flatMap((s) => s.path);
  let distance = 0;
  for (let i = 1; i < path.length; i++) distance += km(path[i - 1], path[i]);
  return {
    minutes: Math.round(bestT),
    distanceKm: Math.round(distance * 10) / 10,
    path,
    segments,
    steps,
    source: "outbound",
  };
}

/** BU Central (Green B): where routes start when we don't know where the student is. */
export const DEFAULT_START: LngLat = [-71.107037, 42.350049];

let cached: Promise<Graph> | null = null;
/** The graph from the app's own static files (public/data), built once per server. */
export function loadGraph(origin: string): Promise<Graph> {
  cached ??= (async () => {
    const get = async (path: string) => {
      const r = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    };
    const [lines, stations] = await Promise.all([get("/data/mbta-lines.geojson"), get("/data/mbta-stations.json")]);
    return buildGraph(lines.features, stations);
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** Closest T station to [lng, lat], with the walk in minutes. */
export function closestStation(g: Graph, p: LngLat) {
  let best: { s: StationPoint; d: number } | null = null;
  for (const s of g.stations) {
    const d = km(p, [s.lon, s.lat]);
    if (!best || d < best.d) best = { s, d };
  }
  return best
    ? { id: best.s.id, name: best.s.name, lines: [...new Set(best.s.lines.map((l) => l.split("-")[0]))], walkMin: Math.max(1, Math.round(best.d * WALK_MIN_PER_KM)) }
    : null;
}

/** One line per step, for agents and the chat card. */
export function describeRoute(r: TransitRoute): string[] {
  return r.steps.map((s) =>
    s.mode === "walk"
      ? `${s.text} (${s.minutes} min)`
      : `Ride the ${s.line} Line from ${s.from} to ${s.to} (${s.stops} stop${s.stops === 1 ? "" : "s"}, ${s.minutes} min)`,
  );
}
