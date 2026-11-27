// Basemap: the Boston 3D map look — OpenFreeMap "Liberty" as published (real OpenStreetMap data, free, no API key),
// with Map / Light / Satellite looks. Offline (no tile server) it falls back to the bundled illustrated basemap.
import type { StyleSpecification, LayerSpecification, ExpressionSpecification, ImageSourceSpecification } from "maplibre-gl";
import type { BpdaManifest } from "./buildings3d";
import type { Map as MlMap } from "maplibre-gl";
import { FACADE_MIN_ZOOM, wallColorExpression } from "./osmFacades";

const LIBERTY = "https://tiles.openfreemap.org/styles/liberty"; // the Boston 3D base map

/** Detailed street-level ground for the whole T area (Overture Maps / OpenStreetMap): parks, woods, water, every road,
 *  path and sidewalk, painted like real streets (lane lines, crosswalks). "ov-minor" starts empty and is filled near the view (TransitMap). */
export function detailGround(url: (f: string) => string): { sources: StyleSpecification["sources"]; layers: LayerSpecification[] } {
  const W = (z: number[], w: number[]): ExpressionSpecification => ["interpolate", ["exponential", 2], ["zoom"], ...z.flatMap((zz, i) => [zz, w[i]])];
  const majorW = (k: number): ExpressionSpecification => ["interpolate", ["exponential", 2], ["zoom"],
    // Wider than life when zoomed out so buses and cars fit on them (buses3d.ts roadMeters matches r = 2).
    10, ["*", k, ["+", 1.5, ["*", 0.8, ["get", "r"]]]], 13, ["*", k, ["+", 6, ["*", 2, ["get", "r"]]]], 16, ["*", k, ["+", 22, ["*", 6, ["get", "r"]]]], 19, ["*", k, ["+", 96, ["*", 28, ["get", "r"]]]]];
  const sources: StyleSpecification["sources"] = {
    "ov-green": { type: "geojson", data: url("ground/green.json"), maxzoom: 15 },
    "ov-water": { type: "geojson", data: url("ground/water.json"), maxzoom: 15 },
    "ov-major": { type: "geojson", data: url("ground/major.json"), maxzoom: 16 },
    "ov-minor": { type: "geojson", data: { type: "FeatureCollection", features: [] }, maxzoom: 16 },
    "ov-xwalk": { type: "geojson", data: { type: "FeatureCollection", features: [] }, maxzoom: 16 },
  };
  const GREEN: Record<string, string> = { park: PALETTE.park, grass: "#c2e2a2", pitch: "#a9d68e", wood: PALETTE.wood, wetland: "#b7d9c4", beach: "#f3e6c2", cemetery: "#c3dcaa", school: "#ebe6d8" };
  const layers: LayerSpecification[] = [
    { id: "ov-green", type: "fill", source: "ov-green", minzoom: 10, paint: { "fill-color": ["match", ["get", "k"], ...Object.entries(GREEN).flat(), PALETTE.park] as unknown as ExpressionSpecification, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 11, 1] } },
    { id: "ov-water", type: "fill", source: "ov-water", filter: ["!=", ["geometry-type"], "LineString"], paint: { "fill-color": ["match", ["get", "k"], "pool", "#9fd8ef", PALETTE.water] } },
    { id: "ov-streams", type: "line", source: "ov-water", minzoom: 12, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": PALETTE.water, "line-width": W([12, 18], [0.8, 5]) } },
    // Real-street look: concrete sidewalks along every street (the wide light casing), gray asphalt, curb edge lines,
    // double yellow center lines and white lane dashes on main roads, zebra crosswalks at main intersections.
    { id: "ov-paths", type: "line", source: "ov-minor", minzoom: 15, filter: ["==", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#e3dfd6", "line-width": W([15, 19], [1, 9]) } },
    { id: "ov-minor-casing", type: "line", source: "ov-minor", minzoom: 13, filter: ["!=", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": SIDEWALK, "line-width": W([13, 16, 19], [3.5, 20, 90]) } },
    { id: "ov-minor", type: "line", source: "ov-minor", minzoom: 13, filter: ["!=", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "k"], "service", "#a9abb0", "#9a9da3"], "line-width": W([13, 16, 19], [2.4, 14, 62]) } },
    { id: "ov-major-casing", type: "line", source: "ov-major", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "r"], 5, "#b9b8b3", SIDEWALK], "line-width": majorW(1.3) } },
    { id: "ov-major", type: "line", source: "ov-major", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "r"], 5, "#7d8086", 4, "#84878d", "#8d9096"], "line-width": majorW(1) } },
    // white curb lines just inside the road edge
    { id: "ov-edgeline", type: "line", source: "ov-major", minzoom: 16, filter: [">=", ["get", "r"], 2], layout: { "line-join": "round" }, paint: { "line-color": "rgba(255,255,255,0.85)", "line-width": W([16, 19], [0.5, 2]), "line-gap-width": majorW(0.86) } },
    // white lane dashes halfway between the center and each edge
    ...([1, -1] as const).map((side): LayerSpecification => ({ id: `ov-lanes-${side > 0 ? "r" : "l"}`, type: "line", source: "ov-major", minzoom: 16.5, filter: [">=", ["get", "r"], 2], paint: { "line-color": "rgba(255,255,255,0.9)", "line-width": W([16.5, 19], [0.6, 2]), "line-dasharray": [4, 6], "line-offset": majorW(0.22 * side) } })),
    // double yellow center line
    { id: "ov-centerline", type: "line", source: "ov-major", minzoom: 15.5, filter: ["all", [">=", ["get", "r"], 1], ["<=", ["get", "r"], 4]], paint: { "line-color": "#f2c24a", "line-width": W([15.5, 19], [0.5, 1.6]), "line-gap-width": W([15.5, 19], [0.4, 2.2]) } },
    // zebra crosswalks (thick dashed lines across the road)
    { id: "ov-crosswalks", type: "line", source: "ov-xwalk", minzoom: 16, paint: { "line-color": "rgba(255,255,255,0.95)", "line-width": W([16, 19], [1.6, 13]), "line-dasharray": [0.22, 0.22] } },
  ];
  return { sources, layers };
}

