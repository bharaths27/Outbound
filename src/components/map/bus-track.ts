// Keeps buses on their streets: each bus is snapped to its MBTA route shape and glides
// along that shape between position updates, instead of cutting straight across blocks.
// Pure (no three.js / map), so it is unit tested.
import { meters, type Bus } from "@/lib/bus";

type LL = [number, number];

const ease = (t: number) => t * t * (3 - 2 * t);
const KY = 110_570;
const kx = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** A route shape with running distances, ready for snapping. */
export interface Shape {
  pts: LL[];
  /** Meters from the start to each point. */
  cum: number[];
  total: number;
  /** Width in meters of the drawn street at each point (when snapped onto the streets). */
  w?: number[];
}

export function makeShape(pts: LL[], w?: number[]): Shape {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + meters(pts[i - 1], pts[i]));
  return { pts, cum, total: cum.at(-1) ?? 0, w };
}

/** Width of a street nobody told us about (a side street): narrow, so a bus keeps close to the middle. */
export const DEFAULT_ROAD_M = 9;

/** Width of the street under a shape at a distance along it. */
export function roadWidthAt(s: Shape, along: number): number {
  if (!s.w) return DEFAULT_ROAD_M;
  let lo = 0, hi = s.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s.cum[mid] <= along) lo = mid;
    else hi = mid - 1;
  }
  return Math.min(s.w[lo], s.w[Math.min(lo + 1, s.w.length - 1)]);
}

/** Meters right of the centerline for a bus `busW` wide on a street `roadW` wide: the middle of the right-hand lane,
 *  but always fully between the centerline and the curb. */
export function laneOffset(roadW: number, busW: number): number {
  const half = roadW / 2;
  const fit = Math.max(busW / 2 + 0.25, Math.min(roadW / 4, half - busW / 2 - 0.25));
  return Math.min(fit, Math.max(busW / 2, half - busW / 2)); // a street narrower than two buses: hug the middle
}

/** Closest point on a shape: distance along it, how far off it the point is, and the direction there. */
export function project(s: Shape, p: LL): { along: number; off: number; heading: number } {
  const k = kx(p[1]);
  let best = { along: 0, off: Infinity, heading: 0 };
  for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i];
    const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * KY, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * KY;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const off = Math.hypot(ax + dx * t, ay + dy * t);
    if (off < best.off) best = { along: s.cum[i - 1] + t * (s.cum[i] - s.cum[i - 1]), off, heading: Math.atan2(dy, dx) };
  }
  return best;
}

/** The point and direction at a distance along a shape. */
export function pointAt(s: Shape, along: number): { p: LL; heading: number } {
  const d = Math.max(0, Math.min(s.total, along));
  let lo = 1, hi = s.pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const a = s.pts[i - 1], b = s.pts[i];
  const seg = s.cum[i] - s.cum[i - 1];
  const t = seg ? (d - s.cum[i - 1]) / seg : 0;
  const k = kx(a[1]);
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: Math.atan2((b[1] - a[1]) * KY, (b[0] - a[0]) * k) };
}

export interface BusNow {
  bus: Bus;
  lng: number;
  lat: number;
  /** Radians, 0 = east, counter-clockwise (same as the trains). */
  heading: number;
  /** The street it is driving along and how far along it (for bending the bus around corners). */
  shape?: Shape;
  along?: number;
}

/** A point `side` meters to the right of a shape at a distance along it, and the direction there.
 *  `side` can depend on the width of the street there. */
export function lanePoint(s: Shape, along: number, side: number | ((roadW: number) => number)): { p: LL; heading: number } {
  const { p, heading } = pointAt(s, along);
  if (typeof side === "function") side = side(roadWidthAt(s, along));
  return { p: [p[0] + (Math.sin(heading) * side) / kx(p[1]), p[1] - (Math.cos(heading) * side) / KY], heading };
}

/** An articulated bus on a street: where the joint is and which way the front and rear sections point.
 *  Each section points along the chord from its axle to the joint, so on a corner the front turns first
 *  and the rear follows, bending at the joint. `ahead` / `behind` are the axle distances from the joint (m). */
export function bendPose(s: Shape, along: number, side: number | ((roadW: number) => number), ahead: number, behind: number): { p: LL; front: number; rear: number } {
  const j = lanePoint(s, along, side);
  const f = lanePoint(s, Math.min(s.total, along + ahead), side);
  const r = lanePoint(s, Math.max(0, along - behind), side);
  const dir = (a: LL, b: LL, fallback: number) => {
    const dx = (b[0] - a[0]) * kx(a[1]), dy = (b[1] - a[1]) * KY;
    return Math.hypot(dx, dy) < 0.3 ? fallback : Math.atan2(dy, dx);
  };
  return { p: j.p, front: dir(j.p, f.p, j.heading), rear: dir(r.p, j.p, j.heading) };
}

// ---------- keeping route shapes on the drawn streets ----------

