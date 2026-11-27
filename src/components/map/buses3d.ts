// Live MBTA buses on the map.
//   Close and middle zoom: a 3D bus model (MBTA yellow, Silver Line gray) with its route number on the roof.
//   Zoomed really far out: a flat "mini bus" icon with the number (symbol layer, images drawn here).
// Positions glide between MBTA snapshots, like the trains (trains3d.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { BUS_YELLOW, SILVER_GRAY, meters, type Bus } from "@/lib/bus";
import type { BusAnimator, BusNow } from "./bus-track";
import { modelMatrix } from "./trains3d";

/** Width in meters of a main road as drawn at this zoom (matches majorW in style.ts for a mid-size road, r = 2). */
export function roadMeters(zoom: number, lat: number): number {
  const stops: [number, number][] = [[10, 2], [13, 5.4], [16, 19], [19, 104]];
  let px = stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, w0] = stops[i - 1], [z1, w1] = stops[i];
    if (zoom <= z1) {
      // exponential base 2, like the map's line-width interpolation
      const t = (Math.pow(2, Math.max(0, zoom - z0)) - 1) / (Math.pow(2, z1 - z0) - 1);
      px = w0 + (w1 - w0) * Math.min(1, Math.max(0, t));
      break;
    }
    px = w1;
  }
  const metersPerPx = (40_075_016 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
  return px * metersPerPx;
}

/** Below this zoom the flat mini bus shows instead of the 3D model. Same as the trains. */
export const BUS_3D_MIN_ZOOM = 12.3;

export { BusAnimator, type BusNow } from "./bus-track";

// ---------- the 3D model ----------

function colored(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex).convertSRGBToLinear();
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute("uv");
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: string) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return colored(g, hex);
};

/** A 12 m MBTA bus in meters. Axes like the train cars: +x forward, +y up, z across. */
export const BUS_LENGTH = 12;
const BUS_WIDTH = 2.6;
const BUS_HEIGHT = 3.1;
function busGeometry(body: string, stripe: string): THREE.BufferGeometry {
  const L = BUS_LENGTH, W = BUS_WIDTH, H = BUS_HEIGHT, r = 0.7;
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + r, 0.5); s.lineTo(L / 2 - r, 0.5); s.quadraticCurveTo(L / 2, 0.5, L / 2, 0.5 + r);
  s.lineTo(L / 2, H - r); s.quadraticCurveTo(L / 2, H, L / 2 - r, H); s.lineTo(-L / 2 + r, H);
  s.quadraticCurveTo(-L / 2, H, -L / 2, H - r); s.lineTo(-L / 2, 0.5 + r); s.quadraticCurveTo(-L / 2, 0.5, -L / 2 + r, 0.5);
  const shell = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2, curveSegments: 4 });
  shell.translate(0, 0, -W / 2);
  const glass = "#24384a";
  const wheel = (x: number, z: number) => {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 14);
    g.rotateX(Math.PI / 2);
    g.translate(x, 0.55, z);
    return colored(g, "#1d1d1d");
  };
  const parts = [
    colored(shell, body),
    box(L + 0.1, 0.45, W + 0.34, 0, 0.72, 0, "#3a3a3a"), // skirt
    box(L - 2.6, 0.95, W + 0.36, -0.6, 2.15, 0, glass), // side windows
    box(0.2, 1.4, W - 0.2, L / 2 + 0.12, 2.0, 0, glass), // windshield
    box(L - 1, 0.18, W + 0.34, 0, 1.62, 0, stripe), // side stripe
    box(L - 1.2, 0.25, W - 0.2, 0, H + 0.2, 0, "#f7f4ee"), // white roof
    box(2.4, 0.4, 1.6, -3.8, H + 0.45, 0, "#dcd6cc"), // roof AC unit
    box(0.12, 0.42, W - 0.5, L / 2 + 0.22, 2.85, 0, "#1b1410"), // destination sign
    box(0.1, 0.18, 0.5, L / 2 + 0.2, 0.95, 0.85, "#fff6c8"), box(0.1, 0.18, 0.5, L / 2 + 0.2, 0.95, -0.85, "#fff6c8"), // headlights
    box(0.1, 0.2, 0.4, -L / 2 - 0.2, 1.0, 0.85, "#e0412f"), box(0.1, 0.2, 0.4, -L / 2 - 0.2, 1.0, -0.85, "#e0412f"), // tail lights
    wheel(3.6, W / 2 + 0.05), wheel(3.6, -W / 2 - 0.05), wheel(-3.4, W / 2 + 0.05), wheel(-3.4, -W / 2 - 0.05),
  ];
  return mergeGeometries(parts)!;
}

