// Live MBTA buses on the map.
//   Close and middle zoom: a 3D articulated bus (MBTA yellow, Silver Line gray) with its route number on the roof.
//   It bends at the joint on turns: the front and rear sections each follow the street (bendPose in bus-track.ts).
//   Zoomed really far out: a flat "mini bus" icon with the number (symbol layer, images drawn here).
// Positions glide between MBTA snapshots, like the trains (trains3d.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { BUS_YELLOW, SILVER_GRAY, meters, type Bus } from "@/lib/bus";
import { bendPose, DEFAULT_ROAD_M, laneOffset, type BusAnimator, type BusNow } from "./bus-track";
import { modelMatrix } from "./trains3d";
import { evalZoomInterp, metersPerPx, realRoadMeters } from "./style";

/** Which road widths the map draws: the Boston 3D base map (OpenFreeMap Liberty, real width up close; style.ts
 *  widenToReal) or the offline basemap (style.ts majorW). */
let roadStyle: "liberty" | "offline" = "liberty";
export const setRoadStyle = (s: "liberty" | "offline") => void (roadStyle = s);

const LIBERTY_PRIMARY: [number, number][] = [[5, 0], [7, 1], [20, 18]]; // "road_trunk_primary"
const OFFLINE_MAJOR: [number, number][] = [[10, 3.1], [13, 10], [16, 34], [19, 152]]; // majorW, r = 2

/** Width in meters of a main road as drawn at this zoom. */
export function roadMeters(zoom: number, lat: number): number {
  if (roadStyle === "offline") return evalZoomInterp(2, OFFLINE_MAJOR, zoom) * metersPerPx(zoom, lat);
  const m = evalZoomInterp(1.2, LIBERTY_PRIMARY, zoom) * metersPerPx(zoom, lat);
  return zoom >= 15 ? Math.max(m, realRoadMeters("road_trunk_primary")!) : m;
}

/** Below this zoom buses are flat top-down icons pointing the way they drive; from here on, 3D models.
 *  Further out a 3D bus would have to be blown up past the street and into the buildings to be seen. */
export const BUS_3D_MIN_ZOOM = 16;

/** Half the width of a real main street, curb to curb (meters). A bus never reaches past this,
 *  so it never pokes into a building even when drawn bigger than life. */
export const HALF_STREET_M = 9;

/** How big and where across the street a bus is drawn: width in meters and how far right of the centerline. */
export function busFit(zoom: number, lat: number): { width: number; offset: number } {
  const road = roadMeters(zoom, lat);
  // Real size from zoom 17.5 in; a little bigger (up to 1.5x) further out so it can still be seen, but never wider
  // than a lane of the narrowest street a bus drives (DEFAULT_ROAD_M), so it always fits between centerline and curb.
  const grow = Math.min(1.5, 1 + Math.max(0, 17.5 - zoom) / 3);
  const width = Math.min(BUS_WIDTH * grow, Math.max(BUS_WIDTH, DEFAULT_ROAD_M / 2 - 0.5), 0.5 * road);
  return { width: Math.max(BUS_WIDTH, width), offset: laneOffset(Math.min(road, 2 * HALF_STREET_M), Math.max(BUS_WIDTH, width)) };
}

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

/** An 18 m articulated MBTA bus (New Flyer XDE60 size) in meters. Axes like the train cars: +x forward, +y up,
 *  z across (+z = right / curb side). Origin = the joint; the front section is ahead of it, the rear behind. */
export const BUS_LENGTH = 18.4;
const BUS_WIDTH = 2.6;
const BUS_HEIGHT = 3.15;
const JOINT_GAP = 0.45;
const FRONT_LEN = 11.4;
const REAR_LEN = 6.55;
/** Joint to the front axle and to the rear (drive) axle: the points that steer each section (bendPose). */
export const FRONT_AXLE = JOINT_GAP + FRONT_LEN - 2.6;
export const REAR_AXLE = JOINT_GAP + REAR_LEN - 1.9;
const ROOF_PLATE_X = 7.5;

const GLASS = "#1c2a38";
const CHROME = "#c9ced3";
const RUBBER = "#1d1d1d";

