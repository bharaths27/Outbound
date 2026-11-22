import { describe, expect, it } from "vitest";
import { wrapLines } from "./render-card";

// 10 px per character, so widths are easy to reason about.
const measure = (s: string) => s.length * 10;

describe("wrapLines", () => {
  it("keeps short titles on one line", () => {
    expect(wrapLines(measure, "Find Johnston Gate", 300, 2)).toEqual(["Find Johnston Gate"]);
  });
  it("wraps onto a second line", () => {
    expect(wrapLines(measure, "Fenway From the Sidewalk", 150, 2)).toEqual(["Fenway From the", "Sidewalk"]);
  });
  it("adds an ellipsis when it runs past the last line", () => {
    const lines = wrapLines(measure, "one two three four five six seven", 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(measure(lines[1])).toBeLessThanOrEqual(100);
  });
});
