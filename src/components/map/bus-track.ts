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
}

export function makeShape(pts: LL[]): Shape {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + meters(pts[i - 1], pts[i]));
  return { pts, cum, total: cum.at(-1) ?? 0 };
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
  /** Route id -> its shapes (both directions, variants). */
  shapes = new Map<string, Shape[]>();

  setShapes(route: string, lines: LL[][]) {
    this.shapes.set(route, lines.filter((l) => l.length > 1).map(makeShape));
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
      const { p, heading } = this.at(t, now);
      if (t.shape) t.heading = heading;
      out.push({
        bus: t.bus,
        lng: p[0] + (Math.sin(heading) * side) / kx(p[1]),
        lat: p[1] - (Math.cos(heading) * side) / KY,
        heading,
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
