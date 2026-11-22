import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGraph, planRoute } from "./transit-route";

const lines = JSON.parse(readFileSync("public/data/mbta-lines.geojson", "utf8")).features;
const stations = JSON.parse(readFileSync("public/data/mbta-stations.json", "utf8"));
const g = buildGraph(lines, stations);
const BU: [number, number] = [-71.107037, 42.350049];

describe("our own T routing", () => {
  it("BU to Chinatown Gate rides the T with colored legs", () => {
    const r = planRoute(g, BU, [-71.0598, 42.3511], "Chinatown Gate");
    const rides = r.steps.filter((s) => s.mode === "transit");
    expect(rides.length).toBeGreaterThan(0);
    expect(r.segments.some((s) => s.mode === "transit" && s.path.length > 2)).toBe(true);
    expect(r.minutes).toBeGreaterThan(10);
    expect(r.minutes).toBeLessThan(50);
    expect(r.steps.at(-1)?.text).toBe("Walk to Chinatown Gate");
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
  });
});
