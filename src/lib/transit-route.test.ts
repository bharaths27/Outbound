import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGraph, planRoute, planRoutes } from "./transit-route";

const lines = JSON.parse(readFileSync("public/data/mbta-lines.geojson", "utf8")).features;
const stations = JSON.parse(readFileSync("public/data/mbta-stations.json", "utf8"));
const g = buildGraph(lines, stations);
const BU: [number, number] = [-71.107037, 42.350049];

describe("route options", () => {
  it("gives several different ways from BU to Forest Hills, fastest first", () => {
    const opts = planRoutes(g, BU, [-71.1139, 42.3007], "Arnold Arboretum");
    for (const o of opts) console.log(o.label, o.minutes, "min", o.lines.join(">"), o.transfers, "transfers", o.walkMin, "min walk");
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts[0].label).toBe("Fastest");
    for (let i = 1; i < opts.length; i++) expect(opts[i].minutes).toBeGreaterThanOrEqual(opts[i - 1].minutes);
    expect(new Set(opts.map((o) => o.lines.join(">") + o.steps.map((x) => x.from).join())).size).toBe(opts.length);
  });
  it("BU to Chinatown has more than one option", () => {
    const opts = planRoutes(g, BU, [-71.0598, 42.3511], "Chinatown Gate");
    for (const o of opts) console.log(o.label, o.minutes, "min", o.lines.join(">"), "fare", o.fare);
    expect(opts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("our own T routing", () => {
  it("BU to Chinatown Gate rides the T with colored legs", () => {
    const r = planRoute(g, BU, [-71.0598, 42.3511], "Chinatown Gate");
    const rides = r.steps.filter((s) => s.mode === "transit");
    expect(rides.length).toBeGreaterThan(0);
    expect(r.segments.some((s) => s.mode === "transit" && s.path.length > 2)).toBe(true);
    expect(r.minutes).toBeGreaterThan(10);
    expect(r.minutes).toBeLessThan(50);
    expect(r.steps.at(-1)?.text).toBe("Walk to Chinatown Gate");
    expect(r.fare).toBe(2.4); // one subway fare, transfers free
    console.log(r.minutes, r.steps.map((s) => (s.mode === "walk" ? `${s.text} ${s.minutes}m` : `${s.line} ${s.from}->${s.to} ${s.stops} stops ${s.minutes}m`)).join(" | "));
  });
  it("BU to Harvard needs a transfer", () => {
    const r = planRoute(g, BU, [-71.1189, 42.3736], "Harvard");
    console.log(r.minutes, r.steps.map((s) => (s.mode === "walk" ? `${s.text} ${s.minutes}m` : `${s.line} ${s.from}->${s.to} ${s.stops} stops`)).join(" | "));
    expect(r.steps.filter((s) => s.mode === "transit").length).toBeGreaterThanOrEqual(1);
  });
  it("a short hop is a walk", () => {
    const r = planRoute(g, BU, [-71.1045, 42.3505], "Marsh Plaza");
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0].mode).toBe("walk");
    expect(r.fare).toBe(0);
  });
});

describe("ride times for the time filter", async () => {
  const { rideTimes } = await import("./transit-route");
  it("gives minutes from BU to every station, by T or on foot", () => {
    const t = rideTimes(g, BU);
    expect(Object.keys(t).length).toBe(stations.length);
    expect(t["place-bucen"]).toBeLessThanOrEqual(2); // next door
    expect(t["place-kencl"]).toBeGreaterThan(t["place-bucen"]);
    expect(t["place-pktrm"]).toBeGreaterThan(10);
    expect(t["place-pktrm"]).toBeLessThan(30);
  });
});