// Offline basemap, from files bundled in public/data (no internet needed, e.g. bad venue wifi or the artifact):
//   - US states, Boston water and neighborhoods (base/)
//   - Cambridge streets, water, parks and buildings with real heights (City of Cambridge GIS, cambridge/)
//   - illustrated ground of central Boston, drawn from the 2023 BPDA aerial photos (bpda/*_ground.png)
function fallbackStyle(manifest: BpdaManifest | null): StyleSpecification {
  const url = (f: string) => new URL(`/data/${f}`, document.baseURI).href;
  const sources: StyleSpecification["sources"] = {
    states: { type: "geojson", data: url("base/us-states.geojson") },
    water: { type: "geojson", data: url("base/water.geojson") },
    hoods: { type: "geojson", data: url("base/boston-neighborhoods.geojson") },
    "cam-water": { type: "geojson", data: url("cambridge/water.geojson") },
    "cam-parks": { type: "geojson", data: url("cambridge/parks.geojson") },
    "cam-roads": { type: "geojson", data: url("cambridge/roads.geojson") },
    streets: { type: "geojson", data: url("street-labels.geojson") },
    earth: EARTH_SOURCE(url("base/earth.jpg")),
    "ma-roads": { type: "geojson", data: url("base/ma-roads.json"), maxzoom: 12 },
    "ma-water": { type: "geojson", data: url("base/ma-water.json"), maxzoom: 12 },
    sea: { type: "geojson", data: url("base/sea.json"), maxzoom: 13 },
  };
  const layers: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": PALETTE.water } },
    { id: "land", type: "fill", source: "states", paint: { "fill-color": PALETTE.land } },
    { id: "state-lines", type: "line", source: "states", paint: { "line-color": "#c9c3b6", "line-width": 0.8 } },
    EARTH_LAYER, // under the Boston-area layers, so outside them the land still shows real terrain colors
    // a soft land tint over the blurry space photo when zoomed in, then lakes and main roads for all of MA (Overture Maps)
    { id: "land-tint", type: "fill", source: "states", minzoom: 7, paint: { "fill-color": PALETTE.land, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 10, 0.6] } },
    // real coastline around Boston (the state outline is too coarse there): harbor, islands and open sea
    { id: "sea", type: "fill", source: "sea", paint: { "fill-color": PALETTE.water } },
    { id: "ma-water", type: "fill", source: "ma-water", minzoom: 7, paint: { "fill-color": PALETTE.water } },
    { id: "ma-roads-casing", type: "line", source: "ma-roads", minzoom: 7, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#d6d3cc", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, ["*", 0.6, ["+", 1, ["get", "r"]]], 13, ["*", 4, ["+", 1, ["get", "r"]]]] } },
    { id: "ma-roads", type: "line", source: "ma-roads", minzoom: 7, layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["match", ["get", "r"], 3, "#7d8086", 2, "#878a90", "#9a9da3"], "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, ["*", 0.35, ["+", 1, ["get", "r"]]], 13, ["*", 2.8, ["+", 1, ["get", "r"]]]] } },
    { id: "hoods", type: "fill", source: "hoods", paint: { "fill-color": PALETTE.land, "fill-outline-color": "#ddd5c6" } },
    { id: "water", type: "fill", source: "water", paint: { "fill-color": PALETTE.water } },
    { id: "cam-parks", type: "fill", source: "cam-parks", paint: { "fill-color": PALETTE.park } },
    { id: "cam-water", type: "fill", source: "cam-water", paint: { "fill-color": PALETTE.water } },
    { id: "cam-roads", type: "fill", source: "cam-roads", paint: { "fill-color": "#a2a5aa", "fill-opacity": 0.95 } },
    // street names (Boston + Cambridge); the online basemap labels every street in MA
    ...(["line", "point"] as const).map((place): LayerSpecification => ({
      id: `street-names-${place}`,
      type: "symbol",
      source: "streets",
      minzoom: 13.5,
      filter: ["all", ["==", ["geometry-type"], place === "line" ? "LineString" : "Point"], [">=", ["zoom"], ["case", ["==", ["get", "m"], 1], 13.5, 15]]],
      layout: {
        "text-field": ["get", "n"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 14, ["case", ["==", ["get", "m"], 1], 11.5, 10], 18, ["case", ["==", ["get", "m"], 1], 15, 13]],
        "symbol-placement": place,
        "symbol-spacing": 320,
        "text-max-angle": 40,
        "symbol-sort-key": ["-", 1, ["get", "m"]],
        ...(place === "line" ? { "text-rotation-alignment": "map", "text-pitch-alignment": "viewport" } : {}),
      },
      paint: { "text-color": "#5b5560", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.6 },
    })),
  ];
  layers.splice(layers.findIndex((l) => l.id === "water"), 0, ...groundLayers(manifest, sources, url)); // water and parks draw over it
  // real streets, sidewalks, parks and water everywhere the T goes (over the illustrated ground, under labels)
  const detail = detailGround(url);
  Object.assign(sources, detail.sources);
  layers.splice(layers.findIndex((l) => l.id === "street-names-line"), 0, ...detail.layers);
  return { version: 8, glyphs: "obfont://{fontstack}/{range}", sources, layers };
}