/** For tests: the merged yellow bus geometry. */
export const busGeometryForTest = () => busGeometry(BUS_YELLOW, "#6B1F33");

/** The roof number: a dark rounded plate with the route number, drawn once per number. */
function roofTexture(number: string, silver: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 112;
  const g = c.getContext("2d")!;
  g.fillStyle = silver ? "#5f686e" : "#2B1A1F";
  g.beginPath();
  g.roundRect(6, 6, 244, 100, 22);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#ffffff";
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = `800 ${number.length > 3 ? 58 : number.length > 2 ? 70 : 84}px "DM Sans", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(number, 128, 60);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const MAX_BUSES = 1200;
const MAX_ROOF_LABELS = 160; // nearest to the middle of the screen

/** MapLibre custom layer: every bus as a 3D model, one InstancedMesh per color, roof numbers as small planes. */
export class Buses3DLayer implements CustomLayerInterface {
  id = "buses-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;
  minZoom = BUS_3D_MIN_ZOOM;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private yellow!: THREE.InstancedMesh;
  private gray!: THREE.InstancedMesh;
  private shadows!: THREE.InstancedMesh;
  private roofGeo = new THREE.PlaneGeometry(5.6, 2.45);
  private roofMats = new Map<string, THREE.MeshBasicMaterial>();
  private roofPool: THREE.Mesh[] = [];
  private tmp = new THREE.Matrix4();
  private rot = new THREE.Matrix4();
  private scl = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();
  /** Where each bus was drawn last frame, for tapping. */
  drawn: BusNow[] = [];

  constructor(private animator: BusAnimator) {
    this.roofGeo.rotateX(-Math.PI / 2);
    this.roofGeo.translate(1.0, BUS_HEIGHT + 0.36, 0);
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 2.1));
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.0);
    sun.position.set(-60, 120, 80);
    this.scene.add(sun);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
    this.yellow = new THREE.InstancedMesh(busGeometry(BUS_YELLOW, "#6B1F33"), mat, MAX_BUSES);
    this.gray = new THREE.InstancedMesh(busGeometry(SILVER_GRAY, "#c7cdd1"), mat, 200);
    for (const m of [this.yellow, this.gray]) {
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }), MAX_BUSES);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = -1;
    this.scene.add(this.shadows);
  }

  /** Enlarged when zoomed out so buses stay visible: about half as wide as the drawn road (its right-hand side),
   *  with a floor so they don't shrink to specks far out. */
  scaleFor(zoom: number, lat: number) {
    const fitRoad = (0.5 * roadMeters(zoom, lat)) / BUS_WIDTH;
    const visible = 0.75 * Math.pow(2, (18 - zoom) * 0.78);
    return Math.min(12, Math.max(1.2, fitRoad, visible));
  }

  private roofMat(number: string, silver: boolean) {
    const key = `${number}|${silver}`;
    let m = this.roofMats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: roofTexture(number, silver), transparent: true });
      this.roofMats.set(key, m);
    }
    return m;
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    if (!this.visible || zoom < this.minZoom) {
      this.drawn = [];
      return;
    }
    const center0 = this.map.getCenter();
    const scale = this.scaleFor(zoom, center0.lat);
    const center = this.map.getCenter();
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const origin = modelMatrix(new THREE.Matrix4(), center.lng, center.lat, globe);
    this.originInv.copy(origin).invert();
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.camera.projectionMatrix = main.multiply(origin);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    // Only buses on (or just off) the screen.
    const b = this.map.getBounds();
    const padLng = (b.getEast() - b.getWest()) * 0.15, padLat = (b.getNorth() - b.getSouth()) * 0.15;
    // Right-hand half of the drawn road: a bus is half the road wide, centered a quarter in from the middle.
    const all = this.animator.now(performance.now(), 0.25 * roadMeters(zoom, center0.lat));
    const onScreen = all.filter((x) => x.lng > b.getWest() - padLng && x.lng < b.getEast() + padLng && x.lat > b.getSouth() - padLat && x.lat < b.getNorth() + padLat);
    this.drawn = onScreen;

    let ny = 0, ng = 0, ns = 0;
    const placed: { m: THREE.Matrix4; bus: Bus; d: number }[] = [];
    for (const x of onScreen) {
      modelMatrix(this.tmp, x.lng, x.lat, globe);
      this.tmp.premultiply(this.originInv);
      this.rot.makeRotationY(x.heading);
      this.scl.makeScale(scale, scale, scale);
      const m = this.tmp.clone().multiply(this.rot).multiply(this.scl);
      if (x.bus.silver) {
        if (ng < this.gray.instanceMatrix.count) this.gray.setMatrixAt(ng++, m);
      } else if (ny < this.yellow.instanceMatrix.count) this.yellow.setMatrixAt(ny++, m);
      this.scl.makeScale(BUS_LENGTH * scale * 1.1, 1, BUS_WIDTH * scale * 1.5);
      const sm = this.tmp.clone().multiply(this.rot).multiply(this.scl);
      sm.elements[13] += 0.05 * scale;
      if (ns < MAX_BUSES) this.shadows.setMatrixAt(ns++, sm);
      placed.push({ m, bus: x.bus, d: (x.lng - center.lng) ** 2 + (x.lat - center.lat) ** 2 });
    }
    this.yellow.count = ny;
    this.gray.count = ng;
    this.shadows.count = ns;
    for (const mesh of [this.yellow, this.gray, this.shadows]) mesh.instanceMatrix.needsUpdate = true;

    // Roof numbers on the buses closest to the middle of the screen.
    placed.sort((p, q) => p.d - q.d);
    const labelled = placed.slice(0, MAX_ROOF_LABELS);
    while (this.roofPool.length < labelled.length) {
      const mesh = new THREE.Mesh(this.roofGeo);
      mesh.matrixAutoUpdate = false;
      this.roofPool.push(mesh);
      this.scene.add(mesh);
    }
    this.roofPool.forEach((mesh, i) => {
      const p = labelled[i];
      mesh.visible = !!p;
      if (!p) return;
      mesh.material = this.roofMat(p.bus.number, p.bus.silver);
      mesh.matrix.copy(p.m);
    });

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}

// ---------- the flat mini bus (zoomed far out) ----------

/** Image id for a mini bus: "bus-<number>-<s|y>-<l|r>". */
export const miniBusId = (number: string, silver: boolean, left: boolean) => `bus-${number}-${silver ? "s" : "y"}-${left ? "l" : "r"}`;

/** Draws the mini bus (number on a white plate) for map.addImage, at 2x for sharp edges. */
export function miniBusImage(id: string): { width: number; height: number; data: Uint8ClampedArray } | null {
  const m = /^bus-(.+)-([sy])-([lr])$/.exec(id);
  if (!m) return null;
  const [, number, kind, dir] = m;
  const px = 2, W = 66 * px, H = 40 * px;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.scale(px, px);
  g.fillStyle = "rgba(0,0,0,.18)";
  g.beginPath();
  g.ellipse(32, 35, 24, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  if (dir === "l") {
    g.translate(64, 0);
    g.scale(-1, 1);
  }
  g.fillStyle = kind === "s" ? SILVER_GRAY : BUS_YELLOW;
  g.strokeStyle = "#2B1A1F";
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(4, 8, 54, 22, 7);
  g.fill();
  g.stroke();
  g.fillStyle = "#cfe6f3";
  g.lineWidth = 1.5;
  g.beginPath();
  g.roundRect(44, 12, 11, 9, 2.5);
  g.fill();
  g.stroke();
  g.fillStyle = "#2B1A1F";
  for (const x of [16, 47]) {
    g.beginPath();
    g.arc(x, 30, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.fillStyle = "#ffffff";
  g.strokeStyle = "#2B1A1F";
  g.lineWidth = 1.2;
  g.beginPath();
  g.roundRect(17, 11.5, 25, 13, 3);
  g.fill();
  g.stroke();
  g.fillStyle = "#2B1A1F";
  g.font = `800 ${number.length > 3 ? 7.5 : number.length > 2 ? 9 : 10.5}px "DM Sans", system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(number, 29.5, 18.5);
  return { width: W, height: H, data: g.getImageData(0, 0, W, H).data };
}

