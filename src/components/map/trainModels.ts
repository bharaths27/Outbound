// Procedural 3D models of the current MBTA rapid transit cars, in meters.
//   Red Line:    CRRC #1900-series heavy rail car  (~21.0 m, 3 doors/side, stainless + red band)
//   Orange Line: CRRC #1400-series heavy rail car  (~19.8 m, 3 doors/side, stainless + orange band)
//   Green Line:  Type 9 articulated light rail car (~22.6 m, 2 sections, green skirt, pantograph)
// Model axes (three.js, y-up): +x = forward along the track, +y = up, z = across the car.
// Each car is one merged BufferGeometry with vertex colors so it can be drawn with InstancedMesh.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface CarSpec {
  length: number;
  gap: number; // space between coupled cars
  cars: number; // cars per train
  geometry: THREE.BufferGeometry;
}

type Part = THREE.BufferGeometry;

function colored(g: THREE.BufferGeometry, hex: string): Part {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute("uv");
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: string): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return colored(g, hex);
}

function cyl(r: number, depth: number, x: number, y: number, z: number, hex: string): Part {
  const g = new THREE.CylinderGeometry(r, r, depth, 14);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return colored(g, hex);
}

function shell(l: number, h: number, w: number, y: number, r: number, hex: string, x = 0): Part {
  const g = new RoundedBoxGeometry(l, h, w, 3, r);
  g.translate(x, y + h / 2, 0);
  return colored(g, hex);
}

const GLASS = "#1a2129";
const UNDER = "#24272b";
const BOGIE = "#1c1d20";
const WHEEL = "#3a3c40";
const HEADLIGHT = "#fff6d0";

function trucks(parts: Part[], l: number, w: number) {
  for (const sx of [-1, 1]) {
    const cx = sx * (l / 2 - 3.4);
    parts.push(box(2.7, 0.45, w - 0.5, cx, 0.55, 0, BOGIE));
    for (const ax of [-0.95, 0.95])
      for (const sz of [-1, 1]) parts.push(cyl(0.42, 0.18, cx + ax, 0.42, sz * (w / 2 - 0.45), WHEEL));
  }
}

/** Heavy rail car (Red / Orange). */
function heavyRailCar(o: { l: number; w: number; band: string; body: string; doors: number }): THREE.BufferGeometry {
  const { l, w, band, body } = o;
  const parts: Part[] = [];
  const floor = 1.0;
  const h = 2.65;
  // body shell + underframe
  parts.push(shell(l, h, w, floor, 0.22, body));
  parts.push(box(l - 3.2, 0.42, w - 0.7, 0, floor - 0.2, 0, UNDER));
  // roof equipment (A/C units) and roof line
  for (const sx of [-1, 1]) parts.push(box(3.4, 0.32, 1.7, sx * (l / 2 - 4.6), floor + h + 0.14, 0, "#9aa1a8"));
  parts.push(box(l - 1.2, 0.06, 0.9, 0, floor + h + 0.01, 0, "#b9bfc5"));
  // door positions
  const doorX: number[] = [];
  for (let i = 0; i < o.doors; i++) doorX.push(-l / 2 + (l / (o.doors + 1)) * (i + 1));
  for (const sz of [-1, 1]) {
    const z = sz * (w / 2 + 0.012);
    // window band (continuous dark glass between doors)
    parts.push(box(l - 2.6, 0.78, 0.03, 0, floor + 1.32, z, GLASS));
    // colored band under the windows
    parts.push(box(l - 0.6, 0.32, 0.035, 0, floor + 0.78, z, band));
    // thin band above windows
    parts.push(box(l - 0.6, 0.08, 0.035, 0, floor + 1.86, z, band));
    for (const dx of doorX) {
      parts.push(box(1.32, 2.05, 0.05, dx, floor + 1.02, z, "#8e959c"));
      parts.push(box(0.5, 0.85, 0.06, dx - 0.32, floor + 1.4, z, GLASS));
      parts.push(box(0.5, 0.85, 0.06, dx + 0.32, floor + 1.4, z, GLASS));
      parts.push(box(0.04, 2.05, 0.065, dx, floor + 1.02, z, "#5c6267"));
    }
  }
  // cab ends (both ends; MBTA cars run in married pairs)
  for (const sx of [-1, 1]) {
    const x = sx * (l / 2 + 0.01);
    parts.push(box(0.05, 1.0, w - 0.5, x, floor + 1.55, 0, GLASS)); // windshield
    parts.push(box(0.06, 0.9, w - 0.3, x, floor + 0.55, 0, band)); // colored lower nose
    parts.push(box(0.07, 0.36, 0.95, x, floor + 2.32, 0, "#0e1114")); // destination sign
    parts.push(box(0.06, 0.14, 0.7, x + sx * 0.01, floor + 2.32, 0, "#ffb347")); // sign LEDs
    for (const sz of [-1, 1]) parts.push(box(0.08, 0.16, 0.3, x, floor + 0.38, sz * (w / 2 - 0.45), HEADLIGHT));
    parts.push(box(0.4, 0.3, 0.5, sx * (l / 2 + 0.2), floor - 0.15, 0, UNDER)); // coupler
  }
  trucks(parts, l, w);
  return mergeGeometries(parts)!;
}

