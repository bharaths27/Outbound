// Game-style 3D city, drawn with three.js in one MapLibre custom layer:
//   - central Boston: the city's own building models (Boston Planning Department / BPDA 3D Smart Model:
//     real roof shapes, towers, setbacks), pre-converted by scripts/data-build/bpda_tiles.py into public/data/bpda/
//   - Cambridge: real footprints + heights (City of Cambridge GIS) turned into houses with gable roofs and
//     chimneys, or flat-roofed blocks with rooftop units (procBuildings.ts)
//   - trees found in the 2023 aerial photos and scattered in Cambridge parks (scripts/data-build/trees.py)
// Windows, trim, shop fronts and roof detail come from the facade shader (facade.ts).
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { modelMatrix } from "./trains3d";
import { brightenPalette, makeFacadeMaterial, FACADE_NIGHT } from "./facade";
import { sunLight } from "./sun";
import { buildCityMesh, makeTreeMesh, TREE_TIME, type Footprint } from "./procBuildings";

export interface BpdaTile {
  name: string;
  center: [number, number];
  file: string;
  photo: string;
  photoCorners: [number, number][];
}
export interface BpdaManifest {
  source: string;
  tiles: BpdaTile[];
}

/** Area the BPDA tiles cover (lng/lat bbox), used to switch between these buildings and OpenStreetMap's. */
export const BPDA_BOUNDS = { west: -71.112, south: 42.3228, east: -71.019, north: 42.364 };
export const inBpda = (lng: number, lat: number) =>
  lng > BPDA_BOUNDS.west && lng < BPDA_BOUNDS.east && lat > BPDA_BOUNDS.south && lat < BPDA_BOUNDS.north;

const dataUrl = (f: string) => new URL(`data/${f}`, document.baseURI).href;

export async function fetchBpdaManifest(): Promise<BpdaManifest | null> {
  try {
    const r = await fetch(dataUrl("bpda/manifest.json"));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const gunzip = async (buf: ArrayBuffer) =>
  new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();

async function loadTile(url: string) {
  const res = await fetch(url);
  let buf: ArrayBuffer;
  if (url.endsWith(".json")) {
    // same bytes as the .bin.gz, wrapped as base64 in JSON (for hosts that only serve text/data types)
    const j = await res.json();
    buf = Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0)).buffer;
  } else buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) buf = await gunzip(buf); // not already decoded by the server
  const hl = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const a = header.arrays;
  const pos = new Int16Array(buf, base + a.position.start, a.position.length / 2);
  const col = new Uint8Array(buf, base + a.color.start, a.color.length);
  brightenPalette(col);
  const idx =
    header.indexType === "uint16"
      ? new Uint16Array(buf, base + a.index.start, a.index.length / 2)
      : new Uint32Array(buf, base + a.index.start, a.index.length / 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3, true));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geometry: g, unit: header.unit as number, center: header.center as [number, number] };
}

const CAMBRIDGE_CENTER: [number, number] = [-71.11, 42.375];
const TREES_CENTER: [number, number] = [-71.08, 42.36];
const TREES_MIN_ZOOM = 14;

export class CityBuildingsLayer implements CustomLayerInterface {
  id = "city-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;
  /** true while Google's photorealistic 3D is drawing the city instead */
  hidden = false;
  minZoom = 12.5;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private parts: { obj: THREE.Object3D; center: [number, number]; unit: number }[] = [];
  private trees: THREE.Object3D | null = null;
  private materials = new Map<number, THREE.Material>();
  private tmp = new THREE.Matrix4();
  private scale = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();