/** Offline fonts for labels: Noto Sans (Latin) bundled as base64 JSON, so it also works where only text/data files are served. */
export function registerFontProtocol(ml: { addProtocol: (name: string, fn: (p: { url: string }) => Promise<{ data: ArrayBuffer }>) => void }) {
  const cache = new Map<string, Promise<ArrayBuffer>>();
  ml.addProtocol("obfont", ({ url }) => {
    const [stack, range] = decodeURIComponent(url.slice("obfont://".length)).split("/");
    const file = /bold/i.test(stack.split(",")[0]) ? "noto-sans-bold" : "noto-sans-regular";
    if (!range?.startsWith("0-255")) return Promise.resolve({ data: new ArrayBuffer(0) }); // only Latin is bundled
    if (!cache.has(file))
      cache.set(
        file,
        fetch(new URL(`/data/fonts/${file}-0-255.json`, document.baseURI).href)
          .then((r) => r.json())
          .then((j) => Uint8Array.from(atob(j.data), (c) => c.charCodeAt(0)).buffer),
      );
    return cache.get(file)!.then((b) => ({ data: b.slice(0) }));
  });
}

// The whole Earth from space (NASA Blue Marble, public domain), reprojected to Web Mercator by
// scripts/data-build/earth.py. Shown on the globe and USA views and under the offline map out to city zoom, so no area is blank.
const EARTH_SOURCE = (u: string): ImageSourceSpecification => ({
  type: "image",
  url: u,
  coordinates: [[-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]],
});
const EARTH_LAYER: LayerSpecification = {
  id: "earth",
  type: "raster",
  source: "earth",
  maxzoom: 13,
  paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 4.5, 1, 9, 0.9, 12.5, 0], "raster-fade-duration": 0, "raster-saturation": 0.1 },
};