/** Rounded shell between x0 and x1 (front end rounder than the joint end). */
function shell(x0: number, x1: number, body: string, roundFront: boolean, roundRear: boolean) {
  const H = BUS_HEIGHT, W = BUS_WIDTH, rf = roundFront ? 0.7 : 0.18, rr = roundRear ? 0.55 : 0.18;
  const s = new THREE.Shape();
  s.moveTo(x0 + rr, 0.5); s.lineTo(x1 - rf, 0.5); s.quadraticCurveTo(x1, 0.5, x1, 0.5 + rf);
  s.lineTo(x1, H - rf); s.quadraticCurveTo(x1, H, x1 - rf, H); s.lineTo(x0 + rr, H);
  s.quadraticCurveTo(x0, H, x0, H - rr); s.lineTo(x0, 0.5 + rr); s.quadraticCurveTo(x0, 0.5, x0 + rr, 0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -W / 2);
  return colored(g, body);
}

function wheel(x: number, side: number) {
  const z = side * (BUS_WIDTH / 2 + 0.04);
  const tire = new THREE.CylinderGeometry(0.52, 0.52, 0.36, 16);
  tire.rotateX(Math.PI / 2);
  tire.translate(x, 0.52, z);
  const hub = new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12);
  hub.rotateX(Math.PI / 2);
  hub.translate(x, 0.52, z + side * 0.2);
  // dark wheel well above the tire
  return [colored(tire, RUBBER), colored(hub, CHROME), box(1.35, 0.22, 0.05, x, 1.08, side * (BUS_WIDTH / 2 + 0.13), "#2a2a2a")];
}

/** Side windows from x0 to x1 on both sides: dark glass panes between thin pillars, skipping door spans. */
function windows(x0: number, x1: number, pillar: string, skip: [number, number][]) {
  const out: THREE.BufferGeometry[] = [];
  const z = BUS_WIDTH / 2 + 0.13;
  const n = Math.max(1, Math.round((x1 - x0) / 1.45));
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * w, c = a + w / 2;
    for (const side of [1, -1]) {
      if (side === 1 && skip.some(([s0, s1]) => c > s0 && c < s1)) continue; // doors are on the curb side only
      out.push(box(w - 0.14, 0.98, 0.05, c, 2.27, side * z, GLASS));
      out.push(box(w - 0.5, 0.2, 0.06, c, 2.62, side * (z + 0.005), "#33475a")); // sky reflection on the top of the pane
    }
  }
  out.push(box(x1 - x0 + 0.1, 0.08, BUS_WIDTH + 0.3, (x0 + x1) / 2, 1.74, 0, pillar)); // sill line
  return out;
}

/** A double door on the curb side: two glass leaves in a chrome frame, with a step light. */
function door(xc: number) {
  const z = BUS_WIDTH / 2 + 0.14;
  return [
    box(1.3, 2.25, 0.04, xc, 1.72, z, CHROME),
    box(0.56, 2.05, 0.05, xc - 0.3, 1.72, z + 0.01, GLASS),
    box(0.56, 2.05, 0.05, xc + 0.3, 1.72, z + 0.01, GLASS),
    box(1.1, 0.05, 0.06, xc, 0.7, z + 0.02, "#fff2b8"),
  ];
}

/** The T on the front: white disc, black ring and T, facing forward. */
function frontT(x: number, y: number) {
  const ring = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 20);
  ring.rotateZ(Math.PI / 2);
  ring.translate(x, y, 0);
  const disc = new THREE.CylinderGeometry(0.17, 0.17, 0.035, 20);
  disc.rotateZ(Math.PI / 2);
  disc.translate(x + 0.005, y, 0);
  return [colored(ring, "#1b1b1b"), colored(disc, "#ffffff"), box(0.04, 0.06, 0.22, x + 0.02, y + 0.07, 0, "#1b1b1b"), box(0.04, 0.2, 0.06, x + 0.02, y - 0.02, 0, "#1b1b1b")];
}