  constructor(private manifest: BpdaManifest | null) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // warm, bright "late afternoon" light like a game map
    this.scene.add(this.sky, this.sun);
    this.updateSun();
    // follow the real time of day
    this.sunTimer = window.setInterval(() => this.updateSun(), 60_000);
  }

  onRemove() {
    clearInterval(this.sunTimer);
  }

  private sky = new THREE.HemisphereLight(0xfff6e8, 0x7a7468, 1.7);
  private sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  private sunTimer = 0;
  /** Light the city like the real sun over Boston now (or at `date`): warm at sunset, dark with lit windows at night. */
  updateSun(date = new Date()) {
    const { dir, night, golden } = sunLight(date);
    this.sun.position.set(dir[0] * 100, dir[1] * 100, dir[2] * 100);
    const day = new THREE.Color(0xfff0d8), gold = new THREE.Color(0xffb070), moon = new THREE.Color(0x8fa6d8);
    // keep the pastel colors readable: only a hint of golden hour, soft bright sky light
    this.sun.color.copy(day).lerp(gold, golden * 0.35).lerp(moon, night);
    this.sun.intensity = 1.9 * (1 - night) + 0.5 * night;
    this.sky.color.set(0xffffff).lerp(new THREE.Color(0x4a5a8a), night);
    this.sky.groundColor.set(0xb8b0c0);
    this.sky.intensity = 2.3 * (1 - night) + 0.6 * night;
    FACADE_NIGHT.value = night;
    this.map?.triggerRepaint();
  }

  private material(unit: number) {
    let m = this.materials.get(unit);
    if (!m) this.materials.set(unit, (m = makeFacadeMaterial(unit)));
    return m;
  }

  private add(obj: THREE.Object3D, center: [number, number], unit: number) {
    obj.matrixAutoUpdate = false;
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.parts.push({ obj, center, unit });
    this.map.triggerRepaint();
  }

  private jobs: { at: [number, number]; r: number; minZoom: number; run: () => Promise<void> }[] | null = null;
  private running = 0;

  private makeJobs() {
    const jobs: NonNullable<typeof this.jobs> = [];
    for (const t of this.manifest?.tiles ?? [])
      jobs.push({
        at: t.center,
        r: 0.013, // each tile is ~1.5 km square
        minZoom: this.minZoom,
        run: async () => {
          const { geometry, unit, center } = await loadTile(dataUrl(`bpda/${t.file}`));
          this.add(new THREE.Mesh(geometry, this.material(unit)), center, unit);
        },
      });
    jobs.push({
      at: CAMBRIDGE_CENTER,
      r: 0.035,
      minZoom: this.minZoom,
      run: async () => {
        const fc = await (await fetch(dataUrl("cambridge/buildings.geojson"))).json();
        const feats: Footprint[] = [];
        for (const f of fc.features) {
          const h = (f.properties?.h ?? 20) * 0.3048;
          const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
          for (const rings of polys) feats.push({ rings, h });
        }
        const mat = makeFacadeMaterial(1, 3.7);
        mat.side = THREE.DoubleSide; // generated walls: don't depend on winding
        this.add(new THREE.Mesh(buildCityMesh(feats, CAMBRIDGE_CENTER), mat), CAMBRIDGE_CENTER, 1);
      },
    });
    jobs.push({
      at: TREES_CENTER,
      r: 0.06,
      minZoom: TREES_MIN_ZOOM,
      run: async () => {
        const pts: [number, number, number][] = await (await fetch(dataUrl("trees.json"))).json();
        const [lng0, lat0] = TREES_CENTER;
        const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
        const mesh = makeTreeMesh(pts.map(([lng, lat, s]) => ({ x: (lng - lng0) * kx, z: -(lat - lat0) * 110_540, s })));
        this.trees = mesh;
        this.add(mesh, TREES_CENTER, 1);
      },
    });
    return jobs;
  }

  /** True once everything near the current view has loaded (used to hold the loading screen). */
  settled() {
    if (!this.map) return false;
    if (!this.jobs) return false;
    const zoom = this.map.getZoom();
    const c = this.map.getCenter();
    const reach = Math.min(0.05, 0.012 * Math.pow(2, 16 - zoom));
    const waiting = this.jobs.some((j) => zoom >= j.minZoom && Math.hypot(j.at[0] - c.lng, (j.at[1] - c.lat) * 1.35) - j.r < reach);
    return !waiting && this.running === 0;
  }

  /** Load only what is near the view (nearest first, 3 at a time); more loads as you move around. */
  private loadNear(zoom: number) {
    this.jobs ??= this.makeJobs();
    if (!this.jobs.length || this.running >= 3) return;
    const c = this.map.getCenter();
    const reach = Math.min(0.05, 0.012 * Math.pow(2, 16 - zoom));
    const dist = (j: { at: [number, number]; r: number }) => Math.hypot(j.at[0] - c.lng, (j.at[1] - c.lat) * 1.35) - j.r;
    const ready = this.jobs.filter((j) => zoom >= j.minZoom && dist(j) < reach).sort((a, b) => dist(a) - dist(b));
    for (const j of ready.slice(0, 3 - this.running)) {
      this.jobs.splice(this.jobs.indexOf(j), 1);
      this.running++;
      j.run()
        .catch((e) => console.warn("[buildings] part failed", e))
        .finally(() => {
          this.running--;
          this.map.triggerRepaint();
        });
    }
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    if (!this.visible || this.hidden || zoom < this.minZoom) return;
    this.loadNear(zoom);
    if (!this.parts.length) return;
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const center = this.map.getCenter();
    const origin = modelMatrix(new THREE.Matrix4(), center.lng, center.lat, globe);
    this.originInv.copy(origin).invert();
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.camera.projectionMatrix = main.multiply(origin);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    if (this.trees) this.trees.visible = zoom >= TREES_MIN_ZOOM;
    TREE_TIME.value = performance.now() / 1000;
    for (const p of this.parts) {
      modelMatrix(this.tmp, p.center[0], p.center[1], globe).premultiply(this.originInv);
      p.obj.matrix.copy(this.tmp).multiply(this.scale.makeScale(p.unit, p.unit, p.unit));
      p.obj.matrixWorld.copy(p.obj.matrix);
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (this.trees?.visible) this.map.triggerRepaint(); // keep the wind moving
  }
}
