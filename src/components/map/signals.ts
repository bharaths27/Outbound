// Traffic lights at main intersections, Waze style: each street coming into the intersection gets a light
// that cycles green -> yellow -> red, with the crossing street on the opposite phase.
// Locations: public/data/ground/signals.json (scripts/data-build/signals.py). Cities don't publish live
// signal timing, so the cycle is a typical one (not the real light's timing); this is said in the UI.
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { modelMatrix } from "./trains3d";
import { roadMeters } from "./buses3d";

export type Light = "green" | "yellow" | "red";

/** One full cycle, seconds: street A green 18, yellow 3, all red 1, then street B the same. */
export const CYCLE_S = 44;
const GREEN_S = 18, YELLOW_S = 3, ALL_RED_S = 1;

/** Stable 0..1 per intersection so neighbors don't all change together. */
export function signalOffset(lng: number, lat: number): number {
  const x = Math.sin(lng * 12.9898 + lat * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Which axis an arm belongs to: 0 for the first street's direction (and its opposite), 1 for the crossing one. */
export function armAxis(arms: number[], bearing: number): 0 | 1 {
  const ref = arms[0] ?? 0;
  const d = Math.abs(((bearing - ref) % 180 + 180) % 180);
  return Math.min(d, 180 - d) < 45 ? 0 : 1;
}

/** The light an arm shows at time t (seconds). */
export function lightAt(axis: 0 | 1, offset: number, t: number): Light {
  const s = (((t + offset * CYCLE_S) % CYCLE_S) + CYCLE_S) % CYCLE_S;
  const half = GREEN_S + YELLOW_S + ALL_RED_S; // 22
  const mine = axis === 0 ? s : (s + half) % CYCLE_S;
  if (mine < GREEN_S) return "green";
  if (mine < GREEN_S + YELLOW_S) return "yellow";
  return "red";
}

/** The walk signal on the crosswalk across a street: WALK only while that street's cars are stopped and the crossing street has green. */
export function walkAt(axis: 0 | 1, offset: number, t: number): boolean {
  return lightAt(axis, offset, t) === "red" && lightAt(axis === 0 ? 1 : 0, offset, t) === "green";
}

/** Seconds until the light changes (for the little countdown on tap). */
export function secondsLeft(axis: 0 | 1, offset: number, t: number): number {
  let n = 0;
  const now = lightAt(axis, offset, t);
  while (n < CYCLE_S && lightAt(axis, offset, t + n + 1) === now) n++;
  return n + 1;
}

export interface Signal {
  lng: number;
  lat: number;
  /** Compass bearings (degrees) of each street leaving the intersection. */
  arms: number[];
  offset: number;
}

export async function loadSignals(): Promise<Signal[]> {
  const r = await fetch("/data/ground/signals.json");
  const j = (await r.json()) as { signals: [number, number, number[]][] };
  return j.signals.map(([lng, lat, arms]) => ({ lng, lat, arms, offset: signalOffset(lng, lat) }));
}

export const SIGNALS_MIN_ZOOM = 15;
const MAX_HEADS = 900;
const LIT: Record<Light, THREE.Color> = { red: new THREE.Color("#ff3b30"), yellow: new THREE.Color("#ffcc00"), green: new THREE.Color("#30d158") };
const DIM: Record<Light, THREE.Color> = { red: new THREE.Color("#3a1512"), yellow: new THREE.Color("#3a3110"), green: new THREE.Color("#10301a") };

const PED_HAND = { on: new THREE.Color("#ff7a1a"), off: new THREE.Color("#3a2414") };
const PED_WALK = { on: new THREE.Color("#f4f8ff"), off: new THREE.Color("#2c3036") };

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; lit?: "lamp" | "hand" | "walk" | "glow"; lamp?: Light };

/** The street furniture at one corner, in meters. The pole stands on the right-hand curb; local +x points back at
 *  the oncoming drivers, +z reaches over the street. Built like a city mast-arm signal with a walk signal. */
function cornerParts(): Part[] {
  const pole = new THREE.MeshStandardMaterial({ color: "#2f3338", roughness: 0.55, metalness: 0.45 });
  const black = new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.5 });
  const green = new THREE.MeshStandardMaterial({ color: "#1f6b3a", roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.6 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#b9b6ae", roughness: 0.9 });
  const parts: Part[] = [];
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, extra: Partial<Part> = {}) => parts.push({ geo, mat, ...extra });

  // footing, pole with a collar, round cap
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 12).translate(0, 0.11, 0), concrete);
  add(new THREE.CylinderGeometry(0.2, 0.26, 0.6, 10).translate(0, 0.5, 0), pole);
  add(new THREE.CylinderGeometry(0.13, 0.18, 5.7, 10).translate(0, 3.05, 0), pole);
  add(new THREE.SphereGeometry(0.16, 10, 8).translate(0, 5.92, 0), pole);
  // mast arm out over the street, with a slim brace under it
  add(new THREE.CylinderGeometry(0.06, 0.1, 3.9, 8).rotateX(Math.PI / 2).translate(0, 5.45, 1.95), pole);
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 6).rotateX(Math.PI / 2 - 0.42).translate(0, 5.1, 0.78), pole);
  // green street-name blade on top of the arm
  add(new THREE.BoxGeometry(0.03, 0.32, 1.5).translate(0, 5.78, 1.2), green);
  add(new THREE.BoxGeometry(0.035, 0.24, 1.38).translate(0, 5.78, 1.2), green);
  add(new THREE.BoxGeometry(0.036, 0.03, 1.38).translate(0, 5.9, 1.2), white);

  // signal head hanging from the arm's end: yellow-bordered backplate, black housing, a visor over each lamp
  const hz = 3.1;
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6).translate(0, 5.32, hz), pole);
  add(new THREE.BoxGeometry(0.05, 1.85, 0.86).translate(-0.27, 4.75, hz), yellow);
  add(new THREE.BoxGeometry(0.055, 1.7, 0.72).translate(-0.265, 4.75, hz), black);
  add(new THREE.BoxGeometry(0.46, 1.42, 0.46).translate(0, 4.75, hz), black);
  for (const [k, y] of [["red", 5.2], ["yellow", 4.75], ["green", 4.3]] as [Light, number][]) {
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 16).rotateZ(Math.PI / 2).translate(0.24, y, hz), black);
    add(new THREE.SphereGeometry(0.16, 14, 8).scale(0.45, 1, 1).translate(0.25, y, hz), new THREE.MeshBasicMaterial(), { lit: "lamp", lamp: k });
    // visor: the top half of a short tube sticking out over the lamp
    add(new THREE.CylinderGeometry(0.21, 0.21, 0.34, 14, 1, true, Math.PI, Math.PI).rotateZ(-Math.PI / 2).translate(0.42, y, hz), new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.6, side: THREE.DoubleSide }));
  }
  // a soft colored glow on top of the head, so the color reads from above (the map is mostly seen from above)
  add(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 20).translate(0, 5.5, hz), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), { lit: "glow" });

  // walk signal on the pole, facing across the street (+z): orange hand and white walking person side by side
  const pz = 0.42;
  add(new THREE.BoxGeometry(0.06, 0.06, 0.22).translate(0, 2.75, 0.17), pole);
  add(new THREE.BoxGeometry(0.62, 0.5, 0.24).translate(0, 2.75, pz), black);
  add(new THREE.BoxGeometry(0.66, 0.05, 0.3).translate(0, 3.02, pz + 0.04), black); // hood
  add(new THREE.BoxGeometry(0.22, 0.3, 0.02).translate(-0.15, 2.74, pz + 0.125), new THREE.MeshBasicMaterial(), { lit: "hand" });
  add(new THREE.BoxGeometry(0.22, 0.3, 0.02).translate(0.15, 2.74, pz + 0.125), new THREE.MeshBasicMaterial(), { lit: "walk" });
  // push button for the crosswalk, with its little sign
  add(new THREE.BoxGeometry(0.14, 0.24, 0.12).translate(0, 1.1, 0.2), yellow);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateX(Math.PI / 2).translate(0, 1.06, 0.27), black);
  add(new THREE.BoxGeometry(0.2, 0.28, 0.015).translate(0, 1.42, 0.2), white);
  return parts;
}