// ---------- sample buses (no MBTA key, or the feed is down) ----------

const SAMPLE_ROUTES: { route: string; number: string; silver?: boolean; ends: [string, string]; path: [number, number][] }[] = [
  { route: "57", number: "57", ends: ["Watertown Yard", "Kenmore"], path: [[-71.095, 42.3489], [-71.1054, 42.3504], [-71.1167, 42.3524], [-71.1253, 42.3518], [-71.1337, 42.353], [-71.1514, 42.3486]] },
  { route: "1", number: "1", ends: ["Harvard", "Nubian"], path: [[-71.0838, 42.3294], [-71.0835, 42.3415], [-71.0852, 42.3426], [-71.0877, 42.3478], [-71.0942, 42.3601], [-71.1037, 42.3655], [-71.1189, 42.3734]] },
  { route: "47", number: "47", ends: ["Central", "Broadway"], path: [[-71.1, 42.336], [-71.0935, 42.3411], [-71.095, 42.3489], [-71.1, 42.3496], [-71.1065, 42.3536], [-71.1037, 42.3655]] },
  { route: "66", number: "66", ends: ["Nubian", "Harvard"], path: [[-71.1189, 42.3734], [-71.131, 42.361], [-71.1214, 42.3424], [-71.1168, 42.3327], [-71.0954, 42.3314], [-71.0838, 42.3294]] },
  { route: "39", number: "39", ends: ["Forest Hills", "Back Bay"], path: [[-71.0757, 42.3474], [-71.085, 42.3424], [-71.096, 42.3375], [-71.103, 42.333], [-71.1105, 42.3236], [-71.1137, 42.3005]] },
  { route: "749", number: "SL5", silver: true, ends: ["Nubian", "Downtown"], path: [[-71.0603, 42.3555], [-71.064, 42.3498], [-71.0683, 42.344], [-71.072, 42.339], [-71.0765, 42.333], [-71.0838, 42.3294]] },
];

