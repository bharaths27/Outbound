// Track network: snaps trains onto the real track geometry and walks along it,
// so trains (and each car behind the lead car) follow curves instead of cutting corners.
// Geometry math runs in local meters around Boston; results go back to lng/lat.

export type LineName = "Red" | "Orange" | "Green" | "Blue";

const LON0 = -71.06;
const LAT0 = 42.36;
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const KY = 110574;

export const toXY = (lon: number, lat: number): [number, number] => [(lon - LON0) * KX, (lat - LAT0) * KY];
export const toLngLat = (x: number, y: number): [number, number] => [x / KX + LON0, y / KY + LAT0];

interface Poly {
  line: LineName;
  pts: [number, number][];
  cum: number[]; // cumulative length at each vertex
  len: number;
  startKey: string;
  endKey: string;
}

export interface TrackPos {
  poly: number;
  along: number;
}

export interface Placed {
  x: number;
  y: number;
  heading: number; // radians, 0 = east, counter-clockwise (pi/2 = north)
}

const keyOf = (p: [number, number]) => `${Math.round(p[0] / 3)}:${Math.round(p[1] / 3)}`;

export class TrackNetwork {
  polys: Poly[] = [];
  nodes = new Map<string, number[]>();

  constructor(geojson: GeoJSON.FeatureCollection) {
    for (const f of geojson.features) {
      if (f.geometry.type !== "LineString") continue;
      const pts = (f.geometry.coordinates as number[][]).map(([lon, lat]) => toXY(lon, lat));
      const cum = [0];
      for (let i = 1; i < pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const poly: Poly = {
        line: (f.properties as { line: LineName }).line,
        pts,
        cum,
        len: cum[cum.length - 1],
        startKey: keyOf(pts[0]),
        endKey: keyOf(pts[pts.length - 1]),
      };
      const idx = this.polys.push(poly) - 1;
      for (const k of [poly.startKey, poly.endKey]) {
        if (!this.nodes.has(k)) this.nodes.set(k, []);
        this.nodes.get(k)!.push(idx);
      }
    }
  }

  /** Nearest point on any polyline of this line. Returns null if > maxDist meters away. */
  snap(x: number, y: number, line: LineName, maxDist = 250): (TrackPos & { dist: number; tangent: number }) | null {
    let best: (TrackPos & { dist: number; tangent: number }) | null = null;
    this.polys.forEach((p, pi) => {
      if (p.line !== line) return;
      for (let i = 1; i < p.pts.length; i++) {
        const [ax, ay] = p.pts[i - 1];
        const [bx, by] = p.pts[i];
        const dx = bx - ax, dy = by - ay;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const px = ax + t * dx, py = ay + t * dy;
        const d = Math.hypot(x - px, y - py);
        if (!best || d < best.dist)
          best = { poly: pi, along: p.cum[i - 1] + t * Math.sqrt(l2), dist: d, tangent: Math.atan2(dy, dx) };
      }
    });
    if (!best || (best as { dist: number }).dist > maxDist) return null;
    return best;
  }

  /** Point + heading at `along` on a polyline (heading in polyline direction). */
  pointAt(poly: number, along: number): Placed {
    const p = this.polys[poly];
    const a = Math.max(0, Math.min(p.len, along));
    let lo = 1;
    while (lo < p.cum.length - 1 && p.cum[lo] < a) lo++;
    const [ax, ay] = p.pts[lo - 1];
    const [bx, by] = p.pts[lo];
    const seg = p.cum[lo] - p.cum[lo - 1] || 1;
    const t = (a - p.cum[lo - 1]) / seg;
    return { x: ax + t * (bx - ax), y: ay + t * (by - ay), heading: Math.atan2(by - ay, bx - ax) };
  }

  /**
   * Walk `dist` meters from (poly, along) in direction dir (+1 = increasing along).
   * Crosses into connected polylines at junctions, preferring the straightest continuation.
   */
  walk(poly: number, along: number, dist: number, dir: 1 | -1): TrackPos & { dir: 1 | -1 } {
    let cur = poly, a = along, d = dir, left = dist;
    for (let hops = 0; hops < 6; hops++) {
      const p = this.polys[cur];
      const room = d > 0 ? p.len - a : a;
      if (left <= room) return { poly: cur, along: a + d * left, dir: d };
      left -= room;
      const nodeKey = d > 0 ? p.endKey : p.startKey;
      const here = this.pointAt(cur, d > 0 ? p.len : 0);
      const travelHeading = d > 0 ? here.heading : here.heading + Math.PI;
      let next: { poly: number; dir: 1 | -1; score: number } | null = null;
      for (const ni of this.nodes.get(nodeKey) ?? []) {
        if (ni === cur) continue;
        const np = this.polys[ni];
        if (np.line !== p.line) continue;
        const fromStart = np.startKey === nodeKey;
        const nd: 1 | -1 = fromStart ? 1 : -1;
        const h = this.pointAt(ni, fromStart ? 0.5 : np.len - 0.5).heading + (fromStart ? 0 : Math.PI);
        const score = Math.cos(h - travelHeading);
        if (!next || score > next.score) next = { poly: ni, dir: nd, score };
      }
      if (!next) return { poly: cur, along: d > 0 ? p.len : 0, dir: d }; // end of the line
      cur = next.poly;
      d = next.dir;
      a = d > 0 ? 0 : this.polys[cur].len;
    }
    return { poly: cur, along: a, dir: d };
  }

  /** Signed distance from a to b if they are on the same polyline, else null. */
  delta(a: TrackPos, b: TrackPos): number | null {
    return a.poly === b.poly ? b.along - a.along : null;
  }

  lineOf(poly: number) {
    return this.polys[poly].line;
  }
}