/** MapLibre custom layer: on each street coming into a main intersection, a mast-arm signal (lights cycling) and a walk signal. */
export class SignalsLayer implements CustomLayerInterface {
  id = "signals-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;
  signals: Signal[] = [];

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private meshes: { mesh: THREE.InstancedMesh; part: Part }[] = [];
  private tmp = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.4);
    sun.position.set(-40, 80, 30);
    this.scene.add(sun);
    // same-material parts share one instanced mesh (fewer draw calls)
    const byMat = new Map<THREE.Material, Part[]>();
    for (const p of cornerParts()) {
      if (p.lit) {
        this.addMesh(p.geo, p);
        continue;
      }
      byMat.set(p.mat, [...(byMat.get(p.mat) ?? []), p]);
    }
    for (const [mat, ps] of byMat) this.addMesh(mergeAll(ps.map((p) => p.geo)), { geo: ps[0].geo, mat });
  }

  private addMesh(geo: THREE.BufferGeometry, part: Part) {
    const mesh = new THREE.InstancedMesh(geo, part.mat, MAX_HEADS);
    mesh.count = 0;
    mesh.frustumCulled = false;
    if (part.lit) mesh.setColorAt(0, LIT.red);
    this.scene.add(mesh);
    this.meshes.push({ mesh, part });
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    if (!this.visible || zoom < SIGNALS_MIN_ZOOM || !this.signals.length) return;
    const c = this.map.getCenter();
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const origin = modelMatrix(new THREE.Matrix4(), c.lng, c.lat, globe);
    this.originInv.copy(origin).invert();
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.camera.projectionMatrix = main.multiply(origin);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    const road = roadMeters(zoom, c.lat);
    // bigger than life so the colors read on a phone, but still standing on the corner, not in the street
    const scale = Math.min(6, Math.max(1.5, road / 7));
    const b = this.map.getBounds();
    const t = Date.now() / 1000;
    const kx = 111_320 * Math.cos((c.lat * Math.PI) / 180);
    let n = 0;
    const rot = new THREE.Matrix4(), scl = new THREE.Matrix4().makeScale(scale, scale, scale);
    for (const s of this.signals) {
      if (s.lng < b.getWest() || s.lng > b.getEast() || s.lat < b.getSouth() || s.lat > b.getNorth()) continue;
      for (const bearing of s.arms) {
        if (n >= MAX_HEADS) break;
        const axis = armAxis(s.arms, bearing);
        const light = lightAt(axis, s.offset, t);
        const walk = walkAt(axis, s.offset, t);
        // Stand on the right-hand corner of this street, just before the intersection.
        const br = (bearing * Math.PI) / 180;
        const out = road * 0.75, side = road * 0.62;
        const east = Math.sin(br) * out + Math.cos(br) * side * -1;
        const north = Math.cos(br) * out - Math.sin(br) * side * -1;
        modelMatrix(this.tmp, s.lng + east / kx, s.lat + north / 110_570, globe);
        this.tmp.premultiply(this.originInv);
        // local +x points out along this street, at the drivers coming in
        rot.makeRotationY(Math.PI / 2 - br);
        const m = this.tmp.multiply(rot).multiply(scl);
        for (const { mesh, part } of this.meshes) {
          mesh.setMatrixAt(n, m);
          if (part.lit === "lamp") mesh.setColorAt(n, part.lamp === light ? LIT[part.lamp!] : DIM[part.lamp!]);
          else if (part.lit === "glow") mesh.setColorAt(n, LIT[light]);
          else if (part.lit === "hand") mesh.setColorAt(n, walk ? PED_HAND.off : PED_HAND.on);
          else if (part.lit === "walk") mesh.setColorAt(n, walk ? PED_WALK.on : PED_WALK.off);
        }
        n++;
      }
    }
    for (const { mesh } of this.meshes) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map((g) => g.toNonIndexed());
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal"]) {
    const arrs = parts.map((p) => p.getAttribute(name).array as Float32Array);
    const out = new Float32Array(arrs.reduce((a, x) => a + x.length, 0));
    let o = 0;
    for (const a of arrs) {
      out.set(a, o);
      o += a.length;
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  return g;
}
