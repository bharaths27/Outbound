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

import { BUS_3D_MIN_ZOOM, busFit, HALF_STREET_M, roadMeters } from "./buses3d";

describe("buses stay on the street", () => {
  it("a bus never reaches past the curb or the drawn road, at any 3D zoom", () => {
    for (let z = BUS_3D_MIN_ZOOM; z <= 21; z += 0.25) {
      const { width, offset } = busFit(z, 42.35);
      const road = roadMeters(z, 42.35);
      expect(offset + width / 2).toBeLessThanOrEqual(HALF_STREET_M + 1e-9);
      expect(offset + width / 2).toBeLessThanOrEqual(road / 2 + 1.3); // real bus width allowed on very close zoom
      expect(offset - width / 2).toBeGreaterThanOrEqual(-1e-9); // stays in its own half, not across the centerline
    }
  });

  it("drawn roads are much wider than before when zoomed out", () => {
    expect(roadMeters(15, 42.35)).toBeGreaterThan(30);
  });

  it("over a long random drive the bus is always on the street line", () => {
    // a zig-zag street with 6 corners, ~3 km
    const pts: [number, number][] = [];
    let x = -71.1, y = 42.35;
    for (let k = 0; k < 7; k++) {
      pts.push([x, y]);
      if (k % 2) y += 0.004; else x += 0.005;
    }
    const a = new BusAnimator();
    a.setShapes("57", [pts]);
    const s = makeShape(pts);
    let t = 0;
    for (let along = 0; along < s.total; along += 137 + (along % 90)) {
      const p = pointAt(s, along).p;
      // GPS noise up to ~10 m
      const noisy: [number, number] = [p[0] + 0.0001 * Math.sin(along), p[1] + 0.00008 * Math.cos(along)];
      a.ingest([{ ...bus(noisy[0], noisy[1]), bearing: 0 }], 1000, t);
      for (let f = 0; f <= 1000; f += 100) {
        const now = a.now(t + f)[0];
        expect(project(s, [now.lng, now.lat]).off).toBeLessThan(0.5); // on the line (lane offset is added at draw time)
      }
      t += 1000;
    }
  });
});
