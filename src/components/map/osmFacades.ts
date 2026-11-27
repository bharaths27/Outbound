// Close-up 3D buildings with real facades, built from the basemap's own OpenStreetMap buildings
// (OpenFreeMap "building" layer: real footprints, heights, and the wall color OSM mappers gave them).
// Each building gets windows, floor bands, shop fronts and doors on the ground floor, and roof detail
// from the facade shader (facade.ts). Small houses get gable roofs (procBuildings.ts).
// Farther out the basemap's plain extruded buildings show instead (style.ts, FACADE_MIN_ZOOM), in the same color per building.
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap, MapGeoJSONFeature } from "maplibre-gl";
import { modelMatrix } from "./trains3d";
import { makeFacadeMaterial, FACADE_NIGHT } from "./facade";
import { sunLight } from "./sun";
import type { Weather } from "./weather";
import { BuildingTiles, tilesForView, tileRadius, type BuildingFeature } from "./buildingTiles";
import { buildCityMesh, makeTreeMesh, TREE_TIME, HOUSE_COLORS, type Footprint } from "./procBuildings";
import type { ExpressionSpecification } from "maplibre-gl";

/** From this zoom the buildings are drawn with facades; below it, the basemap's plain boxes. */
export const FACADE_MIN_ZOOM = 13;
/** How many buildings get facades (nearest first): more when zoomed out, so the whole view keeps its detail. */
export const maxBuildings = (zoom: number) => (zoom >= 15.5 ? 12000 : zoom >= 14.5 ? 17000 : zoom >= 13.5 ? 22000 : 28000);
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