/** MBTA "T" roundel on both sides: white disc, black ring, black T. */
function roundel(x: number, y: number) {
  const out: THREE.BufferGeometry[] = [];
  for (const side of [1, -1]) {
    const z = side * (BUS_WIDTH / 2 + 0.14);
    const ring = new THREE.CylinderGeometry(0.27, 0.27, 0.03, 20);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, y, z);
    const disc = new THREE.CylinderGeometry(0.23, 0.23, 0.035, 20);
    disc.rotateX(Math.PI / 2);
    disc.translate(x, y, z + side * 0.005);
    out.push(colored(ring, "#1b1b1b"), colored(disc, "#ffffff"));
    out.push(box(0.28, 0.07, 0.04, x, y + 0.09, z + side * 0.02, "#1b1b1b"), box(0.07, 0.27, 0.04, x, y - 0.02, z + side * 0.02, "#1b1b1b"));
  }
  return out;
}

/** Paint: MBTA buses are white with a yellow band (thin blue line above it, black line below) and a black front;
 *  Silver Line buses are silver with a lighter band. */
interface Livery {
  body: string;
  band: string;
  above: string;
  below: string;
}
export const MBTA_LIVERY: Livery = { body: "#fbfbf9", band: "#ffd233", above: "#2f86cf", below: "#1d1d1d" };
const SILVER_LIVERY: Livery = { body: SILVER_GRAY, band: "#c9cfd3", above: "#ffffff", below: "#3a3a3a" };

/** The side paint between x0 and x1: black rocker, yellow band with a black line under it and a blue line over it. */
function sidePaint(x0: number, x1: number, l: Livery) {
  const L = x1 - x0, cx = (x0 + x1) / 2, W = BUS_WIDTH;
  return [
    box(L, 0.18, W + 0.27, cx, 0.6, 0, "#2b2b2b"), // rocker
    box(L - 0.1, 0.1, W + 0.29, cx, 0.96, 0, l.below),
    box(L - 0.1, 0.58, W + 0.28, cx, 1.3, 0, l.band),
    box(L - 0.1, 0.07, W + 0.29, cx, 1.63, 0, l.above),
  ];
}

