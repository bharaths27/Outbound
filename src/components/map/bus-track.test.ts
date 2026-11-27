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

  it("main roads are drawn at least real width up close, and buses are real size there", () => {
    for (let z = 15; z <= 21; z += 0.5) expect(roadMeters(z, 42.35)).toBeGreaterThanOrEqual(15);
    expect(busFit(18, 42.35).width).toBeCloseTo(2.6, 6);
    expect(busFit(16, 42.35).width).toBeLessThanOrEqual(2.6 * 1.5 + 1e-9); // a little bigger further out, never huge
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

import { bendPose, makeRoadNet, snapToRoads, snapToRoadsW } from "./bus-track";

describe("route shapes snap onto the drawn streets", () => {
  it("moves a shape running 10 m beside a street onto it, but leaves the cross street alone", () => {
    const street: [number, number][] = [[-71.1, 42.35], [-71.09, 42.35]]; // east-west
    const cross: [number, number][] = [[-71.095, 42.345], [-71.095, 42.355]]; // north-south
    const net = makeRoadNet([street, cross]);
    const off = 10 / 110_570;
    const shape: [number, number][] = [[-71.099, 42.35 + off], [-71.091, 42.35 + off]];
    const snapped = snapToRoads(net, shape);
    expect(snapped.length).toBeGreaterThan(10);
    for (const p of snapped) expect(Math.abs(p[1] - 42.35)).toBeLessThan(1e-7);
  });

  it("keeps points with no street nearby", () => {
    const net = makeRoadNet([[[-71.1, 42.35], [-71.09, 42.35]]]);
    const far: [number, number][] = [[-71.1, 42.36], [-71.09, 42.36]];
    const s = snapToRoads(net, far);
    for (const p of s) expect(p[1]).toBeCloseTo(42.36, 6);
  });
});

describe("articulated bus bends on turns", () => {
  // east 200 m, then a right-angle turn north 200 m
  const kx = 111_320 * Math.cos((42.35 * Math.PI) / 180);
  const c: [number, number] = [-71.1 + 200 / kx, 42.35];
  const shape = makeShape([[-71.1, 42.35], c, [c[0], 42.35 + 200 / 110_570]]);
  it("is straight on a straight street", () => {
    const p = bendPose(shape, 100, 0, 9, 5);
    expect(p.front).toBeCloseTo(0, 6);
    expect(p.rear).toBeCloseTo(0, 6);
  });
  it("front turns first at the corner, rear follows", () => {
    const p = bendPose(shape, 200 - 3, 0, 9, 5); // joint just before the corner
    expect(p.front).toBeGreaterThan(0.3); // front swung toward north
    expect(Math.abs(p.rear)).toBeLessThan(1e-6); // rear still heading east
    const q = bendPose(shape, 200 + 3, 0, 9, 5); // joint just past the corner
    expect(q.front).toBeCloseTo(Math.PI / 2, 6);
    expect(q.rear).toBeGreaterThan(0.2);
    expect(q.rear).toBeLessThan(Math.PI / 2 - 0.2); // bent at the joint
  });
});

import { laneOffset, lanePoint, DEFAULT_ROAD_M } from "./bus-track";

describe("a bus always fits on its street", () => {
  it("stays between the centerline and the curb on every street it drives, at every size it is drawn", () => {
    for (const road of [DEFAULT_ROAD_M, 12, 15, 22])
      for (let busW = 2.6; busW <= 2.6 * 1.5; busW += 0.1) {
        const off = laneOffset(road, busW);
        expect(off - busW / 2).toBeGreaterThanOrEqual(0); // not over the centerline
        expect(off + busW / 2).toBeLessThanOrEqual(road / 2 + 1e-9); // not past the curb
      }
  });

  it("uses the width of the street it was snapped onto", () => {
    const net = makeRoadNet([[[-71.1, 42.35], [-71.09, 42.35]], [[-71.1, 42.36], [-71.09, 42.36]]], 42.36, [22, 9]);
    const wide = makeShape(...(Object.values(snapToRoadsW(net, [[-71.099, 42.35], [-71.091, 42.35]])) as [never, never]));
    const narrow = makeShape(...(Object.values(snapToRoadsW(net, [[-71.099, 42.36], [-71.091, 42.36]])) as [never, never]));
    const side = (w: number) => laneOffset(w, 2.6);
    const dWide = Math.abs(lanePoint(wide, 100, side).p[1] - 42.35) * 110_570;
    const dNarrow = Math.abs(lanePoint(narrow, 100, side).p[1] - 42.36) * 110_570;
    expect(dWide).toBeCloseTo(5.5, 1); // middle of the right lane of a 22 m road
    expect(dNarrow).toBeLessThanOrEqual(4.5 - 1.3 + 1e-6); // inside its half of a 9 m road
  });
});
