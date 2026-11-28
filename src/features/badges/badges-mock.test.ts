// Badges end to end against the mock backend: check-ins earn them, and the unlock logic
// reports each one exactly once.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { mockService as d } from "@/lib/data/mock";
import { newlyEarned } from "./unlock";

describe("badges from check-ins (mock backend)", () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T15:00:00-05:00")); // a Tuesday afternoon in Boston
    await d.signInDemo("demo-sam");
  });

  it("a brand-new player starts with no badges", async () => {
    const p = await d.getGameProgress();
    expect(p?.badges).toEqual([]);
  });

  it("First Stop after the first check-in; reported once", async () => {
    const seen = (await d.getGameProgress())!.badges;
    expect((await d.checkIn("harvard-yard-gate", null, {})).ok).toBe(true);
    const p = (await d.getGameProgress())!;
    expect(newlyEarned(seen, p.badges)).toEqual(["first_stop"]);
    expect(newlyEarned(p.badges, p.badges)).toEqual([]); // not again
  }, 30000);

  it("Line Collector needs Red, Orange, Green and Blue; Cross-Town lands with the 4th neighborhood", async () => {
    for (const q of ["chinatown-gate-details", "marsh-plaza-details"]) expect((await d.checkIn(q, null, {})).ok).toBe(true);
    const before = (await d.getGameProgress())!.badges;
    expect(before).not.toContain("line_collector"); // no Blue yet
    expect(before).not.toContain("cross_town"); // 3 neighborhoods this week

    expect((await d.checkIn("quincy-market-snack", null, {})).ok).toBe(true); // Blue, Downtown
    const after = (await d.getGameProgress())!.badges;
    expect(newlyEarned(before, after).sort()).toEqual(["cross_town", "line_collector"]);
  }, 30000);

  it("Night Owl takes 3 different late nights, so one is not enough", async () => {
    vi.setSystemTime(new Date("2026-11-24T22:30:00-05:00"));
    expect((await d.checkIn("harvard-art-courtyard", null, {})).ok).toBe(true);
    expect((await d.getGameProgress())!.badges).not.toContain("night_owl");
  }, 30000);
});
