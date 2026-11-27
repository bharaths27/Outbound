import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { StyleSpecification } from "maplibre-gl";
import { evalZoomInterp, metersPerPx, plainStyle } from "./style";
import { FACADE_MIN_ZOOM, buildingSeed, footprintsOf, wallColor, wallColorExpression } from "./osmFacades";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";

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

  it("plain buildings hand over to the facade buildings up close (never both: they would flicker through each other)", () => {
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
    expect(wallColor("#aa3311", 20, 1)[0]).toBeGreaterThan(wallColor("#aa3311", 20, 1)[2]); // tagged brick stays brick
    expect(wallColor(undefined, 120, 7)).toEqual(wallColor(undefined, 120, 7));
    expect(wallColor(undefined, 10, 3)).toHaveLength(3); // small houses: painted house colors
  });
  it("zoomed out, the plain buildings get the same wall color as their facades", () => {
    const ex = createExpression(wallColorExpression(), { type: "color" } as never);
    expect(ex.result).toBe("success");
    const ev = (id: number | undefined, props: Record<string, unknown>) => {
      const c = (ex as { value: { evaluate: (g: unknown, f: unknown) => { r: number; g: number; b: number } } }).value.evaluate({ zoom: 14 }, { id, properties: props, type: 3 });
      return [c.r, c.g, c.b].map((v) => Math.round(v * 255));
    };
    for (const id of [1, 77, 4242, 99_871, 123_456_789]) {
      for (const h of [4, 9, 15, 16, 30, 80, 200]) expect(ev(id, { render_height: h })).toEqual(wallColor(undefined, h, buildingSeed(id, h, 0)));
    }
    // zoomed-out tiles merge buildings and drop their ids: still the same color both ways
    for (const h of [7, 22.5, 64]) expect(ev(undefined, { render_height: h, render_min_height: 3 })).toEqual(wallColor(undefined, h, buildingSeed(undefined, h, 3)));
    // tagged colors (whole areas are tagged "brick"): varied per building, the same both ways
    for (const id of [5, 812, 44_001, 7_654_321]) for (const colour of ["#bd8161", "#aa3311", "#dadbdb", "#5a81a0", "#abc"]) {
      expect(ev(id, { render_height: 20, colour })).toEqual(wallColor(colour, 20, buildingSeed(id, 20, 0)));
    }
    const shades = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => ev(id * 977, { render_height: 12, colour: "#bd8161" }).join()));
    expect(shades.size).toBeGreaterThan(5);
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

describe("full-detail building tiles at every zoom", () => {
  it("finds the zoom-14 tile under a point", async () => {
    const { lngLatToTile } = await import("./buildingTiles");
    // Harvard Square sits in zoom-14 tile 4955/6059 (OSM slippy-map numbering)
    expect(lngLatToTile(-71.1189, 42.3734)).toEqual([4955, 6059]);
  });
  it("loads the tiles in view, nearest first, never more than the radius allows", async () => {
    const { tilesForView, lngLatToTile } = await import("./buildingTiles");
    const c: [number, number] = [-71.09, 42.36];
    const t = tilesForView(c, [-71.2, 42.3, -70.98, 42.42], 3);
    expect(t[0]).toEqual(lngLatToTile(c[0], c[1]));
    expect(t.length).toBeLessThanOrEqual(49);
    const [cx, cy] = t[0];
    for (const [x, y] of t) expect(Math.max(Math.abs(x - cx), Math.abs(y - cy))).toBeLessThanOrEqual(3);
  });
});