// procBuildings' hash (no offset), kept for the house colors
function houseHash(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Per-building seed for colors: the OSM id when the tiles carry one, else from the height (zoomed-out tiles merge buildings and drop ids). */
export function buildingSeed(id: unknown, height: number, minHeight: number) {
  return typeof id === "number" ? id % 100_003 : Math.round(height * 10) * 7 + Math.round(minHeight) * 3;
}

// OpenMapTiles' color for building:material=brick, used when a tagged color can't be read
const TAGGED_FALLBACK = [189, 129, 97];
function hexRgb(s: unknown): number[] | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(t);
  if (m) {
    const v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(t);
  if (m3) return [...m3[1]].map((c) => parseInt(c + c, 16));
  return TAGGED_FALLBACK;
}

/** A tagged OSM color, varied per building: whole neighborhoods are tagged with one material ("brick"), which would
 *  paint every building the same. Reddish ones become a mix of real brick shades, and each gets its own brightness. */
function varyTagged(own: number[], seed: number): number[] {
  const brickish = own[0] > own[1] + 25;
  const b = BRICK[Math.floor(hash(seed + 5) * BRICK.length)];
  const k = 0.84 + 0.3 * hash(seed + 6);
  return own.map((c, i) => Math.min(255, Math.round((brickish ? c * 0.45 + b[i] * 0.55 : c) * k)));
}

/** Wall color: the OSM building color when mapped, otherwise a Boston material picked by height (stable per building). */
export function wallColor(colour: unknown, height: number, seed: number): number[] {
  const own = hexRgb(colour);
  if (own) return varyTagged(own, seed);
  const r = hash(seed);
  if (height > 45) return r > 0.3 ? GLASS[Math.floor(hash(seed + 1) * GLASS.length)] : STONE[Math.floor(hash(seed + 2) * STONE.length)];
  if (height <= 15) return HOUSE_COLORS[Math.floor(houseHash(seed + 1) * HOUSE_COLORS.length)]; // painted clapboard, brick
  return r > 0.45 ? BRICK[Math.floor(hash(seed + 3) * BRICK.length)] : STONE[Math.floor(hash(seed + 4) * STONE.length)];
}

const rgbStr = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const pick = (list: number[][], h: ExpressionSpecification): ExpressionSpecification =>
  ["at", ["min", list.length - 1, ["floor", ["*", h, list.length]]], ["literal", list.map(rgbStr)]];

/** wallColor as a MapLibre expression, so the zoomed-out plain buildings get the same colors as the facades up close. */
export function wallColorExpression(): ExpressionSpecification {
  const height: ExpressionSpecification = ["coalesce", ["get", "render_height"], 6];
  const seed: ExpressionSpecification = [
    "case",
    ["==", ["typeof", ["id"]], "number"], ["%", ["id"], 100_003],
    ["+", ["*", ["round", ["*", height, 10]], 7], ["*", ["round", ["coalesce", ["get", "render_min_height"], 0]], 3]],
  ];
  // hash(n) above, and procBuildings' house hash (no offset)
  const h1 = (k: number): ExpressionSpecification => {
    const x: ExpressionSpecification = ["*", ["sin", ["+", ["*", ["+", seed, k], 12.9898], 78.233]], 43758.5453];
    return ["-", x, ["floor", x]];
  };
  const h2 = (k: number): ExpressionSpecification => {
    const x: ExpressionSpecification = ["*", ["sin", ["*", ["+", seed, k], 12.9898]], 43758.5453];
    return ["-", x, ["floor", x]];
  };
  const rgba: ExpressionSpecification = ["to-rgba", ["to-color", ["get", "colour"], `rgb(${TAGGED_FALLBACK.join(",")})`]];
  const ch = (i: number): ExpressionSpecification => ["at", i, rgba];
  const brickish: ExpressionSpecification = [">", ch(0), ["+", ch(1), 25]];
  const bi: ExpressionSpecification = ["min", BRICK.length - 1, ["floor", ["*", h1(5), BRICK.length]]];
  const k: ExpressionSpecification = ["+", 0.84, ["*", 0.3, h1(6)]];
  const chan = (i: number): ExpressionSpecification => [
    "min", 255,
    ["round", ["*", ["case", brickish, ["+", ["*", ch(i), 0.45], ["*", ["at", bi, ["literal", BRICK.map((c) => c[i])]], 0.55]], ch(i)], k]],
  ];
  const tagged: ExpressionSpecification = ["rgb", chan(0), chan(1), chan(2)];
  const made: ExpressionSpecification = [
    "case",
    [">", height, 45], ["case", [">", h1(0), 0.3], pick(GLASS, h1(1)), pick(STONE, h1(2))],
    ["<=", height, 15], pick(HOUSE_COLORS, h2(1)),
    ["case", [">", h1(0), 0.45], pick(BRICK, h1(3)), pick(STONE, h1(4))],
  ];
  return ["case", ["==", ["typeof", ["get", "colour"]], "string"], tagged, ["to-color", made]] as ExpressionSpecification;
}

/** Basemap building features -> footprints for buildCityMesh (deduplicated, nearest to `center` first). */
export function footprintsOf(feats: Pick<MapGeoJSONFeature, "id" | "properties" | "geometry">[], center: [number, number], limit = maxBuildings(16)): Footprint[] {
  const seen = new Set<string>();
  const out: { f: Footprint; d: number }[] = [];
  const k = Math.cos((center[1] * Math.PI) / 180);
  for (const f of feats) {
    const p = f.properties ?? {};
    if (p.hide_3d === true || p.hide_3d === "true") continue;
    const h = Number(p.render_height ?? 6);
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
      const seed = buildingSeed(f.id, h, b); // same seed as the zoomed-out color expression
      out.push({ f: { rings, h, b: b || undefined, rgb: wallColor(p.colour, h, seed), seed }, d: ((cx - center[0]) * k) ** 2 + (cy - center[1]) ** 2 });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, limit).map((x) => x.f);
}

type Group = { meshes: THREE.Mesh[]; center: [number, number] };

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
  /** the finished city, and the one being built (drawn as it grows, nearest buildings first, so nothing goes missing) */
  private city: Group | null = null;
  private next: Group | null = null;
  private material = (() => {
    const m = makeFacadeMaterial(1, 4.1);
    m.side = THREE.DoubleSide; // clipped tile pieces don't have a reliable winding
    return m;
  })();
  private tmp = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();
  private builtAt: { lng: number; lat: number; zoom: number } | null = null;
  private building = false;
  private tiles!: BuildingTiles;
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
    this.tiles = new BuildingTiles(map, this.source, this.sourceLayer);
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
    for (const g of [this.city, this.next]) g?.meshes.forEach((m) => m.geometry.dispose());
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
    this.timer = setTimeout(this.onIdle, 200);
  };
  private onData = (e: { sourceId?: string; tile?: unknown }) => {
    if (e.sourceId !== this.source) return;
    // with the zoom-14 tiles fetched directly (buildingTiles.ts), the map's own tiles arriving changes nothing
    if (this.tiles.template() && this.builtAt) return;
    if (!e.tile && !this.tiles.template()) return;
    // new buildings arrived: rebuild even if the view hasn't moved much (once the tiles stop streaming in)
    this.builtAt = null;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onIdle, 900);
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

  /** The buildings around the view: the zoom-14 tiles (same detail at every zoom), else whatever the map has loaded. */
  private async features(center: [number, number], zoom: number): Promise<BuildingFeature[]> {
    if (!this.tiles.template()) return this.map.querySourceFeatures(this.source, { sourceLayer: this.sourceLayer });
    const b = this.map.getBounds();
    const want = tilesForView(center, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], tileRadius(zoom));
    return (await Promise.all(want.map(([x, y]) => this.tiles.load(x, y)))).flat();
  }

  /** Rebuild the mesh from the basemap tiles around the view, a few hundred buildings at a time. */
  private async rebuild() {
    if (this.building) return void (this.again = true);
    this.building = true;
    try {
      const c = this.map.getCenter();
      const zoom = this.map.getZoom();
      const center: [number, number] = [c.lng, c.lat];
      const feats = await this.features(center, zoom);
      const fps = footprintsOf(feats, center, maxBuildings(zoom));
      const next: Group = { meshes: [], center };
      this.next = next;
      // nearest first: small batches up front so the buildings around you appear right away, bigger ones after
      for (let i = 0, n = 300; i < fps.length; i += n, n = Math.min(1500, n * 2)) {
        while (this.map.isMoving()) await new Promise((r) => setTimeout(r, 120));
        const mesh = new THREE.Mesh(buildCityMesh(fps.slice(i, i + n), center), this.material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        next.meshes.push(mesh);
        this.scene.add(mesh);
        this.map.triggerRepaint();
        await new Promise((r) => setTimeout(r, 0));
      }
      // the new city is complete: drop the old one
      this.city?.meshes.forEach((m) => (this.scene.remove(m), m.geometry.dispose()));
      this.city = next;
      this.next = null;
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
    const showCity = zoom >= this.minZoom && !!(this.city || this.next);
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
    for (const g of [this.city, this.next]) {
      if (!g) continue;
      modelMatrix(this.tmp, g.center[0], g.center[1], globe).premultiply(this.originInv);
      for (const m of g.meshes) {
        m.visible = showCity;
        m.matrix.copy(this.tmp);
        m.matrixWorld.copy(this.tmp);
      }
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
