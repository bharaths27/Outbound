import { describe, expect, it } from "vitest";
import { BADGES_SEEN_KEY, newlyEarned, readSeen, writeSeen } from "./unlock";

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("newlyEarned", () => {
  it("shows nothing the first time we see a player", () => {
    expect(newlyEarned(null, ["line_collector", "night_owl"])).toEqual([]);
  });
  it("returns only badges that weren't seen", () => {
    expect(newlyEarned(["line_collector"], ["line_collector", "cross_town"])).toEqual(["cross_town"]);
  });
  it("returns nothing when nothing changed", () => {
    expect(newlyEarned(["night_owl"], ["night_owl"])).toEqual([]);
  });
});

describe("seen storage", () => {
  it("round-trips per player", () => {
    const s = memory();
    writeSeen("u1", ["night_owl"], s);
    expect(readSeen("u1", s)).toEqual(["night_owl"]);
    expect(readSeen("u2", s)).toBeNull();
    expect(s.m.has(BADGES_SEEN_KEY("u1"))).toBe(true);
  });
  it("treats junk as never seen", () => {
    const s = memory();
    s.setItem(BADGES_SEEN_KEY("u1"), "{not json");
    expect(readSeen("u1", s)).toBeNull();
  });
});
