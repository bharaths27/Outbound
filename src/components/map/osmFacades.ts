// Close-up 3D buildings with real facades, built from the basemap's own OpenStreetMap buildings
// (OpenFreeMap "building" layer: real footprints, heights, and the wall color OSM mappers gave them).
// Each building gets windows, floor bands, shop fronts and doors on the ground floor, and roof detail
// from the facade shader (facade.ts). Small houses get gable roofs (procBuildings.ts).
// Farther out the basemap's plain extruded buildings show instead (style.ts, FACADE_MIN_ZOOM).
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { modelMatrix } from "./trains3d";
import { makeFacadeMaterial, FACADE_NIGHT } from "./facade";
import { sunLight } from "./sun";
import type { Weather } from "./weather";
import { buildCityMesh, makeTreeMesh, TREE_TIME, HOUSE_COLORS, type Footprint } from "./procBuildings";
import type { ExpressionSpecification } from "maplibre-gl";

/** From this zoom the buildings are drawn with facades; below it, the basemap's plain boxes. */
export const FACADE_MIN_ZOOM = 15;
const MAX_BUILDINGS = 7000;
/** Real trees (public/data/trees.json: canopy found in aerial photos, Cambridge park trees) show from this zoom. */
export const TREES_MIN_ZOOM = 14;
const TREES_CENTER: [number, number] = [-71.09, 42.363];

// Boston's real building stock: red brick, brownstone, limestone, granite, painted clapboard; towers are glass.
const BRICK = [[172, 78, 54], [150, 66, 48], [128, 80, 60], [196, 120, 96]];
const STONE = [[214, 170, 118], [232, 220, 196], [150, 150, 146], [222, 172, 92], [243, 238, 228]];
const GLASS = [[72, 130, 182], [48, 94, 146], [96, 140, 184]];

