// Builds game-style 3D buildings from real footprints + heights (City of Cambridge GIS):
// small rectangular buildings become houses with a gable roof and a chimney, the rest get flat roofs
// with rooftop units. Facade detail (windows, trim, shop fronts) comes from the shared facade shader.
import * as THREE from "three";

export interface Footprint {
  rings: [number, number][][]; // lng/lat, first ring outer
  h: number; // meters, top of building
}

const M_LAT = 110_540;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

// Cambridge triple-deckers and row houses come in many colors; bigger buildings are brick, stone or glass.
const HOUSE_COLORS = [
  [236, 204, 122], [158, 182, 146], [168, 196, 222], [226, 150, 120], [247, 241, 229],
  [198, 118, 84], [214, 176, 210], [238, 228, 206], [140, 170, 190], [230, 190, 150],
];
const BIG_COLORS = [[198, 118, 84], [170, 72, 56], [238, 228, 206], [226, 196, 146], [222, 170, 136], [247, 241, 229]];
const TOWER_COLORS = [[118, 160, 204], [98, 140, 188], [168, 200, 228]];

function hash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

class Buf {
  pos: number[] = [];
  col: number[] = [];
  tri(a: number[], b: number[], c: number[], rgb: number[]) {
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) this.col.push(rgb[0], rgb[1], rgb[2]);
  }
  quad(a: number[], b: number[], c: number[], d: number[], rgb: number[]) {
    this.tri(a, b, c, rgb);
    this.tri(a, c, d, rgb);
  }
  /** vertical walls of a closed ring from y0 to y1 (ring counter-clockwise seen from above = outward faces) */
  walls(ring: [number, number][], y0: number, y1: number, rgb: number[]) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
      this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], rgb);
    }
  }
  box(cx: number, cz: number, sx: number, sz: number, y0: number, y1: number, ang: number, rgb: number[]) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const pt = (dx: number, dz: number): [number, number] => [cx + dx * c - dz * s, cz + dx * s + dz * c];
    const r = [pt(-sx, -sz), pt(sx, -sz), pt(sx, sz), pt(-sx, sz)];
    this.walls(ccw(r), y0, y1, rgb);
    const top = ccw(r).map(([x, z]) => [x, y1, z]);
    this.quad(top[0], top[3], top[2], top[1], rgb);
  }
}

const signedArea = (r: [number, number][]) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, z1] = r[i], [x2, z2] = r[(i + 1) % r.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
};
// In x-east / z-south coordinates, "counter-clockwise from above" has negative signed area here.
const ccw = (r: [number, number][]) => (signedArea(r) > 0 ? [...r].reverse() : r);

/** Oriented bounding box via the longest edge direction. */
function obb(r: [number, number][]) {
  let best = { ang: 0, len: 0 };
  for (let i = 0; i < r.length; i++) {
    const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len > best.len) best = { ang: Math.atan2(bz - az, bx - ax), len };
  }
  const c = Math.cos(best.ang), s = Math.sin(best.ang);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, z] of r) {
    const u = x * c + z * s, v = -x * s + z * c;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
  return { cx: cu * c - cv * s, cz: cu * s + cv * c, hu: (maxU - minU) / 2, hv: (maxV - minV) / 2, ang: best.ang };
}

