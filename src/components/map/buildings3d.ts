// Real 3D buildings of central Boston from the Boston Planning Department (BPDA) 3D Smart Model:
// the city's own building models (roof shapes, towers, setbacks), not boxes extruded from footprints.
// Tiles are pre-converted by scripts/data-build/bpda_tiles.py into public/data/bpda/.
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { modelMatrix } from "./trains3d";

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

export async function fetchBpdaManifest(): Promise<BpdaManifest | null> {
  try {
    const r = await fetch(new URL("data/bpda/manifest.json", document.baseURI));
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function loadTile(url: string) {
  const res = await fetch(url);
  let buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] === 0x1f && head[1] === 0x8b) {
    // not already decoded by the server: gunzip in the browser
    buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }
  const hl = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl;
  const a = header.arrays;
  const pos = new Int16Array(buf, base + a.position.start, a.position.length / 2);
  const col = new Uint8Array(buf, base + a.color.start, a.color.length);
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

export class CityBuildingsLayer implements CustomLayerInterface {
  id = "bpda-buildings";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;
  minZoom = 12.5;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private tiles: { mesh: THREE.Mesh; center: [number, number] }[] = [];
  private loading = false;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private tmp = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();

  constructor(private manifest: BpdaManifest) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9488, 2.2));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(-50, 90, 60);
    this.scene.add(sun);
  }

  private async load() {
    this.loading = true;
    // nearest tiles first so the view fills in where the user is looking
    const c = this.map.getCenter();
    const order = [...this.manifest.tiles].sort(
      (a, b) => Math.hypot(a.center[0] - c.lng, a.center[1] - c.lat) - Math.hypot(b.center[0] - c.lng, b.center[1] - c.lat),
    );
    for (const t of order) {
      try {
        const { geometry, unit, center } = await loadTile(new URL(`data/bpda/${t.file}`, document.baseURI).href);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        mesh.userData.unit = unit;
        this.scene.add(mesh);
        this.tiles.push({ mesh, center });
        this.map.triggerRepaint();
      } catch (e) {
        console.warn("[buildings] tile failed", t.name, e);
      }
    }
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    if (!this.visible || zoom < this.minZoom) return;
    if (!this.loading) void this.load();
    if (!this.tiles.length) return;
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const center = this.map.getCenter();
    const origin = modelMatrix(new THREE.Matrix4(), center.lng, center.lat, globe);
    this.originInv.copy(origin).invert();
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.camera.projectionMatrix = main.multiply(origin);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    for (const t of this.tiles) {
      const u = t.mesh.userData.unit as number;
      modelMatrix(this.tmp, t.center[0], t.center[1], globe).premultiply(this.originInv);
      t.mesh.matrix.copy(this.tmp).multiply(new THREE.Matrix4().makeScale(u, u, u));
      t.mesh.matrixWorld.copy(t.mesh.matrix);
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