function hash(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function hexRgb(s: unknown): number[] | undefined {
  if (typeof s !== "string") return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return undefined;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Wall color: the OSM building color when mapped, otherwise a Boston material picked by height (stable per building). */
export function wallColor(colour: unknown, height: number, seed: number): number[] | undefined {
  const own = hexRgb(colour);
  if (own) return own;
  const r = hash(seed);
  if (height > 45) return r > 0.3 ? GLASS[Math.floor(hash(seed + 1) * GLASS.length)] : STONE[Math.floor(hash(seed + 2) * STONE.length)];
  if (height <= 15) return undefined; // houses: painted clapboard / brick colors from procBuildings
  return r > 0.45 ? BRICK[Math.floor(hash(seed + 3) * BRICK.length)] : STONE[Math.floor(hash(seed + 4) * STONE.length)];
}

const rgbStr = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const pick = (list: number[][], h: ExpressionSpecification): ExpressionSpecification =>
  ["at", ["min", list.length - 1, ["floor", ["*", h, list.length]]], ["literal", list.map(rgbStr)]];

/** wallColor as a MapLibre expression, so the zoomed-out plain buildings get the same colors as the facades up close. */
export function wallColorExpression(): ExpressionSpecification {
  const seed: ExpressionSpecification = ["%", ["to-number", ["id"], 0], 100_003];
  // hash(n) above, and procBuildings' house hash (no offset)
  const h1 = (k: number): ExpressionSpecification => {
    const x: ExpressionSpecification = ["*", ["sin", ["+", ["*", ["+", seed, k], 12.9898], 78.233]], 43758.5453];
    return ["-", x, ["floor", x]];
  };
  const h2 = (k: number): ExpressionSpecification => {
    const x: ExpressionSpecification = ["*", ["sin", ["*", ["+", seed, k], 12.9898]], 43758.5453];
    return ["-", x, ["floor", x]];
  };
  const height: ExpressionSpecification = ["coalesce", ["get", "render_height"], 6];
  const own: ExpressionSpecification = ["case", ["==", ["typeof", ["get", "colour"]], "string"], ["get", "colour"], ""];
  const made: ExpressionSpecification = [
    "case",
    [">", height, 45], ["case", [">", h1(0), 0.3], pick(GLASS, h1(1)), pick(STONE, h1(2))],
    ["<=", height, 15], pick(HOUSE_COLORS, h2(1)),
    ["case", [">", h1(0), 0.45], pick(BRICK, h1(3)), pick(STONE, h1(4))],
  ];
  return ["to-color", own, made] as ExpressionSpecification;
}

/** Basemap building features -> footprints for buildCityMesh (deduplicated, nearest to `center` first). */
export function footprintsOf(feats: Pick<MapGeoJSONFeature, "id" | "properties" | "geometry">[], center: [number, number], limit = MAX_BUILDINGS): Footprint[] {
  const seen = new Set<string>();
  const out: { f: Footprint; d: number }[] = [];
  const k = Math.cos((center[1] * Math.PI) / 180);
  for (const f of feats) {
    const p = f.properties ?? {};
    if (p.hide_3d === true || p.hide_3d === "true") continue;
    const h = Number(p.render_height ?? 0) || 6;
    const b = Number(p.render_min_height ?? 0) || 0;
    if (h - b < 1) continue;
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const rings of polys as [number, number][][][]) {
      const outer = rings[0];
      if (!outer || outer.length < 4) continue;
      let cx = 0, cy = 0;
      for (const [x, y] of outer) {
        cx += x;
        cy += y;
      }
      cx /= outer.length;
      cy /= outer.length;
      // the same building comes back once per tile it touches
      const key = `${f.id ?? ""}|${cx.toFixed(5)}|${cy.toFixed(5)}|${h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // stable per building, so a rebuild keeps every color and window pattern
      const seed = typeof f.id === "number" ? f.id % 100_003 : Math.round(cx * 1e5) * 31 + Math.round(cy * 1e5);
      out.push({ f: { rings, h, b: b || undefined, rgb: wallColor(p.colour, h, seed), seed }, d: ((cx - center[0]) * k) ** 2 + (cy - center[1]) ** 2 });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, limit).map((x) => x.f);
}

/** MapLibre custom layer: the nearby OSM buildings as one three.js mesh with the facade shader. */
export class OsmFacadesLayer implements CustomLayerInterface {
  id = "osm-facades";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;
  /** true while Google's photorealistic 3D is drawing the city instead */
  hidden = false;
  minZoom = FACADE_MIN_ZOOM;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private mesh: THREE.Mesh | null = null;
  private meshCenter: [number, number] = [0, 0];
  private material = (() => {
    const m = makeFacadeMaterial(1, 4.1);
    m.side = THREE.DoubleSide; // clipped tile pieces don't have a reliable winding
    return m;
  })();
  private tmp = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();
  private builtAt: { lng: number; lat: number; zoom: number } | null = null;
  private building = false;
  private again = false;

  constructor(private source = "openmaptiles", private sourceLayer = "building") {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(this.sky, this.sun);
    this.updateSun();
    // (the map never goes "idle" while trains and buses animate, so: after moving, and as tiles arrive)
    map.on("moveend", this.soon);
    map.on("sourcedata", this.onData);
    this.soon();
    void this.loadTrees();
  }

  private trees: THREE.InstancedMesh | null = null;
  private async loadTrees() {
    try {
      const r = await fetch(new URL("/data/trees.json", document.baseURI).href);
      if (!r.ok) return;
      const pts: [number, number, number][] = await r.json();
      const [lng0, lat0] = TREES_CENTER;
      const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
      const mesh = makeTreeMesh(pts.map(([lng, lat, s]) => ({ x: (lng - lng0) * kx, z: -(lat - lat0) * 110_540, s })));
      mesh.matrixAutoUpdate = false;
      this.trees = mesh;
      this.scene.add(mesh);
      this.map.triggerRepaint();
    } catch (e) {
      console.warn("[trees]", e);
    }
  }

  onRemove() {
    this.map.off("moveend", this.soon);
    this.map.off("sourcedata", this.onData);
    clearTimeout(this.timer);
    this.mesh?.geometry.dispose();
  }

  private sky = new THREE.HemisphereLight(0xffffff, 0xb8b0c0, 1.3);
  private sun = new THREE.DirectionalLight(0xfff0d8, 1.75);
  /** called with 0 (day) .. 1 (night) whenever the light changes, to darken the basemap too */
  onNight: (night: number) => void = () => {};
  private weather: Weather | null = null;
  setWeather(w: Weather | null) {
    this.weather = w;
    this.updateSun();
  }
  /** A fixed bright early-afternoon sun, softened by the current weather (same light as the trains and buses). */
  updateSun(date = new Date()) {
    date = new Date(date);
    date.setUTCMonth(5, 21);
    date.setUTCHours(17, 30, 0, 0);
    const { dir, night } = sunLight(date);
    this.sun.position.set(dir[0] * 100, dir[1] * 100, dir[2] * 100);
    this.sun.color.set(0xfff0d8);
    this.sun.intensity = 1.75;
    this.sky.color.set(0xffffff);
    this.sky.groundColor.set(0xb8b0c0);
    this.sky.intensity = 1.3;
    const w = this.weather;
    if (w) {
      const wet = w.kind === "rain" || w.kind === "snow" || w.kind === "storm" || w.kind === "fog" ? 1 : 0;
      const overcast = Math.max(w.cloud * 0.85, wet * 0.9);
      this.sun.color.lerp(new THREE.Color(0xdfe3ea), overcast * 0.7);
      this.sun.intensity *= 1 - overcast * 0.6;
      this.sky.color.lerp(new THREE.Color(w.kind === "snow" ? 0xf2f4f8 : 0xd6dbe4), overcast * 0.6);
      this.sky.intensity *= 1 + overcast * 0.12 - (w.kind === "storm" ? 0.25 : 0);
    }
    FACADE_NIGHT.value = night;
    this.onNight(night);
    this.map?.triggerRepaint();
  }

  /** Nothing to wait for: the basemap's tiles are the data. */
  settled() {
    return true;
  }

  private timer: ReturnType<typeof setTimeout> | undefined;
  private soon = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onIdle, 350);
  };
  private onData = (e: { sourceId?: string; tile?: unknown }) => {
    if (e.sourceId !== this.source || !e.tile) return;
    this.builtAt = null; // new buildings arrived: rebuild even if the view hasn't moved much
    this.soon();
  };

  private onIdle = () => {
    const zoom = this.map.getZoom();
    if (!this.visible || this.hidden || zoom < this.minZoom - 0.3) return;
    const c = this.map.getCenter();
    const b = this.map.getBounds();
    const span = Math.max(b.getEast() - b.getWest(), b.getNorth() - b.getSouth());
    const was = this.builtAt;
    if (was && Math.hypot(c.lng - was.lng, c.lat - was.lat) < span * 0.25 && Math.abs(zoom - was.zoom) < 0.8) return;
    void this.rebuild();
  };

  /** Rebuild the mesh from the basemap tiles around the view, a few hundred buildings at a time. */
  private async rebuild() {
    if (this.building) return void (this.again = true);
    this.building = true;
    try {
      const c = this.map.getCenter();
      const zoom = this.map.getZoom();
      const center: [number, number] = [c.lng, c.lat];
      const feats = this.map.querySourceFeatures(this.source, { sourceLayer: this.sourceLayer });
      const fps = footprintsOf(feats, center);
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < fps.length; i += 400) {
        while (this.map.isMoving()) await new Promise((r) => setTimeout(r, 120));
        parts.push(buildCityMesh(fps.slice(i, i + 400), center));
        await new Promise((r) => setTimeout(r, 0));
      }
      const geo = parts.length ? mergeParts(parts) : null;
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh = null;
      }
      if (geo) {
        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.matrixAutoUpdate = false;
        this.mesh.frustumCulled = false;
        this.scene.add(this.mesh);
      }
      this.meshCenter = center;
      this.builtAt = { lng: c.lng, lat: c.lat, zoom };
      this.map.triggerRepaint();
    } catch (e) {
      console.warn("[facades]", e);
    } finally {
      this.building = false;
      if (this.again) {
        this.again = false;
        this.onIdle();
      }
    }
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    const showCity = zoom >= this.minZoom && !!this.mesh;
    const showTrees = zoom >= TREES_MIN_ZOOM && !!this.trees;
    if (!this.visible || this.hidden || (!showCity && !showTrees)) return;
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const center = this.map.getCenter();
    const origin = modelMatrix(new THREE.Matrix4(), center.lng, center.lat, globe);
    this.originInv.copy(origin).invert();
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.camera.projectionMatrix = main.multiply(origin);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    if (this.mesh) {
      this.mesh.visible = showCity;
      modelMatrix(this.tmp, this.meshCenter[0], this.meshCenter[1], globe).premultiply(this.originInv);
      this.mesh.matrix.copy(this.tmp);
      this.mesh.matrixWorld.copy(this.tmp);
    }
    if (this.trees) {
      this.trees.visible = showTrees;
      modelMatrix(this.tmp, TREES_CENTER[0], TREES_CENTER[1], globe).premultiply(this.originInv);
      this.trees.matrix.copy(this.tmp);
      this.trees.matrixWorld.copy(this.tmp);
      TREE_TIME.value = performance.now() / 1000;
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (showTrees) this.map.triggerRepaint(); // keep the leaves moving in the wind
  }
}

/** Joins the chunk geometries (same attributes: position float32, color uint8 normalized). */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Uint8Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Uint8Array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3, true));
  return g;
}
