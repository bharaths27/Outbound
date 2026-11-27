import { describe, expect, it } from "vitest";
import type { Bus } from "@/lib/bus";
import { BusAnimator, decodePolyline, makeShape, pointAt, project } from "./bus-track";

// An L-shaped street: 800 m east, then 800 m north. A straight line between its ends cuts the corner.
const E = 800 / (111_320 * Math.cos((42.35 * Math.PI) / 180)), N = 800 / 110_570;
const L: [number, number][] = [[-71.1, 42.35], [-71.1 + E, 42.35], [-71.1 + E, 42.35 + N]];
const bus = (lon: number, lat: number, bearing = 90): Bus => ({ id: "b1", route: "57", number: "57", silver: false, lon, lat, bearing, headsign: null, status: null, stopName: null, directionId: 0 });

describe("bus tracks", () => {
  it("projects a point onto the street", () => {
    const s = makeShape(L);
    expect(s.total).toBeGreaterThan(1590);
    const p = project(s, [-71.1 + E / 2, 42.35 + 0.0001]);
    expect(p.along).toBeGreaterThan(390);
    expect(p.along).toBeLessThan(410);
    expect(p.off).toBeLessThan(15);
    expect(pointAt(s, 1200).p[0]).toBeCloseTo(-71.1 + E, 6);
  });

  it("goes around the corner instead of through the block", () => {
    const a = new BusAnimator();
    a.setShapes("57", [L]);
    a.ingest([bus(L[0][0] + E * 0.5, 42.35)], 0, 0); // halfway along the first street
    a.ingest([bus(L[2][0], 42.35 + N * 0.5, 0)], 1000, 0); // halfway up the second street
    // At the midpoint of the glide the bus is at the corner, not cutting diagonally across.
    const mid = a.now(500)[0];
    const corner = L[1];
    const offStreet = Math.min(Math.abs(mid.lat - 42.35) * 110_570, Math.abs(mid.lng - corner[0]) * 111_320 * Math.cos((42.35 * Math.PI) / 180));
    expect(offStreet).toBeLessThan(2);
  });

  it("doesn't snap a bus that is far from its route", () => {
    const a = new BusAnimator();
    a.setShapes("57", [L]);
    a.ingest([bus(-71.05, 42.3)], 0, 0);
    expect(a.now(0)[0].lng).toBeCloseTo(-71.05, 6);
  });

  it("holds still when GPS wobbles backwards", () => {
    const a = new BusAnimator();
    a.setShapes("57", [L]);
    a.ingest([bus(L[0][0] + E * 0.5, 42.35)], 0, 0);
    const before = a.now(0)[0].lng;
    a.ingest([bus(L[0][0] + E * 0.49, 42.35)], 1000, 0); // ~8 m back
    expect(a.now(1000)[0].lng).toBeCloseTo(before, 7);
  });

  it("decodes MBTA polylines", () => {
    // Google's documented example
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
});
