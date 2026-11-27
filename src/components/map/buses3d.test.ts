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
