import { describe, expect, it } from "vitest";
import { BusAnimator, SampleBuses, busGeometryForTest } from "./buses3d";

describe("buses", () => {
  it("builds the 3D bus as one merged mesh", () => {
    const g = busGeometryForTest();
    expect(g).toBeTruthy();
    expect(g!.attributes.position.count).toBeGreaterThan(100);
    expect(g!.attributes.color).toBeTruthy();
  });

  it("sample buses move and the animator follows them", () => {
    const s = new SampleBuses();
    const a = new BusAnimator();
    const first = s.step(0);
    expect(first.length).toBe(24);
    a.ingest(first, 0, 0);
    const later = s.step(20);
    a.ingest(later, 1000, 0);
    const half = a.now(500);
    const done = a.now(1000);
    const id = first[0].id;
    const p0 = first[0], p1 = later.find((x) => x.id === id)!;
    const mid = half.find((x) => x.bus.id === id)!, end = done.find((x) => x.bus.id === id)!;
    expect(end.lng).toBeCloseTo(p1.lon, 6);
    expect(mid.lng).not.toBeCloseTo(p0.lon, 6);
  });
});

import { readFileSync } from "node:fs";
import { meters } from "@/lib/bus";

describe("sample bus routes", () => {
  it("follow streets: every point is a corner of a real road, with no long straight cuts", () => {
    const roads = JSON.parse(readFileSync("public/data/ground/major.json", "utf8")) as { features: { geometry: { type: string; coordinates: number[][] | number[][][] } }[] };
    const vertices = new Set<string>();
    const k = (p: number[]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    for (const f of roads.features) {
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates as number[][]] : (f.geometry.coordinates as number[][][]);
      for (const l of lines) for (const p of l) vertices.add(k(p));
    }
    const { routes } = JSON.parse(readFileSync("public/data/bus-samples.json", "utf8")) as { routes: { route: string; path: [number, number][] }[] };
    expect(routes.length).toBe(6);
    for (const r of routes) {
      for (const p of r.path) expect(vertices.has(k(p))).toBe(true);
      for (let i = 1; i < r.path.length; i++) expect(meters(r.path[i - 1], r.path[i])).toBeLessThan(1000); // consecutive corners of the same street
    }
  });
});