/** Illustrated ground for central Boston (parks, pavement, streets), no fade so it appears at once. */
function groundLayers(manifest: BpdaManifest | null, sources: StyleSpecification["sources"], url: (f: string) => string): LayerSpecification[] {
  const out: LayerSpecification[] = [];
  for (const t of manifest?.tiles ?? []) {
    const file = (t as { ground?: string }).ground ?? t.photo;
    sources[`ground-${t.name}`] = { type: "image", url: url(`bpda/${file}`), coordinates: t.photoCorners as [[number, number], [number, number], [number, number], [number, number]] };
    out.push({ id: `ground-${t.name}`, type: "raster", source: `ground-${t.name}`, minzoom: 9, paint: { "raster-fade-duration": 0, "raster-resampling": "linear" } });
  }
  return out;
}

// Illustrated palette (matches the Outbound mockup): warm paper land, soft blue water, fresh greens.
const SIDEWALK = "#d6d3cc";
export const PALETTE = { land: "#ece6da", water: "#8ec3e6", park: "#b2d895", wood: "#9ccc84", road: "#ffffff", casing: "#d9d2c5" };

export async function loadBaseStyle(manifest: BpdaManifest | null): Promise<{ style: StyleSpecification; offline: boolean }> {
  try {
    const r = await fetch(LIBERTY);
    if (!r.ok) throw new Error(String(r.status));
    const style = (await r.json()) as StyleSpecification;
    return { style: plainStyle(style), offline: false };
  } catch {
    return { style: fallbackStyle(manifest), offline: true };
  }
}

/** Fill layers to hide when satellite imagery is on (land cover, parks, water...). */
export function groundLayerIds(style: StyleSpecification) {
  return style.layers
    .filter((l) => l.type === "fill" && (l as { "source-layer"?: string })["source-layer"] !== "building")
    .map((l) => l.id)
    .concat(style.layers.filter((l) => l.type === "raster" && l.id !== "satellite" && l.id !== "earth").map((l) => l.id));
}

// ---------- the Boston 3D base map (OpenFreeMap Liberty as published, like boston-3d-map.html) ----------

export type MapLook = "map" | "light" | "satellite";

