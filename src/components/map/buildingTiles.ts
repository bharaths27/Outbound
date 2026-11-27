// The basemap's full-detail buildings (zoom-14 tiles: real heights and OSM ids) for any view, also zoomed out.
// MapLibre itself only loads zoom-13 and lower tiles when zoomed out, and those merge buildings and drop heights
// and ids, which made the zoomed-out city flat and one color. Fetching the same zoom-14 tiles ourselves keeps every
// building the same shape and color at every zoom. The tiles are the ones the map already uses (browser-cached).
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { Map as MlMap, VectorTileSource } from "maplibre-gl";

export const DETAIL_Z = 14;
export type BuildingFeature = { id: number | string | undefined; properties: Record<string, unknown>; geometry: GeoJSON.Geometry };

export function lngLatToTile(lng: number, lat: number, z = DETAIL_Z): [number, number] {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return [Math.floor(x), Math.floor(y)];
}

/** Zoom-14 tiles inside the view's bounds, nearest to the center first, at most `radius` tiles from it each way. */
export function tilesForView(center: [number, number], bounds: [number, number, number, number], radius: number): [number, number][] {
  const [cx, cy] = lngLatToTile(center[0], center[1]);
  const [x0, y1] = lngLatToTile(bounds[0], bounds[1]);
  const [x1, y0] = lngLatToTile(bounds[2], bounds[3]);
  const out: [number, number][] = [];
  for (let x = Math.max(x0, cx - radius); x <= Math.min(x1, cx + radius); x++) {
    for (let y = Math.max(y0, cy - radius); y <= Math.min(y1, cy + radius); y++) out.push([x, y]);
  }
  return out.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
}

/** How far out (in zoom-14 tiles) to load buildings: wider when zoomed out, capped so it stays quick. */
export const tileRadius = (zoom: number) => (zoom >= 13.5 ? 2 : 3);

const MAX_CACHED = 160;

export class BuildingTiles {
  private cache = new Map<string, Promise<BuildingFeature[]>>();
  constructor(private map: MlMap, private source = "openmaptiles", private sourceLayer = "building") {}

  /** The vector tile URL template, once the basemap's TileJSON has loaded (null offline / for other sources). */
  template(): string | null {
    const src = this.map.getSource(this.source) as VectorTileSource | undefined;
    const t = src?.type === "vector" ? src.tiles?.[0] : undefined;
    return t ?? null;
  }

  async load(x: number, y: number): Promise<BuildingFeature[]> {
    const tpl = this.template();
    if (!tpl) return [];
    const key = `${x}/${y}`;
    let p = this.cache.get(key);
    if (!p) {
      const url = tpl.replace("{z}", String(DETAIL_Z)).replace("{x}", String(x)).replace("{y}", String(y));
      p = fetch(url)
        .then((r) => {
          if (r.status === 404 || r.status === 204) return null; // no tile there (open water, outside the data)
          return r.ok ? r.arrayBuffer() : Promise.reject(new Error(`tile ${key}: ${r.status}`));
        })
        .then((buf) => (buf ? decodeBuildings(buf, x, y, this.sourceLayer) : []))
        .catch((e) => {
          this.cache.delete(key); // try again next time
          console.warn("[buildings]", e);
          return [];
        });
      this.cache.set(key, p);
      if (this.cache.size > MAX_CACHED) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
}

export function decodeBuildings(buf: ArrayBuffer, x: number, y: number, sourceLayer = "building"): BuildingFeature[] {
  const layer = new VectorTile(new PbfReader(new Uint8Array(buf))).layers[sourceLayer];
  if (!layer) return [];
  const out: BuildingFeature[] = [];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const g = f.toGeoJSON(x, y, DETAIL_Z);
    out.push({ id: f.id, properties: f.properties as Record<string, unknown>, geometry: g.geometry });
  }
  return out;
}