/** The front section: cab, windshield, LED sign, two doors, front + middle axles, roof AC and battery pods. */
function frontGeometry(l: Livery): THREE.BufferGeometry {
  const body = l.body;
  const x0 = JOINT_GAP, x1 = JOINT_GAP + FRONT_LEN, W = BUS_WIDTH, H = BUS_HEIGHT;
  const fx = x1 + 0.12;
  const parts = [
    shell(x0, x1, body, true, false),
    ...sidePaint(x0, x1, l),
    ...windows(x0 + 0.4, x1 - 1.9, body, [[x1 - 2.6, x1], [x0 + 1.5, x0 + 3.1]]),
    ...door(x1 - 1.25), // front door, by the driver
    ...door(x0 + 2.3), // middle door, ahead of the joint
    box(0.05, 0.95, 0.05, x1 - 0.2, 2.27, -(W / 2 + 0.13), GLASS), // driver's side window
    // front face: black mask around the windshield and sign, yellow below it with the T
    box(0.12, 1.95, W - 0.02, fx - 0.03, 2.2, 0, "#151515"),
    box(0.13, 0.52, W - 0.06, fx + 0.01, 1.08, 0, l.band),
    box(0.13, 0.07, W - 0.06, fx + 0.02, 0.8, 0, l.below),
    ...frontT(fx + 0.09, 1.1),
    box(0.14, 1.45, W - 0.18, fx, 1.98, 0, GLASS), // windshield
    box(0.15, 0.08, W - 0.3, fx + 0.01, 1.6, 0, "#7d8b97"), // wiper line
    box(0.16, 0.34, W - 0.4, fx, 2.92, 0, "#141414"), // destination sign housing
    box(0.17, 0.2, W - 0.7, fx + 0.01, 2.92, 0, "#ffb02e"), // amber LED text
    box(0.22, 0.34, W - 0.02, fx, 0.66, 0, "#232323"), // bumper
    box(0.12, 0.18, 0.44, fx + 0.02, 0.98, 0.86, "#fff7d6"), box(0.12, 0.18, 0.44, fx + 0.02, 0.98, -0.86, "#fff7d6"), // headlights
    box(0.12, 0.09, 0.22, fx + 0.03, 0.98, 1.17, "#ff8a1e"), box(0.12, 0.09, 0.22, fx + 0.03, 0.98, -1.17, "#ff8a1e"), // turn signals
    box(0.45, 0.06, W - 0.6, fx + 0.25, 0.95, 0, "#6c7378"), box(0.06, 0.5, W - 0.6, fx + 0.47, 1.18, 0, "#6c7378"), // bike rack
    box(0.08, 0.36, 0.14, x1 - 0.1, 2.55, W / 2 + 0.42, RUBBER), box(0.08, 0.36, 0.14, x1 - 0.1, 2.55, -(W / 2 + 0.42), RUBBER), // mirrors
    box(0.6, 0.05, 0.05, x1 - 0.35, 2.75, W / 2 + 0.3, RUBBER), box(0.6, 0.05, 0.05, x1 - 0.35, 2.75, -(W / 2 + 0.3), RUBBER), // mirror arms
    // roof
    box(FRONT_LEN - 0.9, 0.12, W - 0.25, (x0 + x1) / 2, H + 0.12, 0, "#f7f4ee"),
    box(2.5, 0.42, 1.7, x0 + 2.0, H + 0.4, 0, "#dcd6cc"), // AC unit
    box(2.3, 0.08, 1.4, x0 + 2.0, H + 0.64, 0, "#bfb8ad"),
    box(1.6, 0.32, 0.55, x0 + 4.0, H + 0.34, 0.55, "#e4e0d8"), box(1.6, 0.32, 0.55, x0 + 4.0, H + 0.34, -0.55, "#e4e0d8"), // battery pods
    ...roundel(x1 - 2.6 - 1.25, 1.3), // T logo on the yellow band, behind the front door
    ...wheel(x1 - 2.6, 1), ...wheel(x1 - 2.6, -1), ...wheel(x0 + 1.0, 1), ...wheel(x0 + 1.0, -1),
  ];
  return mergeGeometries(parts)!;
}

/** The rear section: windows, a back door, the drive axle, engine grille, tail lights and the rear AC. */
function rearGeometry(l: Livery): THREE.BufferGeometry {
  const body = l.body;
  const x1 = -JOINT_GAP, x0 = -JOINT_GAP - REAR_LEN, W = BUS_WIDTH, H = BUS_HEIGHT;
  const bx = x0 - 0.12;
  const parts = [
    shell(x0, x1, body, false, true),
    ...sidePaint(x0, x1, l),
    ...windows(x0 + 0.5, x1 - 0.3, body, [[x1 - 2.4, x1 - 0.6]]),
    ...door(x1 - 1.5), // back door, just behind the joint
    // back face
    box(0.12, 0.65, W - 0.6, bx, 2.45, 0, GLASS), // rear window
    box(0.13, 0.7, W - 0.5, bx, 1.15, 0, "#2f3133"), // engine grille
    ...[0.95, 1.1, 1.25, 1.4].map((y) => box(0.14, 0.04, W - 0.6, bx - 0.01, y, 0, "#55595d")),
    box(0.12, 0.42, 0.3, bx, 1.6, 0.98, "#d8352a"), box(0.12, 0.42, 0.3, bx, 1.6, -0.98, "#d8352a"), // tail lights
    box(0.12, 0.12, 0.3, bx - 0.01, 1.32, 0.98, "#ffb02e"), box(0.12, 0.12, 0.3, bx - 0.01, 1.32, -0.98, "#ffb02e"),
    box(0.14, 0.32, W - 0.1, bx + 0.02, 0.86, 0, "#2b2b2b"), // bumper
    box(REAR_LEN - 0.6, 0.12, W - 0.25, (x0 + x1) / 2, H + 0.12, 0, "#f7f4ee"),
    box(2.2, 0.5, 1.8, x0 + 1.6, H + 0.42, 0, "#d3cdc2"), // rear AC / engine cooling
    ...[-0.55, 0, 0.55].map((z) => box(1.8, 0.04, 0.32, x0 + 1.6, H + 0.68, z, "#8e8a84")),
    ...wheel(x0 + 1.9, 1), ...wheel(x0 + 1.9, -1),
  ];
  return mergeGeometries(parts)!;
}