/** Plain extruded OSM buildings for zoomed-out views (closer in, osmFacades.ts draws them with facades).
 *  Map and Satellite: each building keeps its facade color (brick, stone, glass, painted houses). Light: soft grays. */
const LIGHT_PALETTE = ["#ece9e4", "#e4e2de", "#dfe3e8", "#d5dbe2"];
export function buildingExtrusionColor(look: MapLook): ExpressionSpecification {
  if (look !== "light") return wallColorExpression();
  const pal = LIGHT_PALETTE;
  return ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 0], 0, pal[0], 25, pal[1], 70, pal[2], 160, pal[3]];
}

/** OpenFreeMap Liberty unchanged, except: our own MBTA lines and stations replace OSM's, the buildings get the
 *  Boston 3D map's soft height colors (and hand over to the facade buildings up close), and a satellite option. */
export function plainStyle(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const l of style.layers) {
    const layer = { ...l } as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown>; "source-layer"?: string };
    if (layer.id.includes("transit_rail") || layer.id === "poi_transit") layer.layout = { ...layer.layout, visibility: "none" };
    if (layer.type === "line" && layer["source-layer"] === "transportation") widenToReal(layer);
    if (layer.type === "fill-extrusion" && layer["source-layer"] === "building") {
      layer.minzoom = 13;
      delete layer.maxzoom; // stays under the facade buildings (osmFacades.ts) so nothing disappears while they build
      (layer as { filter?: unknown }).filter = ["!=", ["get", "hide_3d"], true];
      layer.paint = {
        "fill-extrusion-color": buildingExtrusionColor("map"),
        // full height as soon as buildings appear, so zoomed out the city stays 3D. Where the facade buildings take over,
        // these sit just under their roofs (houses under the eaves of their gable roofs).
        "fill-extrusion-height": [
          "interpolate", ["linear"], ["zoom"],
          FACADE_MIN_ZOOM - 0.01, ["coalesce", ["get", "render_height"], 6],
          FACADE_MIN_ZOOM, ["case", ["<=", ["coalesce", ["get", "render_height"], 6], 15], 2.7, ["-", ["coalesce", ["get", "render_height"], 6], 0.3]],
        ],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.95,
        "fill-extrusion-vertical-gradient": true,
      };
    }
    layers.push(layer);
  }
  style.sources = {
    ...style.sources,
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  };
  const bgIndex = layers.findIndex((l) => l.type === "background");
  layers.splice(bgIndex + 1, 0, { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } });
  return { ...style, layers };
}

/** "Light" look: the same map in pale grays, like OpenFreeMap Positron. */
const LIGHT: { test: (id: string, sl?: string, type?: string) => boolean; prop: Parameters<MlMap["getPaintProperty"]>[1]; value: string }[] = [
  { test: (_i, _s, t) => t === "background", prop: "background-color", value: "#f6f6f4" },
  { test: (_i, s, t) => t === "fill" && s === "water", prop: "fill-color", value: "#d4dadc" },
  { test: (_i, s, t) => t === "fill" && (s === "park" || s === "landcover"), prop: "fill-color", value: "#e6ebe0" },
  { test: (_i, s, t) => t === "fill" && s === "landuse", prop: "fill-color", value: "#efefec" },
  { test: (i, s, t) => t === "line" && s === "transportation" && /casing/.test(i), prop: "line-color", value: "#dcdcdc" },
  { test: (i, s, t) => t === "line" && s === "transportation" && !/casing|rail|transit/.test(i), prop: "line-color", value: "#ffffff" },
  { test: (_i, s, t) => t === "line" && s === "waterway", prop: "line-color", value: "#d4dadc" },
  { test: (_i, s, t) => t === "fill" && s === "building", prop: "fill-color", value: "#e8e6e2" },
  { test: (_i, s, t) => t === "symbol" && (s === "transportation_name" || s === "place"), prop: "text-color", value: "#6f7378" },
];
const originals = new WeakMap<MlMap, Map<string, unknown>>();

