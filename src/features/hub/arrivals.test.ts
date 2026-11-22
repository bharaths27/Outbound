import { describe, expect, it } from "vitest";
import type { Arrival } from "@/lib/types";
import { destination, formatMinutes, nextTrains } from "./arrivals";

const now = new Date("2026-11-21T17:00:00Z");
const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
const arrival = (route: string, directionId: number, min: number): Arrival => ({
  route,
  line: route.split("-")[0] as Arrival["line"],
  directionId,
  arrivalTime: at(min),
  minutes: min,
  status: null,
});

describe("nextTrains", () => {
  it("keeps the soonest train per route and direction, soonest first", () => {
    const list = [
      arrival("Red", 1, 9),
      arrival("Red", 0, 4),
      arrival("Red", 1, 2),
      arrival("Red", 0, 12),
    ];
    expect(nextTrains(list, now)).toEqual([
      { key: "Red:1", route: "Red", destination: "Alewife", minutes: 2 },
      { key: "Red:0", route: "Red", destination: "Ashmont/Braintree", minutes: 4 },
    ]);
  });

  it("treats Green branches as separate routes and honors the limit", () => {
    const list = [arrival("Green-B", 0, 3), arrival("Green-C", 0, 1), arrival("Green-D", 0, 6)];
    expect(nextTrains(list, now, 2).map((t) => t.destination)).toEqual(["Cleveland Circle", "Boston College"]);
  });

  it("recomputes minutes against now and drops trains that left", () => {
    const later = new Date(now.getTime() + 3 * 60_000);
    const list = [arrival("Orange", 1, 2), arrival("Orange", 0, 5)];
    expect(nextTrains(list, later)).toEqual([{ key: "Orange:0", route: "Orange", destination: "Forest Hills", minutes: 2 }]);
  });

  it("ignores unreadable times", () => {
    expect(nextTrains([{ ...arrival("Red", 0, 1), arrivalTime: "soon" }], now)).toEqual([]);
  });
});

describe("labels", () => {
  it("names destinations and minutes", () => {
    expect(destination("Green-E", 1)).toBe("Medford/Tufts");
    expect(destination("Unknown", 0)).toBe("Outbound");
    expect(formatMinutes(0)).toBe("Now");
    expect(formatMinutes(7)).toBe("7 min");
  });
});
