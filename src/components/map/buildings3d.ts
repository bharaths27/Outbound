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
import { makeLandmarks } from "./landmarks";
import type { Weather } from "./weather";
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

export interface RegionManifest {
  source: string;
  tiles: { name: string; center: [number, number]; file: string; count: number }[];
}
/** Greater Boston outside BPDA + Cambridge (the whole T area): Overture Maps footprints + heights, see scripts/data-build. */
export const REGION_BOUNDS = { west: -71.3, south: 42.195, east: -70.955, north: 42.475 };
export const inRegion = (lng: number, lat: number) =>
  lng > REGION_BOUNDS.west && lng < REGION_BOUNDS.east && lat > REGION_BOUNDS.south && lat < REGION_BOUNDS.north;
export async function fetchRegionManifest(): Promise<RegionManifest | null> {
  try {
    const r = await fetch(dataUrl("region/manifest.json"));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** A region tile -> footprints (lng/lat) for buildCityMesh. Format: see scripts/data-build/overture_buildings.py */
async function loadRegionTile(url: string, center: [number, number]): Promise<Footprint[]> {
  const j = await (await fetch(url)).json();
  let buf = Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0)).buffer;
  buf = await gunzip(buf);
  const v = new DataView(buf);
  const n = v.getUint32(0, true);
  const [lng0, lat0] = center;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const out: Footprint[] = [];
  let o = 4;
  for (let i = 0; i < n; i++) {
    const np = v.getUint16(o, true), h = v.getUint16(o + 2, true) / 10;
    o += 4;
    const ring: [number, number][] = [];
    for (let k = 0; k < np; k++, o += 4) ring.push([lng0 + v.getInt16(o, true) / 10 / kx, lat0 - v.getInt16(o + 2, true) / 10 / 110_540]);
    ring.push(ring[0]);
    out.push({ rings: [ring], h });
  }
  return out;
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

type Job = { at: [number, number]; r: number; minZoom: number; run: () => Promise<void>; unloadable?: boolean };

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
  private parts: { obj: THREE.Object3D; center: [number, number]; unit: number; job?: Job }[] = [];
  private trees: THREE.Object3D | null = null;
  private materials = new Map<number, THREE.Material>();
  private tmp = new THREE.Matrix4();
  private scale = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();

  constructor(
    private manifest: BpdaManifest | null,
    private region: RegionManifest | null = null,
  ) {}

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
  /** called with 0 (day) .. 1 (night) whenever the light changes, to darken the basemap too */
  onNight: (night: number) => void = () => {};
  private weather: Weather | null = null;
  /** Match the light to the weather outside: clouds flatten and grey the sun, rain and snow darken it a bit. */
  setWeather(w: Weather | null) {
    this.weather = w;
    this.updateSun();
  }
  /** Light the city: a fixed bright afternoon sun, softened by the current weather. */
  updateSun(date = new Date()) {
    // always a bright early afternoon, whatever the time; the weather still changes the light
    date = new Date(date);
    date.setUTCMonth(5, 21); // a June sun, high and white
    date.setUTCHours(17, 30, 0, 0); // 1:30 PM in Boston
    const { dir, night, golden } = sunLight(date);
    this.sun.position.set(dir[0] * 100, dir[1] * 100, dir[2] * 100);
    const day = new THREE.Color(0xfff0d8), gold = new THREE.Color(0xffb070), moon = new THREE.Color(0xa8b8e8);
    // keep the pastel colors readable: only a hint of golden hour, and a bright blue "game night" instead of black
    this.sun.color.copy(day).lerp(gold, golden * 0.35).lerp(moon, night);
    this.sun.intensity = 1.75 * (1 - night) + 0.9 * night;
    this.sky.color.set(0xffffff).lerp(new THREE.Color(0x9aa6d4), night);
    this.sky.groundColor.set(0xb8b0c0).lerp(new THREE.Color(0x6a6488), night);
    this.sky.intensity = 1.3 * (1 - night) + 1.7 * night;
    // weather: overcast = soft grey light from the whole sky instead of a warm sun
    const w = this.weather;
    if (w) {
      const wet = w.kind === "rain" || w.kind === "snow" || w.kind === "storm" || w.kind === "fog" ? 1 : 0;
      const overcast = Math.max(w.cloud * 0.85, wet * 0.9);
      this.sun.color.lerp(new THREE.Color(0xdfe3ea), overcast * 0.7);
      this.sun.intensity *= 1 - overcast * 0.6;
      this.sky.color.lerp(new THREE.Color(w.kind === "snow" ? 0xf2f4f8 : 0xd6dbe4), overcast * 0.6 * (1 - night));
      this.sky.intensity *= 1 + overcast * 0.12 - (w.kind === "storm" ? 0.25 : 0);
    }
    FACADE_NIGHT.value = night;
    this.onNight(night);
    this.map?.triggerRepaint();
  }

  private material(unit: number) {
    let m = this.materials.get(unit);
    if (!m) this.materials.set(unit, (m = makeFacadeMaterial(unit)));
    return m;
  }

  private add(obj: THREE.Object3D, center: [number, number], unit: number, job?: Job) {
    obj.matrixAutoUpdate = false;
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.parts.push({ obj, center, unit, job });
    this.map.triggerRepaint();
  }

  private jobs: Job[] | null = null;
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
        await this.buildChunked(feats, CAMBRIDGE_CENTER, mat);
      },
    });
    // the rest of the T area, as illustrated houses and blocks; far-away tiles are dropped again to save memory
    const regionMat = makeFacadeMaterial(1, 5.3);
    regionMat.side = THREE.DoubleSide;
    for (const t of this.region?.tiles ?? []) {
      const job: Job = {
        at: t.center,
        r: 0.011,
        minZoom: 13.2,
        unloadable: true,
        run: async () => {
          const feats = await loadRegionTile(dataUrl(`region/${t.file}`), t.center);
          await this.buildChunked(feats, t.center, regionMat, job);
        },
      };
      jobs.push(job);
    }
    // one job per landmark, so each loads when the view reaches it
    for (const l of makeLandmarks()) jobs.push({ at: l.center, r: 0.01, minZoom: this.minZoom, run: async () => this.add(l.obj, l.center, 1) });
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
  /** Build footprints into meshes a few hundred at a time, yielding between, so dragging the map stays smooth. */
  private async buildChunked(feats: Footprint[], center: [number, number], mat: THREE.Material, job?: Job) {
    const N = 300;
    for (let i = 0; i < feats.length; i += N) {
      // wait while the map is being dragged or animated
      while (this.map.isMoving()) await new Promise((r) => setTimeout(r, 120));
      if (job && this.jobs?.includes(job)) return; // dropped (far away) while building
      this.add(new THREE.Mesh(buildCityMesh(feats.slice(i, i + N), center), mat), center, 1, job);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  private loadNear(zoom: number) {
    this.jobs ??= this.makeJobs();
    if (!this.jobs.length || this.running >= 2 || this.map.isMoving()) return;
    const c = this.map.getCenter();
    const reach = Math.min(0.05, 0.012 * Math.pow(2, 16 - zoom));
    const dist = (j: { at: [number, number]; r: number }) => Math.hypot(j.at[0] - c.lng, (j.at[1] - c.lat) * 1.35) - j.r;
    const ready = this.jobs.filter((j) => zoom >= j.minZoom && dist(j) < reach).sort((a, b) => dist(a) - dist(b));
    for (const j of ready.slice(0, 2 - this.running)) {
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

  /** Drop region tiles that are far from the view (they load again when you come back). */
  private unloadFar(lng: number, lat: number, zoom: number) {
    // keep well past the load radius (load reach + tile size + margin) so tiles at the edge don't reload over and over
    const keep = Math.min(0.05, 0.012 * Math.pow(2, 16 - zoom)) + 0.011 + 0.03;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (!p.job?.unloadable) continue;
      if (Math.hypot(p.center[0] - lng, (p.center[1] - lat) * 1.35) < keep && zoom >= p.job.minZoom - 1) continue;
      this.scene.remove(p.obj);
      (p.obj as THREE.Mesh).geometry?.dispose();
      this.parts.splice(i, 1);
      if (this.jobs && !this.jobs.includes(p.job)) this.jobs.push(p.job);
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
    this.unloadFar(center.lng, center.lat, zoom);
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