/** The accordion joint: dark rubber bellows with ribs, on a turntable. */
function jointGeometry(): THREE.BufferGeometry {
  const W = BUS_WIDTH, H = BUS_HEIGHT, L = 2 * JOINT_GAP + 0.3;
  const parts = [box(L, H - 0.75, W - 0.12, 0, (H + 0.75) / 2 + 0.12, 0, "#2a2b2d")];
  for (let i = 0; i < 4; i++) parts.push(box(0.07, H - 0.7, W - 0.02, -L / 2 + 0.18 + i * ((L - 0.36) / 3), (H + 0.75) / 2 + 0.12, 0, "#45474a"));
  parts.push(box(L + 0.2, 0.25, W - 0.4, 0, 0.62, 0, "#202020"));
  return mergeGeometries(parts)!;
}

/** For tests: the merged yellow bus sections. */
export const busGeometryForTest = () => mergeGeometries([frontGeometry(MBTA_LIVERY), rearGeometry(MBTA_LIVERY), jointGeometry()]);

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

type Sections = { front: THREE.InstancedMesh; rear: THREE.InstancedMesh };

/** MapLibre custom layer: every bus as a 3D articulated model (front, joint, rear instanced per color), roof numbers as small planes. */
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
  private yellow!: Sections;
  private gray!: Sections;
  private joints!: THREE.InstancedMesh;
  private shadows!: THREE.InstancedMesh;
  private roofGeo = new THREE.PlaneGeometry(4.6, 2.2);
  private roofGeoFlip!: THREE.BufferGeometry;
  private arrowGeo = (() => {
    // a white chevron on the front of the roof, pointing the way the bus drives
    const sh = new THREE.Shape();
    sh.moveTo(1.6, 0); sh.lineTo(-0.6, 1.05); sh.lineTo(-0.15, 0); sh.lineTo(-0.6, -1.05); sh.lineTo(1.6, 0);
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    g.translate(JOINT_GAP + FRONT_LEN - 1.55, BUS_HEIGHT + 0.2, 0);
    return g;
  })();
  private arrows!: THREE.InstancedMesh;
  private roofMats = new Map<string, THREE.MeshBasicMaterial>();
  private roofPool: THREE.Mesh[] = [];
  private tmp = new THREE.Matrix4();
  private rot = new THREE.Matrix4();
  private scl = new THREE.Matrix4();
  private off = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();
  /** Where each bus was drawn last frame, for tapping. */
  drawn: BusNow[] = [];

  constructor(private animator: BusAnimator) {
    this.roofGeo.rotateX(-Math.PI / 2);
    this.roofGeo.translate(ROOF_PLATE_X, BUS_HEIGHT + 0.2, 0);
    // same plate turned around, for buses heading left on screen
    this.roofGeoFlip = this.roofGeo.clone().translate(-ROOF_PLATE_X, 0, 0).rotateY(Math.PI).translate(ROOF_PLATE_X, 0, 0);
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.12 });
    const make = (g: THREE.BufferGeometry, n: number) => {
      const m = new THREE.InstancedMesh(g, mat, n);
      m.count = 0;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.yellow = { front: make(frontGeometry(MBTA_LIVERY), MAX_BUSES), rear: make(rearGeometry(MBTA_LIVERY), MAX_BUSES) };
    this.gray = { front: make(frontGeometry(SILVER_LIVERY), 200), rear: make(rearGeometry(SILVER_LIVERY), 200) };
    this.joints = make(jointGeometry(), MAX_BUSES + 200);
    this.arrows = new THREE.InstancedMesh(this.arrowGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide }), MAX_BUSES);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.scene.add(this.arrows);
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }), 2 * MAX_BUSES);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = -1;
    this.scene.add(this.shadows);
  }

  /** As big as fits in the right-hand half of the street (see busFit), never smaller than real size. */
  scaleFor(zoom: number, lat: number) {
    return busFit(zoom, lat).width / BUS_WIDTH;
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
    const center = this.map.getCenter();
    const scale = this.scaleFor(zoom, center.lat);
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
    const side = busFit(zoom, center.lat).offset;
    const all = this.animator.now(performance.now(), side);
    const onScreen = all.filter((x) => x.lng > b.getWest() - padLng && x.lng < b.getEast() + padLng && x.lat > b.getSouth() - padLat && x.lat < b.getNorth() + padLat);
    this.drawn = onScreen;

    let ny = 0, ng = 0, nj = 0, ns = 0, na = 0;
    const placed: { m: THREE.Matrix4; bus: Bus; d: number; flip: boolean }[] = [];
    const mapBearing = (this.map.getBearing() * Math.PI) / 180;
    this.scl.makeScale(scale, scale, scale);
    const shadow = (base: THREE.Matrix4, cx: number, len: number) => {
      if (ns >= this.shadows.instanceMatrix.count) return;
      const m = base.clone().multiply(this.off.makeTranslation(cx, 0.03, 0)).multiply(new THREE.Matrix4().makeScale(len * 1.08, 1, BUS_WIDTH * 1.5));
      this.shadows.setMatrixAt(ns++, m);
    };
    for (const x of onScreen) {
      // Bend at the joint: each section follows the street from its own axle (straight when off any street shape).
      let lng = x.lng, lat = x.lat, front = x.heading, rear = x.heading;
      if (x.shape && x.along != null) {
        // in the right-hand lane of the street it is on (its drawn width), fully between centerline and curb
        const busW = BUS_WIDTH * scale;
        const pose = bendPose(x.shape, x.along, (roadW) => laneOffset(roadW, busW), FRONT_AXLE * scale, REAR_AXLE * scale);
        [lng, lat] = pose.p;
        front = pose.front;
        rear = pose.rear;
      }
      modelMatrix(this.tmp, lng, lat, globe);
      this.tmp.premultiply(this.originInv);
      const mf = this.tmp.clone().multiply(this.rot.makeRotationY(front)).multiply(this.scl);
      const mr = this.tmp.clone().multiply(this.rot.makeRotationY(rear)).multiply(this.scl);
      const mid = Math.atan2(Math.sin(front) + Math.sin(rear), Math.cos(front) + Math.cos(rear));
      const mj = this.tmp.clone().multiply(this.rot.makeRotationY(mid)).multiply(this.scl);
      const set = x.bus.silver ? this.gray : this.yellow;
      const i = x.bus.silver ? ng++ : ny++;
      if (i < set.front.instanceMatrix.count) {
        set.front.setMatrixAt(i, mf);
        set.rear.setMatrixAt(i, mr);
      }
      if (nj < this.joints.instanceMatrix.count) this.joints.setMatrixAt(nj++, mj);
      if (na < MAX_BUSES) this.arrows.setMatrixAt(na++, mf);
      shadow(mf, JOINT_GAP + FRONT_LEN / 2, FRONT_LEN);
      shadow(mr, -JOINT_GAP - REAR_LEN / 2, REAR_LEN);
      // roof number reads left to right on screen whichever way the bus drives
      const flip = Math.cos(front + mapBearing) < 0;
      placed.push({ m: mf, bus: x.bus, d: (x.lng - center.lng) ** 2 + (x.lat - center.lat) ** 2, flip });
    }
    this.yellow.front.count = this.yellow.rear.count = Math.min(ny, this.yellow.front.instanceMatrix.count);
    this.gray.front.count = this.gray.rear.count = Math.min(ng, this.gray.front.instanceMatrix.count);
    this.joints.count = nj;
    this.shadows.count = ns;
    this.arrows.count = na;
    for (const mesh of [this.yellow.front, this.yellow.rear, this.gray.front, this.gray.rear, this.joints, this.shadows, this.arrows]) mesh.instanceMatrix.needsUpdate = true;

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
      mesh.geometry = p.flip ? this.roofGeoFlip : this.roofGeo;
      mesh.matrix.copy(p.m);
    });

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}