/** The streets on the map (OpenStreetMap / Overture main roads) as a grid of segments, for snapping. */
export interface RoadNet {
  lat0: number;
  segs: Float64Array; // x0, y0, x1, y1 in meters around (0, lat0)
  /** Drawn width of each segment's street (m). */
  w: Float32Array;
  grid: Map<string, number[]>;
}
const CELL_M = 60;
const cellKey = (x: number, y: number) => `${Math.floor(x / CELL_M)},${Math.floor(y / CELL_M)}`;

export function makeRoadNet(lines: LL[][], lat0 = 42.36, widths?: number[]): RoadNet {
  const k = kx(lat0);
  const out: number[] = [];
  const ws: number[] = [];
  const grid = new Map<string, number[]>();
  lines.forEach((l, li) => {
    for (let i = 1; i < l.length; i++) {
      ws.push(widths?.[li] ?? 12);
      const x0 = l[i - 1][0] * k, y0 = l[i - 1][1] * KY, x1 = l[i][0] * k, y1 = l[i][1] * KY;
      const id = out.length / 4;
      out.push(x0, y0, x1, y1);
      // every cell the segment passes through
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (CELL_M / 2)));
      const keys = new Set<string>();
      for (let t = 0; t <= n; t++) keys.add(cellKey(x0 + ((x1 - x0) * t) / n, y0 + ((y1 - y0) * t) / n));
      for (const key of keys) {
        let a = grid.get(key);
        if (!a) grid.set(key, (a = []));
        a.push(id);
      }
    }
  });
  return { lat0, segs: new Float64Array(out), w: new Float32Array(ws), grid };
}

/** Moves a route line onto the nearest street running the same way (within `maxM`), point by point every ~8 m,
 *  so buses drive down the middle of the drawn road instead of beside it. Points with no street nearby stay. */
export function snapToRoads(net: RoadNet, pts: LL[], maxM = 22): LL[] {
  return snapToRoadsW(net, pts, maxM).pts;
}

/** snapToRoads, plus the drawn width of the street at each point (DEFAULT_ROAD_M where no street was found). */
export function snapToRoadsW(net: RoadNet, pts: LL[], maxM = 22): { pts: LL[]; w: number[] } {
  if (pts.length < 2) return { pts, w: pts.map(() => DEFAULT_ROAD_M) };
  const k = kx(net.lat0);
  // densify
  const dense: [number, number, number, number][] = []; // x, y, dirx, diry
  for (let i = 1; i < pts.length; i++) {
    const x0 = pts[i - 1][0] * k, y0 = pts[i - 1][1] * KY, x1 = pts[i][0] * k, y1 = pts[i][1] * KY;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.01) continue;
    const n = Math.max(1, Math.ceil(len / 8));
    for (let t = 0; t < n; t++) dense.push([x0 + ((x1 - x0) * t) / n, y0 + ((y1 - y0) * t) / n, (x1 - x0) / len, (y1 - y0) / len]);
    if (i === pts.length - 1) dense.push([x1, y1, (x1 - x0) / len, (y1 - y0) / len]);
  }
  const out: LL[] = [];
  const ow: number[] = [];
  let last: [number, number] | null = null;
  for (const [x, y, ux, uy] of dense) {
    let best: [number, number] | null = null, bestD = maxM, bestW = DEFAULT_ROAD_M;
    const cx = Math.floor(x / CELL_M), cy = Math.floor(y / CELL_M);
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++)
        for (const id of net.grid.get(`${gx},${gy}`) ?? []) {
          const ax = net.segs[id * 4], ay = net.segs[id * 4 + 1], bx = net.segs[id * 4 + 2], by = net.segs[id * 4 + 3];
          const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
          if (len < 0.01) continue;
          // same direction (either way along the street), so cross streets at a corner don't grab it
          if (Math.abs((dx * ux + dy * uy) / len) < 0.8) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (len * len)));
          const px = ax + dx * t, py = ay + dy * t;
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) {
            bestD = d;
            best = [px, py];
            bestW = net.w[id];
          }
        }
    const q = best ?? [x, y];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 1.5) continue;
    last = q;
    out.push([q[0] / k, q[1] / KY]);
    ow.push(best ? bestW : DEFAULT_ROAD_M);
  }
  return out.length > 1 ? { pts: out, w: ow } : { pts, w: pts.map(() => DEFAULT_ROAD_M) };
}

interface Track {
  bus: Bus;
  t0: number;
  t1: number;
  /** On a shape: glide from one distance to another along it. */
  shape?: Shape;
  fromAlong?: number;
  toAlong?: number;
  /** Off any shape: straight line (last resort). */
  from: LL;
  to: LL;
  heading: number;
}

const headingOfBearing = (deg: number) => Math.PI / 2 - (deg * Math.PI) / 180;
/** Farther than this from every shape of its route, a bus isn't snapped. */
const SNAP_M = 60;
/** A jump longer than this between updates is drawn as a jump, not a 15 s drive. */
const MAX_GLIDE_M = 2500;

export class BusAnimator {
  tracks = new Map<string, Track>();
  /** Route id -> its shapes (both directions, variants), snapped onto the drawn streets once those are known. */
  shapes = new Map<string, Shape[]>();
  private raw = new Map<string, LL[][]>();
  private roads: RoadNet | null = null;

