// Basemap: OpenFreeMap "Liberty" (real OpenStreetMap data for the whole world, free, no API key),
// restyled for a soft, realistic 3D city look. Satellite imagery (Esri World Imagery) is a toggle.
import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from "maplibre-gl";
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
  };
  const layers: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": "#b7d5ec" } },
    { id: "land", type: "fill", source: "states", paint: { "fill-color": "#eef0e8" } },
    { id: "state-lines", type: "line", source: "states", paint: { "line-color": "#c9c3b6", "line-width": 0.8 } },
    { id: "hoods", type: "fill", source: "hoods", paint: { "fill-color": "#e8e6dc", "fill-outline-color": "#d6d0c2" } },
    { id: "water", type: "fill", source: "water", paint: { "fill-color": "#86c8e8" } },
    { id: "cam-parks", type: "fill", source: "cam-parks", paint: { "fill-color": "#bfe0a8" } },
    { id: "cam-water", type: "fill", source: "cam-water", paint: { "fill-color": "#86c8e8" } },
    { id: "cam-roads", type: "fill", source: "cam-roads", paint: { "fill-color": "#ffffff", "fill-opacity": 0.9 } },
  ];
  for (const t of manifest?.tiles ?? []) {
    sources[`aerial-${t.name}`] = { type: "image", url: url(`bpda/${t.photo}`), coordinates: t.photoCorners as [[number, number], [number, number], [number, number], [number, number]] };
    layers.push({ id: `aerial-${t.name}`, type: "raster", source: `aerial-${t.name}`, minzoom: 11, paint: { "raster-fade-duration": 0, "raster-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 12.5, 1] } });
  }
  return { version: 8, glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf", sources, layers };
}

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
    if (layer.type === "background") layer.paint = { ...layer.paint, "background-color": "#eef0ea" };
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
    .concat(style.layers.filter((l) => l.type === "raster" && l.id !== "satellite").map((l) => l.id));
}