// ---------- the flat top-down bus (zoomed out) ----------

/** Image id for the flat bus seen from above: yellow or Silver Line gray. Its front points up (north); the layer
 *  rotates it to the way the bus drives, so you can see its direction at a glance. */
export const topBusId = (silver: boolean) => (silver ? "bus-top-s" : "bus-top-y");

/** Draws the top-down bus for map.addImage, at 2x for sharp edges. */
export function topBusImage(id: string): { width: number; height: number; data: Uint8ClampedArray } | null {
  if (id !== "bus-top-y" && id !== "bus-top-s") return null;
  const px = 2, W = 30 * px, H = 64 * px;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.scale(px, px);
  // soft shadow
  g.fillStyle = "rgba(0,0,0,.22)";
  g.beginPath();
  g.roundRect(5, 10, 22, 52, 7);
  g.fill();
  // body
  g.fillStyle = id === "bus-top-s" ? SILVER_GRAY : BUS_YELLOW; // the yellow band shows along the sides
  g.strokeStyle = "#2B1A1F";
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(4, 8, 22, 52, 7);
  g.fill();
  g.stroke();
  // white roof (the whole top of a real MBTA bus is white)
  g.fillStyle = "#f7f4ee";
  g.beginPath();
  g.roundRect(7, 18, 16, 40, 3);
  g.fill();
  // the accordion joint, about two thirds of the way back
  g.fillStyle = "#2a2b2d";
  g.fillRect(4, 41, 22, 3);
  // windshield at the front
  g.fillStyle = "#24384a";
  g.beginPath();
  g.roundRect(7, 11, 16, 7, 3);
  g.fill();
  // direction arrow ahead of the bus
  g.fillStyle = "#2B1A1F";
  g.beginPath();
  g.moveTo(15, 0);
  g.lineTo(23, 7);
  g.lineTo(7, 7);
  g.closePath();
  g.fill();
  return { width: W, height: H, data: g.getImageData(0, 0, W, H).data };
}

