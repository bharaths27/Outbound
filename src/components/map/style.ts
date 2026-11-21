// Basemap: OpenFreeMap "Liberty" (real OpenStreetMap data for the whole world, free, no API key),
// restyled for a soft, realistic 3D city look. Satellite imagery (Esri World Imagery) is a toggle.
import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

const LIBERTY = "https://tiles.openfreemap.org/styles/liberty";

const FALLBACK: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e9ece6" } }],
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

export async function loadBaseStyle(): Promise<{ style: StyleSpecification; offline: boolean }> {
  try {
    const r = await fetch(LIBERTY);
    if (!r.ok) throw new Error(String(r.status));
    const style = (await r.json()) as StyleSpecification;
    return { style: restyle(style), offline: false };
  } catch {
    return { style: FALLBACK, offline: true };
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
    if (layer.type === "fill" && sl === "water") layer.paint = { ...layer.paint, "fill-color": "#a5cde8" };
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

  // highlight university / college grounds (real campus outlines from OpenStreetMap)
  const firstBuilding = layers.findIndex((l) => (l as { "source-layer"?: string })["source-layer"] === "building");
  const campusFilter: ExpressionSpecification = ["match", ["get", "class"], ["university", "college"], true, false];
  const campus: LayerSpecification[] = [
    {
      id: "campus-fill",
      type: "fill",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: campusFilter,
      paint: { "fill-color": "#b49cff", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 16, 0.22] },
    },
    {
      id: "campus-line",
      type: "line",
      source: "openmaptiles",
      "source-layer": "landuse",
      filter: campusFilter,
      paint: { "line-color": "#7c5cff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 16, 2], "line-dasharray": [2, 1.5], "line-opacity": 0.8 },
    },
  ];
  if (style.sources.openmaptiles) layers.splice(firstBuilding >= 0 ? firstBuilding : layers.length, 0, ...campus);

  return { ...style, layers };
}

/** Fill layers to hide when satellite imagery is on (land cover, parks, water...). */
export function groundLayerIds(style: StyleSpecification) {
  return style.layers
    .filter((l) => l.type === "fill" && !["campus-fill"].includes(l.id) && (l as { "source-layer"?: string })["source-layer"] !== "building")
    .map((l) => l.id)
    .concat(style.layers.filter((l) => l.type === "raster" && l.id !== "satellite").map((l) => l.id));
}
