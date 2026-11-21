// Basemap: OpenFreeMap "Liberty" (real OpenStreetMap data for the whole world, free, no API key),
// restyled for a soft, realistic 3D city look. Satellite imagery (Esri World Imagery) is a toggle.
import type { StyleSpecification, LayerSpecification, ExpressionSpecification, ImageSourceSpecification } from "maplibre-gl";
import type { BpdaManifest } from "./buildings3d";

const LIBERTY = "https://tiles.openfreemap.org/styles/liberty";

// Offline basemap, from files bundled in public/data (no internet needed, e.g. bad venue wifi or the artifact):
//   - US states, Boston water and neighborhoods (base/)
//   - Cambridge streets, water, parks and buildings with real heights (City of Cambridge GIS, cambridge/)
//   - 2023 aerial photos of central Boston (BPDA 3D Smart Model, bpda/)
function fallbackStyle(manifest: BpdaManifest | null): StyleSpecification {
  const url = (f: string) => new URL(`data/${f}`, document.baseURI).href;
  const sources: StyleSpecification["sources"] = {
    states: { type: "geojson", data: url("base/us-states.geojson") },
    water: { type: "geojson", data: url("base/water.geojson") },
    hoods: { type: "geojson", data: url("base/boston-neighborhoods.geojson") },
    "cam-water": { type: "geojson", data: url("cambridge/water.geojson") },
    "cam-parks": { type: "geojson", data: url("cambridge/parks.geojson") },
    "cam-roads": { type: "geojson", data: url("cambridge/roads.geojson") },
    earth: EARTH_SOURCE(url("base/earth.jpg")),
  };
  const layers: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": "#b7d5ec" } },
    { id: "land", type: "fill", source: "states", paint: { "fill-color": "#eef0e8" } },
    { id: "state-lines", type: "line", source: "states", paint: { "line-color": "#c9c3b6", "line-width": 0.8 } },
    { id: "hoods", type: "fill", source: "hoods", paint: { "fill-color": "#e8e6dc", "fill-outline-color": "#d6d0c2" } },
    { id: "water", type: "fill", source: "water", paint: { "fill-color": "#86c8e8" } },
    { id: "cam-parks", type: "fill", source: "cam-parks", paint: { "fill-color": "#bfe0a8" } },
    { id: "cam-water", type: "fill", source: "cam-water", paint: { "fill-color": "#86c8e8" } },
    { id: "cam-roads", type: "fill", source: "cam-roads", paint: { "fill-color": "#f7f5f0", "fill-opacity": 0.95 } },
    EARTH_LAYER,
  ];
  for (const t of manifest?.tiles ?? []) {
    sources[`aerial-${t.name}`] = { type: "image", url: url(`bpda/${t.photo}`), coordinates: t.photoCorners as [[number, number], [number, number], [number, number], [number, number]] };
    layers.push({ id: `aerial-${t.name}`, type: "raster", source: `aerial-${t.name}`, minzoom: 11, paint: { "raster-fade-duration": 0, "raster-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 12.5, 1], "raster-contrast": 0.22, "raster-saturation": 0.3, "raster-brightness-max": 0.93 } });
  }
  return { version: 8, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", sources, layers };
}

// The whole Earth from space (NASA Blue Marble, public domain), reprojected to Web Mercator by
// scripts/data-build/earth.py. Shown on the globe and USA views, fades out as you zoom into a state.
const EARTH_SOURCE = (u: string): ImageSourceSpecification => ({
  type: "image",
  url: u,
  coordinates: [[-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]],
});
const EARTH_LAYER: LayerSpecification = {
  id: "earth",
  type: "raster",
  source: "earth",
  maxzoom: 8.5,
  paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 4.5, 1, 7.5, 0], "raster-fade-duration": 0, "raster-saturation": 0.1 },
};

const BUILDING_COLOR: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["coalesce", ["get", "render_height"], 10],
  0, "#efe9df",
  25, "#e6dfd4",
  60, "#d9d7d3",
  150, "#c8d0da",
];

export async function loadBaseStyle(manifest: BpdaManifest | null): Promise<{ style: StyleSpecification; offline: boolean }> {
  try {
    const r = await fetch(LIBERTY);
    if (!r.ok) throw new Error(String(r.status));
    const style = (await r.json()) as StyleSpecification;
    return { style: restyle(style), offline: false };
  } catch {
    return { style: fallbackStyle(manifest), offline: true };
  }
}

function restyle(style: StyleSpecification): StyleSpecification {
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
      layer.paint = { ...layer.paint, "fill-color": "#e4ddd2", "fill-outline-color": "#d3cabd" };
    }
    // our own MBTA lines and stations replace OpenStreetMap's subway lines and station icons
    if (layer.id.includes("transit_rail") || layer.id === "poi_transit") layer.layout = { ...layer.layout, visibility: "none" };
    if (layer.type === "background") layer.paint = { ...layer.paint, "background-color": "#efece4" };
    // richer greens and cleaner ground, closer to a game map
    const GREEN: Record<string, string> = { park: "#b4da98", landcover_grass: "#bde0a2", landcover_wood: "rgba(122, 184, 104, 0.8)", landuse_pitch: "#a9d68e", landuse_cemetery: "#c3dcaa", landuse_school: "#ece9dc" };
    if (layer.type === "fill" && GREEN[layer.id]) layer.paint = { ...layer.paint, "fill-color": GREEN[layer.id] };
    if (layer.id === "landuse_residential") layer.paint = { ...layer.paint, "fill-color": "rgba(232, 227, 216, 0.55)" };
    if (layer.type === "fill" && sl === "water") layer.paint = { ...layer.paint, "fill-color": "#86c8e8" };
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
  style.sources.earth = EARTH_SOURCE(new URL("data/base/earth.jpg", document.baseURI).href);
  const firstLine = layers.findIndex((l) => l.type === "line");
  layers.splice(firstLine, 0,
    { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5d6b58", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#5d6b58" } },
    EARTH_LAYER,
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