export function buildCityMesh(feats: Footprint[], center: [number, number]) {
  const [lng0, lat0] = center;
  const kx = mLng(lat0);
  const toXZ = ([lng, lat]: [number, number]): [number, number] => [(lng - lng0) * kx, -(lat - lat0) * M_LAT];
  const b = new Buf();
  feats.forEach((f, i) => {
    const outer = f.rings[0].slice(0, -1).map(toXZ);
    if (outer.length < 3) return;
    const holes = f.rings.slice(1).map((r) => r.slice(0, -1).map(toXZ));
    const H = Math.max(3, f.h);
    const area = Math.abs(signedArea(outer));
    const box = obb(outer);
    const rect = area / (4 * box.hu * box.hv);
    const r = hash(i + 1);

    if (H <= 15 && area < 420 && area > 25 && rect > 0.78) {
      // ---- house: walls to the eaves, gable roof along the long side, chimney ----
      const rgb = HOUSE_COLORS[Math.floor(r * HOUSE_COLORS.length)];
      const eave = Math.max(2.8, H - Math.min(box.hu, box.hv) * 0.75);
      const roofCol = [[84, 92, 112], [70, 115, 92], [150, 64, 52], [96, 84, 80]][Math.floor(hash(i + 7) * 4)];
      const long = box.hu >= box.hv;
      const c = Math.cos(box.ang), s = Math.sin(box.ang);
      const P = (u: number, v: number, y: number) => [box.cx + u * c - v * s, y, box.cz + u * s + v * c];
      const hu = box.hu + 0.35, hv = box.hv + 0.35; // small overhang
      b.walls(ccw([[box.cx + (-box.hu) * c - (-box.hv) * s, box.cz + (-box.hu) * s + (-box.hv) * c],
        [box.cx + box.hu * c - (-box.hv) * s, box.cz + box.hu * s + (-box.hv) * c],
        [box.cx + box.hu * c - box.hv * s, box.cz + box.hu * s + box.hv * c],
        [box.cx + (-box.hu) * c - box.hv * s, box.cz + (-box.hu) * s + box.hv * c]]), 0, eave, rgb);
      if (long) {
        // ridge along u
        const r0 = P(-hu, 0, H), r1 = P(hu, 0, H);
        b.quad(P(-hu, -hv, eave), r0, r1, P(hu, -hv, eave), roofCol);
        b.quad(P(hu, hv, eave), r1, r0, P(-hu, hv, eave), roofCol);
        b.tri(P(-box.hu, -box.hv, eave), P(-box.hu, box.hv, eave), P(-box.hu, 0, H - 0.3), rgb);
        b.tri(P(box.hu, box.hv, eave), P(box.hu, -box.hv, eave), P(box.hu, 0, H - 0.3), rgb);
      } else {
        const r0 = P(0, -hv, H), r1 = P(0, hv, H);
        b.quad(P(hu, -hv, eave), r0, r1, P(hu, hv, eave), roofCol);
        b.quad(P(-hu, hv, eave), r1, r0, P(-hu, -hv, eave), roofCol);
        b.tri(P(box.hu, -box.hv, eave), P(-box.hu, -box.hv, eave), P(0, -box.hv, H - 0.3), rgb);
        b.tri(P(-box.hu, box.hv, eave), P(box.hu, box.hv, eave), P(0, box.hv, H - 0.3), rgb);
      }
      if (hash(i + 3) > 0.35) {
        const along = (hash(i + 5) - 0.5) * 1.2 * (long ? box.hu : box.hv);
        const [x, , z] = long ? P(along, box.hv * 0.3, 0) : P(box.hu * 0.3, along, 0);
        b.box(x, z, 0.45, 0.45, eave, H + 1.2, box.ang, [150, 70, 56]);
      }
      return;
    }

    // ---- flat-roofed building ----
    const tall = H > 40;
    const pal = tall && r > 0.35 ? TOWER_COLORS : BIG_COLORS;
    const rgb = pal[Math.floor(hash(i + 11) * pal.length)];
    b.walls(ccw(outer), 0, H, rgb);
    for (const h of holes) if (h.length >= 3) b.walls([...ccw(h)].reverse() as [number, number][], 0, H, rgb);
    const shape = THREE.ShapeUtils.triangulateShape(
      outer.map(([x, z]) => new THREE.Vector2(x, z)),
      holes.filter((h) => h.length >= 3).map((h) => h.map(([x, z]) => new THREE.Vector2(x, z))),
    );
    const all = [...outer, ...holes.flat()];
    const roofRgb = [205, 205, 200];
    for (const [p, q, t] of shape) {
      const A = [all[p][0], H, all[p][1]], B = [all[q][0], H, all[q][1]], C = [all[t][0], H, all[t][1]];
      // face up: choose winding so the normal points +y
      const cross = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
      if (cross < 0) b.tri(A, B, C, roofRgb);
      else b.tri(A, C, B, roofRgb);
    }
    // rooftop units / elevator housing
    if (area > 250 && Math.min(box.hu, box.hv) > 6) {
      const sx = Math.min(box.hu * 0.3, 7), sz = Math.min(box.hv * 0.3, 5);
      b.box(box.cx, box.cz, sx, sz, H, H + 2.2 + hash(i + 13) * 1.5, box.ang, [182, 182, 178]);
      if (area > 900) b.box(box.cx + box.hu * 0.45 * Math.cos(box.ang), box.cz + box.hu * 0.45 * Math.sin(box.ang), 1.6, 1.6, H, H + 1.8, box.ang, [160, 162, 160]);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute("color", new THREE.BufferAttribute(new Uint8Array(b.col), 3, true));
  return g;
}

/** Seconds, shared by all tree materials (wind animation). */
export const TREE_TIME = { value: 0 };

/** Low-poly stylized trees, instanced: round crown on a short trunk. */
export function makeTreeMesh(points: { x: number; z: number; s: number }[]) {
  const crown = new THREE.IcosahedronGeometry(1, 1);
  crown.scale(1, 0.9, 1).translate(0, 1.55, 0);
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5).translate(0, 0.45, 0);
  const merged = mergeColored([
    [crown, [74, 140, 70]],
    [trunk, [110, 78, 52]],
  ]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // crowns sway a little in the wind (trunks stay put)
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TREE_TIME;
    shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      float sway = max(transformed.y - 0.9, 0.0);
      vec3 ip = instanceMatrix[3].xyz;
      float gust = 0.6 + 0.4 * sin(uTime * 0.35 + ip.x * 0.01);
      transformed.x += sin(uTime * 1.7 + ip.x * 0.17 + ip.z * 0.11) * 0.07 * sway * gust;
      transformed.z += cos(uTime * 1.3 + ip.z * 0.13) * 0.05 * sway * gust;`,
    );
  };
  const mesh = new THREE.InstancedMesh(merged, mat, points.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const tint = new THREE.Color();
  points.forEach((p, i) => {
    const s = p.s * (0.8 + hash(i + 0.5) * 0.5);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i + 0.25) * 6.28);
    m.compose(v.set(p.x, 0, p.z), q, sc.set(s, s * (0.9 + hash(i + 0.75) * 0.3), s));
    mesh.setMatrixAt(i, m);
    // a little color variety, some autumn trees like a game map
    const k = hash(i + 0.9);
    tint.setRGB(...(k > 0.93 ? [1.5, 1.1, 0.5] : k > 0.86 ? [1.35, 0.8, 0.5] : [0.85 + k * 0.3, 0.95 + k * 0.15, 0.85]) as [number, number, number]);
    mesh.setColorAt(i, tint);
  });
  mesh.frustumCulled = false;
  return mesh;
}

function mergeColored(parts: [THREE.BufferGeometry, number[]][]) {
  const pos: number[] = [], col: number[] = [];
  for (const [g0, rgb] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      col.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