/** Simulated buses moving along a few real routes, both ways. Labeled as samples in the UI. */
export class SampleBuses {
  private t = 0;
  /** Each sample route's path, so sample buses stay on it like real ones on their shapes. */
  shapes(): [string, [number, number][]][] {
    return SAMPLE_ROUTES.map((r) => [r.route, r.path]);
  }
  step(seconds: number): Bus[] {
    this.t += seconds;
    const out: Bus[] = [];
    SAMPLE_ROUTES.forEach((r, ri) => {
      const segs: { a: [number, number]; b: [number, number]; len: number; start: number }[] = [];
      let total = 0;
      for (let k = 1; k < r.path.length; k++) {
        const len = meters(r.path[k - 1], r.path[k]);
        segs.push({ a: r.path[k - 1], b: r.path[k], len, start: total });
        total += len;
      }
      for (let n = 0; n < 4; n++) {
        const back = n % 2 === 1;
        const d0 = ((this.t * 7 + (n * total) / 4 + ri * 911) % total + total) % total; // ~7 m/s
        const d = back ? total - d0 : d0;
        const s = segs.find((q) => d >= q.start && d <= q.start + q.len) ?? segs.at(-1)!;
        const f = (d - s.start) / s.len;
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
        const bearing = ((Math.atan2(dx * Math.cos((s.a[1] * Math.PI) / 180), dy) * 180) / Math.PI + (back ? 180 : 0) + 360) % 360;
        out.push({
          id: `sample-${r.route}-${n}`,
          route: r.route,
          number: r.number,
          silver: !!r.silver,
          lon: s.a[0] + dx * f,
          lat: s.a[1] + dy * f,
          bearing,
          headsign: r.ends[back ? 1 : 0],
          status: "IN_TRANSIT_TO",
          stopName: null,
          directionId: back ? 1 : 0,
        });
      }
    });
    return out;
  }
}
