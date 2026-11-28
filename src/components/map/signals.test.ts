import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { armAxis, CYCLE_S, lightAt, secondsLeft, signalOffset, walkAt } from "./signals";

describe("traffic lights", () => {
  it("the walk signal only says WALK while that street's cars are stopped, and does each cycle", () => {
    for (const off of [0, 0.37, 0.8]) {
      for (const axis of [0, 1] as const) {
        let walks = 0;
        for (let t = 0; t < CYCLE_S; t += 0.25) {
          if (!walkAt(axis, off, t)) continue;
          walks++;
          expect(lightAt(axis, off, t)).toBe("red");
        }
        expect(walks).toBeGreaterThan(0);
      }
    }
  });

  it("crossing streets are never green at the same time", () => {
    for (const off of [0, 0.13, 0.5, 0.91]) {
      for (let t = 0; t < CYCLE_S * 2; t += 0.25) {
        const a = lightAt(0, off, t), b = lightAt(1, off, t);
        expect(a === "green" && b === "green").toBe(false);
        expect(a !== "red" && b !== "red").toBe(false); // at least one way is always stopped
      }
    }
  });

  it("goes green, then yellow, then red, in a 44 s cycle", () => {
    const seq: string[] = [];
    for (let t = 0; t < CYCLE_S; t++) {
      const l = lightAt(0, 0, t);
      if (seq.at(-1) !== l) seq.push(l);
    }
    expect(seq).toEqual(["green", "yellow", "red"]);
    expect(lightAt(0, 0, 3)).toBe(lightAt(0, 0, 3 + CYCLE_S));
  });

  it("each street keeps its axis, the crossing street gets the other", () => {
    const arms = [10, 100, 190, 280];
    expect(arms.map((b) => armAxis(arms, b))).toEqual([0, 1, 0, 1]);
  });

  it("counts down to the next change", () => {
    expect(secondsLeft(0, 0, 0)).toBe(18);
    expect(lightAt(0, 0, 18)).toBe("yellow");
  });

  it("neighboring lights are out of step", () => {
    expect(signalOffset(-71.1, 42.35)).not.toBeCloseTo(signalOffset(-71.1005, 42.3502), 2);
  });

  it("the light locations file is sane", () => {
    const j = JSON.parse(readFileSync("public/data/ground/signals.json", "utf8")) as { signals: [number, number, number[]][] };
    expect(j.signals.length).toBeGreaterThan(500);
    for (const [lng, lat, arms] of j.signals) {
      expect(lng).toBeGreaterThan(-72);
      expect(lng).toBeLessThan(-70.5);
      expect(lat).toBeGreaterThan(41.9);
      expect(lat).toBeLessThan(42.8);
      expect(arms.length).toBeGreaterThanOrEqual(2);
    }
  });
});