  setShapes(route: string, lines: LL[][]) {
    const ok = lines.filter((l) => l.length > 1);
    this.raw.set(route, ok);
    this.shapes.set(route, ok.map((l) => this.shapeOf(l)));
  }

  private shapeOf(l: LL[]): Shape {
    if (!this.roads) return makeShape(l);
    const s = snapToRoadsW(this.roads, l);
    return makeShape(s.pts, s.w);
  }

  /** The streets as drawn on the map: every route shape (now and later) is moved onto them. */
  setRoads(net: RoadNet, now = performance.now()) {
    this.roads = net;
    for (const [route, lines] of this.raw) this.shapes.set(route, lines.map((l) => this.shapeOf(l)));
    // buses on an old shape wait where they are until their next update snaps them to the new one
    for (const t of this.tracks.values()) {
      if (!t.shape) continue;
      const cur = this.at(t, now);
      Object.assign(t, { shape: undefined, fromAlong: undefined, toAlong: undefined, from: cur.p, to: cur.p, t0: now, t1: now, heading: cur.heading });
    }
  }

  /** Best shape for a bus: closest, facing the way it's heading. */
  private snap(bus: Bus, p: LL, keep?: Shape) {
    const list = this.shapes.get(bus.route);
    if (!list?.length) return null;
    if (keep && list.includes(keep)) {
      const pr = project(keep, p);
      if (pr.off < SNAP_M * 0.7) return { shape: keep, ...pr };
    }
    const want = headingOfBearing(bus.bearing);
    let best: { shape: Shape; along: number; off: number; heading: number; score: number } | null = null;
    for (const shape of list) {
      const pr = project(shape, p);
      const turn = Math.abs(Math.atan2(Math.sin(pr.heading - want), Math.cos(pr.heading - want)));
      const score = pr.off + (turn > Math.PI / 2 ? 40 : 0);
      if (pr.off < SNAP_M && (!best || score < best.score)) best = { shape, ...pr, score };
    }
    return best;
  }

  ingest(buses: Bus[], durationMs: number, now = performance.now()) {
    const seen = new Set<string>();
    for (const b of buses) {
      seen.add(b.id);
      const to: LL = [b.lon, b.lat];
      const old = this.tracks.get(b.id);
      const cur = old ? this.at(old, now) : null;
      const snapped = this.snap(b, to, old?.shape);
      if (snapped) {
        const same = old?.shape === snapped.shape && cur?.along != null;
        let fromAlong = same ? cur!.along! : snapped.along;
        let toAlong = snapped.along;
        // GPS wobbling backwards a little: hold still instead of reversing.
        if (same && toAlong < fromAlong && fromAlong - toAlong < 40) toAlong = fromAlong;
        if (same && Math.abs(toAlong - fromAlong) > MAX_GLIDE_M) fromAlong = toAlong;
        this.tracks.set(b.id, { bus: b, t0: now, t1: now + durationMs, shape: snapped.shape, fromAlong, toAlong, from: to, to, heading: cur?.heading ?? snapped.heading });
        continue;
      }
      const from = cur ? cur.p : to;
      let heading = cur?.heading ?? headingOfBearing(b.bearing);
      if (meters(from, to) > 4) heading = Math.atan2((to[1] - from[1]) * KY, (to[0] - from[0]) * kx(to[1]));
      this.tracks.set(b.id, { bus: b, from, to, t0: now, t1: now + durationMs, heading });
    }
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
  }

  private at(t: Track, now: number): { p: LL; heading: number; along?: number } {
    const k = ease(t.t1 > t.t0 ? Math.max(0, Math.min(1, (now - t.t0) / (t.t1 - t.t0))) : 1);
    if (t.shape && t.fromAlong != null && t.toAlong != null) {
      const along = t.fromAlong + (t.toAlong - t.fromAlong) * k;
      const at = pointAt(t.shape, along);
      // Parked or creeping: keep the last direction so it doesn't spin.
      return { p: at.p, heading: t.toAlong === t.fromAlong ? t.heading : at.heading, along };
    }
    return { p: [t.from[0] + (t.to[0] - t.from[0]) * k, t.from[1] + (t.to[1] - t.from[1]) * k], heading: t.heading };
  }

  /** Every bus now. `side` (meters) moves each bus into the right-hand lane so opposite directions don't overlap. */
  now(now = performance.now(), side = 0): BusNow[] {
    const out: BusNow[] = [];
    for (const t of this.tracks.values()) {
      const { p, heading, along } = this.at(t, now);
      if (t.shape) t.heading = heading;
      out.push({
        bus: t.bus,
        lng: p[0] + (Math.sin(heading) * side) / kx(p[1]),
        lat: p[1] - (Math.cos(heading) * side) / KY,
        heading,
        shape: t.shape,
        along,
      });
    }
    return out;
  }

  clear() {
    this.tracks.clear();
  }
}

/** Decodes a Google encoded polyline (what MBTA shapes use) into [lng, lat] points. */
export function decodePolyline(str: string): LL[] {
  const out: LL[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, byte: number;
      do {
        byte = str.charCodeAt(i++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}
