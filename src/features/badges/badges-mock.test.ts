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

  it("Line Collector after Red, Orange and Green; reported once", async () => {
    let seen: string[] = (await d.getGameProgress())!.badges;
    for (const q of ["harvard-yard-gate", "chinatown-gate-details"]) {
      const r = await d.checkIn(q, null, {});
      expect(r.ok).toBe(true);
    }
    let p = (await d.getGameProgress())!;
    expect(p.badges).not.toContain("line_collector");
    expect(newlyEarned(seen, p.badges)).toEqual([]);
    seen = p.badges;

    expect((await d.checkIn("marsh-plaza-details", null, {})).ok).toBe(true);
    p = (await d.getGameProgress())!;
    expect(p.badges).toContain("line_collector");
    expect(newlyEarned(seen, p.badges)).toEqual(["line_collector"]);
    expect(newlyEarned(p.badges, p.badges)).toEqual([]); // not again
  }, 30000);

  it("Cross-Town after a 4th neighborhood in the same week", async () => {
    const before = (await d.getGameProgress())!.badges;
    expect(before).not.toContain("cross_town");
    expect((await d.checkIn("quincy-market-snack", null, {})).ok).toBe(true);
    const after = (await d.getGameProgress())!.badges;
    expect(after).toContain("cross_town");
    expect(newlyEarned(before, after)).toEqual(["cross_town"]);
  }, 30000);

  it("Night Owl only after 10 PM", async () => {
    vi.setSystemTime(new Date("2026-11-24T22:30:00-05:00"));
    const before = (await d.getGameProgress())!.badges;
    expect(before).not.toContain("night_owl");
    expect((await d.checkIn("harvard-art-courtyard", null, {})).ok).toBe(true);
    expect((await d.getGameProgress())!.badges).toContain("night_owl");
  }, 30000);
});
