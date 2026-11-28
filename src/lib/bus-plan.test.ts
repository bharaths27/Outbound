import { describe, expect, it } from "vitest";
import { busNumber } from "./bus";
import { planBus, type RouteStops } from "./bus-plan";

// A straight east-west route along latitude 42.35, stops every ~400 m.
const line = (route: string, directionId: number, reverse = false): RouteStops => {
  const stops = Array.from({ length: 10 }, (_, k) => ({ id: `${route}-${k}`, name: `Stop ${k}`, lat: 42.35, lon: -71.13 + k * 0.005 }));
  return { route, directionId, headsign: reverse ? "West" : "East", stops: reverse ? [...stops].reverse() : stops };
};

describe("planBus", () => {
  const from: [number, number] = [-71.1295, 42.3505]; // next to Stop 0
  const to: [number, number] = [-71.0855, 42.3495]; // next to Stop 9

  it("rides the direction that goes the right way", () => {
    const [o] = planBus(from, to, [line("57", 0), line("57", 1, true)], "Copley");
    expect(o.label).toBe("Bus 57");
    expect(o.steps[1]).toMatchObject({ mode: "transit", from: "Stop 0", to: "Stop 9", headsign: "East", stops: 9 });
    expect(o.steps[2].text).toBe("Walk to Copley");
    expect(o.fare).toBe(1.7);
    expect(o.minutes).toBe(o.walkMin + o.rideMin);
  });

  it("skips a route when either end is too far to walk", () => {
    const far: [number, number] = [-71.0, 42.4];
    expect(planBus(from, far, [line("57", 0)])).toEqual([]);
  });

  it("skips a trip too short to bother with a bus", () => {
    const near: [number, number] = [-71.1255, 42.3505]; // one stop away
    expect(planBus(from, near, [line("57", 0)])).toEqual([]);
  });

  it("names Silver Line routes", () => {
    expect(busNumber("749")).toBe("SL5");
    expect(busNumber("66")).toBe("66");
    const [o] = planBus(from, to, [line("749", 0)]);
    expect(o.label).toBe("Silver Line 5");
    expect(o.segments[1].color).toBe("#8E979D");
  });

  it("keeps one option per route, fastest first, at most two", () => {
    const opts = planBus(from, to, [line("57", 0), line("1", 0), line("66", 0), line("57", 1)]);
    expect(opts.length).toBe(2);
    expect(new Set(opts.map((o) => o.label)).size).toBe(2);
  });
});