/** Compass bearing (degrees, clockwise from north) for a heading in radians (0 = east, counter-clockwise). */
export const bearingOf = (heading: number) => ((90 - (heading * 180) / Math.PI) % 360 + 360) % 360;

// ---------- sample buses (no MBTA key, or the feed is down) ----------

export interface SampleRoute {
  route: string;
  number: string;
  silver?: boolean;
  ends: [string, string];
  /** How many sample buses run on it (default 4). */
  buses?: number;
  path: [number, number][];
}

/** Every MBTA bus route on its real street shape (scripts/data-build/bus_samples.py); the rough ones below if that file can't load. */
export async function loadSampleRoutes(): Promise<SampleRoute[]> {
  try {
    const r = await fetch("/data/bus-samples.json");
    const j = (await r.json()) as { routes: SampleRoute[] };
    if (j.routes?.length) return j.routes;
  } catch {}
  return SAMPLE_ROUTES;
}

const SAMPLE_ROUTES: SampleRoute[] = [
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
  constructor(private routes: SampleRoute[] = SAMPLE_ROUTES) {}
  /** Each sample route's path, so sample buses stay on it like real ones on their shapes. */
  shapes(): [string, [number, number][]][] {
    return this.routes.map((r) => [r.route, r.path]);
  }
  step(seconds: number): Bus[] {
    this.t += seconds;
    const out: Bus[] = [];
    this.routes.forEach((r, ri) => {
      const segs: { a: [number, number]; b: [number, number]; len: number; start: number }[] = [];
      let total = 0;
      for (let k = 1; k < r.path.length; k++) {
        const len = meters(r.path[k - 1], r.path[k]);
        segs.push({ a: r.path[k - 1], b: r.path[k], len, start: total });
        total += len;
      }
      const count = r.buses ?? 4;
      for (let n = 0; n < count; n++) {
        const back = n % 2 === 1;
        const d0 = ((this.t * 7 + (n * total) / count + ri * 911) % total + total) % total; // ~7 m/s
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
