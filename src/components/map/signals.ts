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

/** MapLibre custom layer: a pole and a 3-lamp signal head on each street coming into a main intersection. */
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
  private poles!: THREE.InstancedMesh;
  private heads!: THREE.InstancedMesh;
  private lamps!: Record<Light, THREE.InstancedMesh>;
  private glow!: THREE.InstancedMesh;
  private tmp = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 2));
    const metal = new THREE.MeshStandardMaterial({ color: "#3b3f45", roughness: 0.6, metalness: 0.3 });
    // pole 5.5 m on the right-hand curb with an arm reaching over the street (+z, the driver's left);
    // the head hangs at the arm's end. Local +x points back at oncoming traffic.
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 5.6, 8).translate(0, 2.8, 0);
    const arm = new THREE.BoxGeometry(0.12, 0.12, 3.2).translate(0, 5.4, 1.6);
    const poleAll = mergeTwo(poleGeo, arm);
    const headGeo = new THREE.BoxGeometry(0.5, 1.45, 0.5).translate(0.0, 4.75, 3.1);
    this.poles = new THREE.InstancedMesh(poleAll, metal, MAX_HEADS);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: "#1d2024", roughness: 0.5 }), MAX_HEADS);
    const lamp = (y: number) => new THREE.SphereGeometry(0.21, 12, 8).scale(0.6, 1, 1).translate(0.27, y, 3.1);
    this.lamps = {
      red: new THREE.InstancedMesh(lamp(5.2), new THREE.MeshBasicMaterial(), MAX_HEADS),
      yellow: new THREE.InstancedMesh(lamp(4.75), new THREE.MeshBasicMaterial(), MAX_HEADS),
      green: new THREE.InstancedMesh(lamp(4.3), new THREE.MeshBasicMaterial(), MAX_HEADS),
    };
    // A soft colored glow on top of the head, so the color reads from above (the map is mostly seen from above).
    this.glow = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 20).translate(0, 5.55, 3.1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 }), MAX_HEADS);
    for (const m of [this.poles, this.heads, this.glow, ...Object.values(this.lamps)]) {
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
    }
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
        const light = lightAt(armAxis(s.arms, bearing), s.offset, t);
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
        this.poles.setMatrixAt(n, m);
        this.heads.setMatrixAt(n, m);
        this.glow.setMatrixAt(n, m);
        this.glow.setColorAt(n, LIT[light]);
        for (const k of ["red", "yellow", "green"] as Light[]) {
          this.lamps[k].setMatrixAt(n, m);
          this.lamps[k].setColorAt(n, k === light ? LIT[k] : DIM[k]);
        }
        n++;
      }
    }
    for (const mesh of [this.poles, this.heads, this.glow, ...Object.values(this.lamps)]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ai = a.toNonIndexed(), bi = b.toNonIndexed();
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal"]) {
    const x = ai.getAttribute(name).array as Float32Array, y = bi.getAttribute(name).array as Float32Array;
    const arr = new Float32Array(x.length + y.length);
    arr.set(x);
    arr.set(y, x.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return g;
}
