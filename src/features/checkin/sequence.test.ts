import { describe, expect, it } from "vitest";
import type { CheckInResult } from "@/lib/data/types";
import { TOTAL_MS, easeOutBack, frameAt, nextTierLine, summary, tierProgress } from "./sequence";

const result = (over: Partial<CheckInResult> = {}): CheckInResult => ({
  xp_awarded: 100,
  xp_breakdown: [
    { reason: "base", xp: 50 },
    { reason: "first_visit", xp: 25 },
    { reason: "new_neighborhood", xp: 25 },
  ],
  first_visit: true,
  new_neighborhood: false,
  cross_school: false,
  neighborhood: "Chinatown",
  neighborhood_quests: 2,
  tier: "bronze",
  next_tier: "silver",
  quests_to_next_tier: 1,
  total_xp: 400,
  level: 2,
  xp_to_next_level: 100,
  ...over,
});

describe("frameAt", () => {
  it("starts empty", () => {
    const f = frameAt(0, result(), "bronze");
    expect(f).toMatchObject({ stamp: 0, stampOpacity: 0, xp: 0, lines: 0, done: false });
  });

  it("overshoots the stamp before it lands", () => {
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(easeOutBack))).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(frameAt(400, result(), "bronze").stamp).toBeCloseTo(1);
  });

  it("counts XP up and reveals lines one by one", () => {
    const mid = frameAt(850, result(), "bronze");
    expect(mid.xp).toBeGreaterThan(0);
    expect(mid.xp).toBeLessThan(100);
    expect(mid.lines).toBe(2);
    expect(frameAt(1250, result(), "bronze")).toMatchObject({ xp: 100, lines: 3 });
  });

  it("ends on the backend's values", () => {
    const end = frameAt(TOTAL_MS, result(), "bronze");
    expect(end).toMatchObject({ xp: 100, lines: 3, ringTier: "bronze", tierUp: false, done: true });
    expect(end.ring).toBeCloseTo(2 / 3);
  });

  it("moves the ring from the previous share without an upgrade", () => {
    expect(frameAt(1300, result(), "bronze").ring).toBeCloseTo(1 / 3);
  });

  it("fills in the old color, then switches on a tier upgrade", () => {
    const up = result({ tier: "silver", neighborhood_quests: 3, next_tier: "gold", quests_to_next_tier: 2 });
    expect(frameAt(1500, up, "bronze")).toMatchObject({ ringTier: "bronze", tierUp: true });
    expect(frameAt(1300, up, "bronze").ring).toBe(0);
    expect(frameAt(TOTAL_MS, up, "bronze")).toMatchObject({ ringTier: "silver", done: true });
    expect(frameAt(TOTAL_MS, up, "bronze").ring).toBeCloseTo(3 / 5);
  });

  it("treats a first stamp in a neighborhood as filling from empty", () => {
    const first = result({ neighborhood_quests: 1, quests_to_next_tier: 2 });
    expect(frameAt(1300, first, null)).toMatchObject({ ring: 0, tierUp: false });
  });
});

describe("text", () => {
  it("reads progress from the backend's counts", () => {
    expect(tierProgress({ neighborhood_quests: 3, quests_to_next_tier: 2, next_tier: "gold" })).toBeCloseTo(0.6);
    expect(tierProgress({ neighborhood_quests: 6, quests_to_next_tier: 0, next_tier: null })).toBe(1);
    expect(nextTierLine(result())).toBe("1 more quest here for Silver");
    expect(nextTierLine(result({ quests_to_next_tier: 2 }))).toBe("2 more quests here for Silver");
    expect(nextTierLine(result({ tier: "gold", next_tier: null, quests_to_next_tier: 0 }))).toBe(
      "Gold. You've collected this neighborhood.",
    );
  });

  it("summarizes for screen readers", () => {
    expect(summary(result(), "bronze")).toBe("Checked in. Plus 100 XP. Level 2.");
    expect(summary(result(), null)).toBe("Checked in. Plus 100 XP. First stamp in Chinatown. Level 2.");
    expect(summary(result({ tier: "silver" }), "bronze")).toBe("Checked in. Plus 100 XP. Silver in Chinatown. Level 2.");
  });
});