/** Type 9 articulated light rail vehicle (Green). */
function greenLineCar(): THREE.BufferGeometry {
  const l = 22.6, w = 2.65, floor = 0.95, h = 2.55;
  const half = (l - 0.7) / 2;
  const parts: Part[] = [];
  const GREEN = "#00843D", UPPER = "#e9ecee";
  for (const sx of [-1, 1]) {
    const cx = sx * (half / 2 + 0.35);
    parts.push(shell(half, h, w, floor, 0.3, UPPER, cx));
    for (const sz of [-1, 1]) {
      const z = sz * (w / 2 + 0.012);
      parts.push(box(half - 0.3, 0.85, 0.035, cx, floor + 0.42, z, GREEN)); // green skirt
      parts.push(box(half - 1.4, 0.95, 0.03, cx, floor + 1.45, z, GLASS)); // windows
      parts.push(box(half - 0.3, 0.07, 0.035, cx, floor + 0.88, z, "#b8c2bd"));
      for (const dx of [-half / 4, half / 4]) {
        parts.push(box(1.25, 2.0, 0.05, cx + dx, floor + 1.0, z, "#2f6b4a"));
        parts.push(box(0.48, 0.9, 0.06, cx + dx - 0.3, floor + 1.45, z, GLASS));
        parts.push(box(0.48, 0.9, 0.06, cx + dx + 0.3, floor + 1.45, z, GLASS));
      }
    }
    // cab end
    const x = sx * (l / 2 + 0.01);
    parts.push(box(0.05, 1.15, w - 0.35, x, floor + 1.5, 0, GLASS));
    parts.push(box(0.06, 0.85, w - 0.2, x, floor + 0.45, 0, GREEN));
    parts.push(box(0.07, 0.32, 1.1, x, floor + 2.25, 0, "#0e1114"));
    parts.push(box(0.06, 0.12, 0.8, x + sx * 0.01, floor + 2.25, 0, "#ffb347"));
    for (const sz of [-1, 1]) parts.push(box(0.08, 0.16, 0.28, x, floor + 0.3, sz * (w / 2 - 0.4), HEADLIGHT));
    // roof equipment
    parts.push(box(3.2, 0.36, 1.6, sx * (half - 2.4), floor + h + 0.16, 0, "#a3abb0"));
    parts.push(box(1.2, 0.45, 1.6, sx * 0.0 + sx * 1.6, floor + h + 0.2, 0, "#7d868c"));
    parts.push(box(1.2, 0.45, 0.4, cx, floor - 0.15, 0, UNDER));
  }
  // articulation bellows
  parts.push(box(0.75, h - 0.3, w - 0.35, 0, floor + 0.15 + (h - 0.3) / 2, 0, "#2b2f33"));
  // pantograph (diamond frame + collector bar)
  const py = floor + h + 0.45;
  parts.push(box(1.4, 0.08, 1.3, 0, py, 0, "#3b3f44"));
  for (const sx of [-1, 1]) {
    const arm = new THREE.BoxGeometry(1.25, 0.06, 0.06);
    arm.rotateZ(sx * 0.65);
    arm.translate(sx * 0.32, py + 0.42, 0);
    parts.push(colored(arm, "#3b3f44"));
  }
  parts.push(box(0.12, 0.06, 1.9, 0, py + 0.83, 0, "#222428"));
  // trucks (end trucks + center truck under articulation)
  for (const cx of [-(l / 2 - 3.0), 0, l / 2 - 3.0]) {
    parts.push(box(2.3, 0.42, w - 0.5, cx, 0.52, 0, BOGIE));
    for (const ax of [-0.8, 0.8])
      for (const sz of [-1, 1]) parts.push(cyl(0.34, 0.16, cx + ax, 0.36, sz * (w / 2 - 0.42), WHEEL));
  }
  return mergeGeometries(parts)!;
}

let cache: Record<string, CarSpec> | null = null;

export function carSpecs(): Record<"Red" | "Orange" | "Green" | "Blue", CarSpec> {
  if (cache) return cache as Record<"Red" | "Orange" | "Green" | "Blue", CarSpec>;
  cache = {
    Red: { length: 21.0, gap: 0.9, cars: 6, geometry: heavyRailCar({ l: 21.0, w: 3.05, band: "#DA291C", body: "#d8dce0", doors: 3 }) },
    Orange: { length: 19.8, gap: 0.9, cars: 6, geometry: heavyRailCar({ l: 19.8, w: 2.82, band: "#ED8B00", body: "#d8dce0", doors: 3 }) },
    Green: { length: 22.6, gap: 0.8, cars: 2, geometry: greenLineCar() },
    Blue: { length: 14.8, gap: 0.8, cars: 6, geometry: heavyRailCar({ l: 14.8, w: 2.8, band: "#003DA5", body: "#d8dce0", doors: 2 }) },
  };
  return cache as Record<"Red" | "Orange" | "Green" | "Blue", CarSpec>;
}
