// Basemap: OpenFreeMap "Liberty" (real OpenStreetMap data for the whole world, free, no API key),
// restyled for a soft, realistic 3D city look. Satellite imagery (Esri World Imagery) is a toggle.
import type { StyleSpecification, LayerSpecification, ExpressionSpecification, ImageSourceSpecification } from "maplibre-gl";
import type { BpdaManifest } from "./buildings3d";

const LIBERTY = "https://tiles.openfreemap.org/styles/liberty";

/** Detailed street-level ground for the whole T area (Overture Maps / OpenStreetMap): parks, woods, water, every road,
 *  path and sidewalk, painted like real streets (lane lines, crosswalks). "ov-minor" starts empty and is filled near the view (TransitMap). */
export function detailGround(url: (f: string) => string): { sources: StyleSpecification["sources"]; layers: LayerSpecification[] } {
  const W = (z: number[], w: number[]): ExpressionSpecification => ["interpolate", ["exponential", 2], ["zoom"], ...z.flatMap((zz, i) => [zz, w[i]])];
  const majorW = (k: number): ExpressionSpecification => ["interpolate", ["exponential", 2], ["zoom"],
    10, ["*", k, ["+", 0.5, ["*", 0.3, ["get", "r"]]]], 16, ["*", k, ["+", 7, ["*", 2.2, ["get", "r"]]]], 19, ["*", k, ["+", 56, ["*", 18, ["get", "r"]]]]];
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
    { id: "ov-minor-casing", type: "line", source: "ov-minor", minzoom: 13, filter: ["!=", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": SIDEWALK, "line-width": W([13, 16, 19], [1.2, 8.5, 62]) } },
    { id: "ov-minor", type: "line", source: "ov-minor", minzoom: 13, filter: ["!=", ["get", "k"], "path"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["match", ["get", "k"], "service", "#a9abb0", "#9a9da3"], "line-width": W([13, 16, 19], [0.6, 5.5, 38]) } },
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

/** OpenStreetMap buildings (the rest of Massachusetts) in the same pastel palette as the Boston/Cambridge city:
 *  each building gets a color from its id (stable, varied), towers get sky-blue glass. */
const PASTELS = ["#c97b5a", "#d9b38c", "#e6dac2", "#b8664a", "#d6c4a2", "#9e9a92", "#b0967c", "#e4cfa8"];
const BUILDING_COLOR: ExpressionSpecification = [
  "case",
  [">", ["coalesce", ["get", "render_height"], 0], 60],
  ["match", ["%", ["floor", ["coalesce", ["to-number", ["id"]], ["get", "render_height"]]], 3], 0, "#6284a8", 1, "#8ca6be", "#7692b0"],
  ["match", ["%", ["floor", ["+", ["coalesce", ["to-number", ["id"]], 0], ["*", ["coalesce", ["get", "render_height"], 10], 7]]], 8],
    0, PASTELS[0], 1, PASTELS[1], 2, PASTELS[2], 3, PASTELS[3], 4, PASTELS[4], 5, PASTELS[5], 6, PASTELS[6], PASTELS[7]],
];

export async function loadBaseStyle(manifest: BpdaManifest | null): Promise<{ style: StyleSpecification; offline: boolean }> {
  try {
    const r = await fetch(LIBERTY);
    if (!r.ok) throw new Error(String(r.status));
    const style = (await r.json()) as StyleSpecification;
    return { style: restyle(style, manifest), offline: false };
  } catch {
    return { style: fallbackStyle(manifest), offline: true };
  }
}

function restyle(style: StyleSpecification, manifest: BpdaManifest | null): StyleSpecification {
  const layers: LayerSpecification[] = [];
  for (const l of style.layers) {
    const layer = { ...l } as LayerSpecification & { paint?: Record<string, unknown>; layout?: Record<string, unknown>; "source-layer"?: string };
    const sl = layer["source-layer"];
    if (layer.type === "fill-extrusion" && sl === "building") {
      layer.minzoom = 13;
      layer.paint = {
        ...layer.paint,
        "fill-extrusion-color": BUILDING_COLOR,
        "fill-extrusion-opacity": 0.93,
        "fill-extrusion-vertical-gradient": true,
      };
    }
    if (layer.type === "fill" && sl === "building") {
      layer.maxzoom = 24; // keep flat footprints in 2D mode at every zoom
      layer.paint = { ...layer.paint, "fill-color": "#cbbfae", "fill-outline-color": "#a89c8b" };
    }
    // our own MBTA lines and stations replace OpenStreetMap's subway lines and station icons
    if (layer.id.includes("transit_rail") || layer.id === "poi_transit") layer.layout = { ...layer.layout, visibility: "none" };
    if (layer.type === "background") layer.paint = { ...layer.paint, "background-color": PALETTE.land };
    // richer greens and cleaner ground, closer to a game map
    const GREEN: Record<string, string> = { park: PALETTE.park, landcover_grass: PALETTE.park, landcover_wood: PALETTE.wood, landuse_pitch: "#a9d68e", landuse_cemetery: "#c3dcaa", landuse_school: "#ece9dc" };
    if (layer.type === "fill" && GREEN[layer.id]) layer.paint = { ...layer.paint, "fill-color": GREEN[layer.id] };
    if (layer.id === "landuse_residential") layer.paint = { ...layer.paint, "fill-color": "rgba(232, 227, 216, 0.55)" };
    if (layer.type === "fill" && sl === "water") layer.paint = { ...layer.paint, "fill-color": PALETTE.water };
    // gray asphalt with concrete sidewalks, like a real street
    if (layer.type === "line" && sl === "transportation" && /^(road|bridge|tunnel)_/.test(layer.id) && !/rail|transit|oneway|area/.test(layer.id)) {
      const color = /casing/.test(layer.id) ? SIDEWALK : /path|pedestrian/.test(layer.id) ? "#e3dfd6" : /motorway/.test(layer.id) ? "#7d8086" : /trunk|primary/.test(layer.id) ? "#878a90" : "#9a9da3";
      layer.paint = { ...layer.paint, "line-color": color };
    }
    // painted center lines on big roads (added once, right after the main road layer)
    const CENTER: Record<string, string[]> = { road_motorway: ["motorway"], road_trunk_primary: ["trunk", "primary"], road_secondary_tertiary: ["secondary"] };
    if (CENTER[layer.id] && (layer as { "source-layer"?: string })["source-layer"] === "transportation") {
      layers.push(layer);
      layers.push({
        id: `${layer.id}-centerline`,
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 15.5,
        filter: ["match", ["get", "class"], CENTER[layer.id], true, false],
        paint: { "line-color": "#f2c24a", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 15.5, 0.5, 19, 1.6], "line-gap-width": ["interpolate", ["exponential", 2], ["zoom"], 15.5, 0.4, 19, 2.2] },
      });
      continue;
    }
    // fewer POI icons: they compete with stations and campuses
    if (layer.type === "symbol" && sl === "poi") layer.minzoom = Math.max(layer.minzoom ?? 0, 16);
    layers.push(layer);
  }

  // satellite imagery under everything else (hidden by default)
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
  // terrain shading (free AWS Terrarium elevation tiles) so hills and valleys across Massachusetts read in 3D
  style.sources.dem = {
    type: "raster-dem",
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 14,
    attribution: "Elevation: Mapzen Terrain Tiles (AWS)",
  };
  style.sources.earth = EARTH_SOURCE(new URL("/data/base/earth.jpg", document.baseURI).href);
  // illustrated central Boston ground under the streets
  const groundSrc: StyleSpecification["sources"] = {};
  const ground = groundLayers(manifest, groundSrc, (f) => new URL(`/data/${f}`, document.baseURI).href);
  Object.assign(style.sources, groundSrc);
  layers.splice(layers.findIndex((l) => l.id === "water"), 0, ...ground); // OSM water draws over it
  const firstLine = layers.findIndex((l) => l.type === "line");
  layers.splice(firstLine, 0,
    { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5d6b58", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#5d6b58" } },
    // online, real map tiles cover every zoom: fade the space photo out by state zoom as before
    { ...EARTH_LAYER, maxzoom: 8.5, paint: { ...EARTH_LAYER.paint, "raster-opacity": ["interpolate", ["linear"], ["zoom"], 4.5, 1, 7.5, 0] } } as LayerSpecification,
  );
  const bgIndex = layers.findIndex((l) => l.type === "background");
  layers.splice(bgIndex + 1, 0, {
    id: "satellite",
    type: "raster",
    source: "satellite",
    layout: { visibility: "none" },
    paint: { "raster-saturation": -0.1, "raster-contrast": 0.05 },
  });

  return { ...style, layers };
}

/** Fill layers to hide when satellite imagery is on (land cover, parks, water...). */
export function groundLayerIds(style: StyleSpecification) {
  return style.layers
    .filter((l) => l.type === "fill" && (l as { "source-layer"?: string })["source-layer"] !== "building")
    .map((l) => l.id)
    .concat(style.layers.filter((l) => l.type === "raster" && l.id !== "satellite" && l.id !== "earth").map((l) => l.id));
}
