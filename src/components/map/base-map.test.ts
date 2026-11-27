import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { StyleSpecification } from "maplibre-gl";
import { evalZoomInterp, metersPerPx, plainStyle } from "./style";
import { FACADE_MIN_ZOOM, footprintsOf, wallColor } from "./osmFacades";

// A slice of OpenFreeMap Liberty: one road, the subway line, the 3D buildings.
const liberty = (): StyleSpecification => ({
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#f8f4f0" } },
    { id: "road_trunk_primary", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 5, 0, 7, 1, 20, 18] } },
    { id: "road_transit_rail", type: "line", source: "openmaptiles", "source-layer": "transportation", paint: { "line-width": 1 } },
    { id: "building-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14, paint: { "fill-extrusion-color": "#ddd" } },
  ],
});

describe("Boston 3D base map", () => {
  const st = plainStyle(liberty());
  const layer = (id: string) => st.layers.find((l) => l.id === id) as { layout?: Record<string, unknown>; paint?: Record<string, unknown>; maxzoom?: number };

  it("hides OSM's subway so our T lines stay the only T, and adds a hidden satellite layer", () => {
    expect(layer("road_transit_rail").layout?.visibility).toBe("none");
    expect(layer("satellite").layout?.visibility).toBe("none");
  });

  it("plain buildings hand over to the facade buildings up close", () => {
    expect(layer("building-3d").maxzoom).toBe(FACADE_MIN_ZOOM);
  });

  it("main roads are at least 15 m wide from zoom 15, and Liberty's own width further out", () => {
    const w = layer("road_trunk_primary").paint!["line-width"] as unknown[];
    const base = (w[1] as [string, number])[1];
    const stops: [number, number][] = [];
    for (let i = 3; i < w.length; i += 2) stops.push([w[i] as number, w[i + 1] as number]);
    for (let z = 15; z <= 21; z++) expect(evalZoomInterp(base, stops, z) * metersPerPx(z)).toBeGreaterThanOrEqual(15 - 1e-6);
    expect(evalZoomInterp(base, stops, 10)).toBeCloseTo(evalZoomInterp(1.2, [[5, 0], [7, 1], [20, 18]], 10), 6);
  });
});

describe("facade buildings from the map's OSM buildings", () => {
  const sq = (x: number, y: number, d = 0.0002): [number, number][][] => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];
  it("uses the OSM color when mapped, glass for towers, and keeps each building's look stable", () => {
    expect(wallColor("#aa3311", 20, 1)).toEqual([0xaa, 0x33, 0x11]);
    expect(wallColor(undefined, 120, 7)).toEqual(wallColor(undefined, 120, 7));
    expect(wallColor(undefined, 10, 3)).toBeUndefined(); // small houses: painted house colors
  });
  it("drops duplicates (one per tile), hidden parts, and sorts nearest first", () => {
    const f = (id: number, x: number, h = 20, extra = {}) => ({ id, properties: { render_height: h, ...extra }, geometry: { type: "Polygon" as const, coordinates: sq(x, 42.35) } });
    const out = footprintsOf([f(1, -71.05), f(1, -71.05), f(2, -71.06), f(3, -71.04, 20, { hide_3d: true })] as never, [-71.0601, 42.35]);
    expect(out.length).toBe(2);
    expect(out[0].rings[0][0][0]).toBeCloseTo(-71.06, 6);
    expect(out[0].seed).toBe(2);
  });
});

describe("the Boston 3D map file it came from", () => {
  it("is the OpenFreeMap Liberty map (same tiles)", () => {
    const src = readFileSync("src/components/map/style.ts", "utf8");
    expect(src).toContain("https://tiles.openfreemap.org/styles/liberty");
  });
});
