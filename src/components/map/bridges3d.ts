// 3D bridges: the map draws roads and tracks on bridges flat on the water, like any other street. This adds what
// makes them read as bridges in 3D: a concrete parapet along both edges, a dark deck edge (fascia) on the water side,
// and street lamps. Data: the basemap's own bridge lines (OpenMapTiles transportation,
// brunnel=bridge), the same zoom-14 tiles as the buildings (buildingTiles.ts).
import * as THREE from "three";
import type { BuildingFeature } from "./buildingTiles";

const M_LAT = 110_540;

/** Deck width in meters by OpenMapTiles road class (the same real widths the map draws the roads at, style.ts). */
export function bridgeWidth(cls: unknown): number {
  switch (cls) {
    case "motorway": return 24;
    case "trunk": case "primary": return 17;
    case "secondary": case "tertiary": return 14;
    case "minor": case "street": return 11;
    case "service": case "track": return 7;
    case "rail": case "transit": return 10;
    case "path": case "pedestrian": return 4.5;
    default: return 10;
  }
}

type V = [number, number, number];

class Buf {
  pos: number[] = [];
  col: number[] = [];
  quad(a: V, b: V, c: V, d: V, rgb: number[]) {
    for (const p of [a, b, c, a, c, d]) {
      this.pos.push(...p);
      this.col.push(rgb[0], rgb[1], rgb[2]);
    }
  }
  /** Box between two ground points, `w` wide, from y0 to y1 (all four sides and the top). */
  slab(ax: number, az: number, bx: number, bz: number, w: number, y0: number, y1: number, rgb: number[], top = rgb) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * (w / 2), nz = (dx / len) * (w / 2);
    const p = (x: number, z: number, s: number, y: number): V => [x + nx * s, y, z + nz * s];
    const a0 = p(ax, az, -1, y0), a1 = p(ax, az, 1, y0), b0 = p(bx, bz, -1, y0), b1 = p(bx, bz, 1, y0);
    const A0 = p(ax, az, -1, y1), A1 = p(ax, az, 1, y1), B0 = p(bx, bz, -1, y1), B1 = p(bx, bz, 1, y1);
    this.quad(a0, b0, B0, A0, rgb);
    this.quad(b1, a1, A1, B1, rgb);
    this.quad(a1, a0, A0, A1, rgb);
    this.quad(b0, b1, B1, B0, rgb);
    this.quad(A0, B0, B1, A1, top);
  }
}

const CONCRETE = [196, 192, 184], CAP = [222, 219, 212], FASCIA = [92, 98, 108], POLE = [70, 76, 84], LAMP = [255, 236, 170];

/** One mesh for all bridges near `center` (meters: x east, y up, z south, like the buildings). */
export function buildBridgeMesh(lines: BuildingFeature[], center: [number, number]): THREE.BufferGeometry {
  const [lng0, lat0] = center;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const toXZ = ([lng, lat]: number[]): [number, number] => [(lng - lng0) * kx, -(lat - lat0) * M_LAT];
  const b = new Buf();
  const seen = new Set<string>();
  for (const f of lines) {
    const g = f.geometry;
    const parts = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    const w = bridgeWidth(f.properties.class);
    const small = w < 6;
    for (const line of parts) {
      const pts = line.map(toXZ);
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        // the same segment comes back once per tile it touches
        const key = `${Math.round(ax + bx)}|${Math.round(az + bz)}|${w}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.5) continue;
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (const s of [-1, 1]) {
          const ox = nx * s * (w / 2), oz = nz * s * (w / 2);
          // dark deck edge just outside the road, then the parapet wall with a lighter cap
          // (the deck edge reaches below the water line: the map is flat, so seen at an angle this reads as the
          // bridge's side standing above the water)
          const e = 1 + 0.35 / (w / 2);
          b.slab(ax + ox * e, az + oz * e, bx + ox * e, bz + oz * e, 0.7, small ? -0.8 : -1.8, 0.3, FASCIA);
          b.slab(ax + ox, az + oz, bx + ox, bz + oz, small ? 0.2 : 0.6, 0, small ? 1.1 : 1.35, small ? POLE : CONCRETE, small ? POLE : CAP);
        }
        // street lamps every ~35 m (not on footbridges), on alternating sides
        if (!small) {
          for (let d = 17; d < len; d += 35) {
            const t = d / len, s = Math.floor(d / 35) % 2 ? 1 : -1;
            const x = ax + (bx - ax) * t + nx * s * (w / 2 - 0.2), z = az + (bz - az) * t + nz * s * (w / 2 - 0.2);
            b.slab(x, z, x + nx * 0.01, z + nz * 0.01, 0.22, 0, 7, POLE);
            b.slab(x, z, x - nx * s * 1.6, z - nz * s * 1.6, 0.25, 6.8, 7.05, POLE);
            b.slab(x - nx * s * 1.4, z - nz * s * 1.4, x - nx * s * 1.7, z - nz * s * 1.7, 0.4, 6.6, 6.85, LAMP);
          }
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(b.col), 3, true));
  geo.computeVertexNormals();
  return geo;
}

export const bridgeMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