/** Switch between the Map, Light and Satellite looks without reloading the style (so the T and 3D layers stay). */
export function setMapLook(map: MlMap, look: MapLook) {
  let saved = originals.get(map);
  if (!saved) originals.set(map, (saved = new Map()));
  for (const l of map.getStyle().layers) {
    const sl = (l as { "source-layer"?: string })["source-layer"];
    for (const rule of LIGHT) {
      if (!rule.test(l.id, sl, l.type)) continue;
      const key = `${l.id}|${rule.prop}`;
      if (!saved.has(key)) saved.set(key, map.getPaintProperty(l.id, rule.prop));
      map.setPaintProperty(l.id, rule.prop, (look === "light" ? rule.value : saved.get(key)) as string);
    }
    if (l.type === "fill-extrusion" && sl === "building") map.setPaintProperty(l.id, "fill-extrusion-color", buildingExtrusionColor(look));
  }
}

// ---------- streets at their real width up close ----------
// Liberty's roads thin out to a few meters when zoomed in close, narrower than a bus, next to full-size buildings.
// From zoom 15 on, each road is at least as wide as the real street (curb to curb, casings include sidewalks).

/** Real street widths in meters, by Liberty road layer. */
export function realRoadMeters(id: string): number | null {
  if (/rail|path|pedestrian|aerialway|ferry|area|oneway/.test(id)) return null;
  const casing = /casing/.test(id) ? 3 : 0;
  const w = /motorway_link|_link/.test(id) ? 7 : /motorway/.test(id) ? 22 : /trunk_primary/.test(id) ? 15 : /secondary_tertiary/.test(id) ? 12 : /minor|street/.test(id) ? 9 : /service|track/.test(id) ? 5 : null;
  return w == null ? null : w + casing;
}
/** Meters per pixel at a zoom (512 px tiles), at Boston's latitude. */
export const metersPerPx = (zoom: number, lat = 42.35) => (40_075_016 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));

/** Value of an ["interpolate", ["exponential", b], ["zoom"], z0, v0, ...] width at a zoom. */
export function evalZoomInterp(base: number, stops: [number, number][], zoom: number): number {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z0, v0] = stops[i - 1], [z1, v1] = stops[i];
    if (zoom <= z1) {
      const t = base === 1 ? (zoom - z0) / (z1 - z0) : (Math.pow(base, zoom - z0) - 1) / (Math.pow(base, z1 - z0) - 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return stops[stops.length - 1][1];
}

function widenToReal(layer: LayerSpecification & { paint?: Record<string, unknown> }) {
  const real = realRoadMeters(layer.id);
  const w = layer.paint?.["line-width"];
  if (real == null || !Array.isArray(w) || w[0] !== "interpolate" || (w[2] as unknown[])?.[0] !== "zoom") return;
  const base = Array.isArray(w[1]) && w[1][0] === "exponential" ? Number(w[1][1]) : 1;
  const stops: [number, number][] = [];
  for (let i = 3; i + 1 < w.length; i += 2) stops.push([Number(w[i]), Number(w[i + 1])]);
  if (stops.some(([z, v]) => !Number.isFinite(z) || !Number.isFinite(v))) return;
  const out: number[] = [];
  // Liberty's own width up to zoom 15 (sampled every zoom level, since its next stop was past 15)
  const zs = [...new Set([...stops.map(([z]) => z).filter((z) => z < 15), ...[8, 9, 10, 11, 12, 13, 14].filter((z) => z > stops[0][0])])].sort((a, b) => a - b);
  for (const z of zs) out.push(z, evalZoomInterp(base, stops, z));
  for (let z = 15; z <= 22; z++) out.push(z, Math.max(evalZoomInterp(base, stops, z), real / metersPerPx(z)));
  layer.paint = { ...layer.paint, "line-width": ["interpolate", ["exponential", base], ["zoom"], ...out] as unknown as number };
}
