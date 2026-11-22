import { describe, expect, it } from "vitest";
import { type LineLateness, lateFor, lineFamily } from "./line-delays";

const LINES: LineLateness[] = [
  { line: "Red", color: "green", badge: "Red Line on time" },
  { line: "Orange", color: "orange", badge: "Orange Line +6 min" },
  { line: "Green", color: "yellow", badge: "Green Line +2 min" },
];

describe("lateFor", () => {
  it("keeps this station's late lines only", () => {
    expect(lateFor(["Green-B", "Green-C"], LINES).map((l) => l.badge)).toEqual(["Green Line +2 min"]);
    expect(lateFor(["Red"], LINES)).toEqual([]);
    expect(lateFor(["Orange", "Green-E"], LINES)).toHaveLength(2);
  });

  it("maps branches to their line", () => {
    expect(lineFamily("Green-D")).toBe("Green");
    expect(lineFamily("Mattapan")).toBe("Red");
  });
});
