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
    expect(first.length).toBe(24); // the built-in fallback routes: 6 routes x 4 buses
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
  it("cover every regular MBTA bus route on its real shape, with buses by route length", () => {
    const { routes } = JSON.parse(readFileSync("public/data/bus-samples.json", "utf8")) as { routes: { route: string; number: string; buses: number; path: [number, number][] }[] };
    expect(routes.length).toBeGreaterThan(140);
    for (const n of ["1", "39", "57", "66", "SL1", "SL5", "111", "28"]) expect(routes.some((r) => r.number === n)).toBe(true);
    expect(routes.some((r) => /shuttle/i.test(r.number))).toBe(false);
    for (const r of routes) {
      expect(r.path.length).toBeGreaterThan(1);
      expect(r.buses).toBeGreaterThanOrEqual(2);
      expect(r.buses).toBeLessThanOrEqual(10);
      const len = r.path.slice(1).reduce((s, p, i) => s + meters(r.path[i], p), 0);
      expect(len).toBeGreaterThan(500);
    }
  });
});
