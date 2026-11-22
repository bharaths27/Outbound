import { describe, expect, it } from "vitest";
import type { Quest, Visit } from "@/lib/data/types";
import { bostonDateKey, bostonWeekStart, dailyEligible, doneToday, pickDailyQuests, xpToday } from "./daily";

function quest(id: string, station_id: string, type: Quest["type"]): Quest {
  return {
    id,
    station_id,
    type,
    title: id,
    description: null,
    lat: 0,
    lon: 0,
    price_tier: 1,
    vibe_tags: [],
    hours: null,
    photo_url: null,
    xp: 100,
    checkin_radius_m: 75,
    requires_qr: false,
    duration_min: 30,
    walk_min: 5,
  };
}

const QUESTS: Quest[] = [
  quest("a", "s1", "food"),
  quest("b", "s1", "event"),
  quest("c", "s2", "scenic"),
  quest("d", "s3", "food"),
  quest("e", "s4", "food"),
  quest("f", "s5", "event"),
  quest("g", "s6", "scenic"),
  quest("h", "s6", "food"),
];

describe("pickDailyQuests", () => {
  it("is stable for a date and returns 5 distinct quests", () => {
    const a = pickDailyQuests(QUESTS, "2026-11-21");
    const b = pickDailyQuests([...QUESTS].reverse(), "2026-11-21");
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(new Set(a.map((q) => q.id)).size).toBe(5);
  });

  it("covers every category and avoids repeating a station when it can", () => {
    for (const day of ["2026-11-21", "2026-11-22", "2026-12-01"]) {
      const picks = pickDailyQuests(QUESTS, day);
      expect(new Set(picks.map((q) => q.type))).toEqual(new Set(["food", "event", "scenic"]));
      expect(new Set(picks.map((q) => q.station_id)).size).toBe(5);
    }
  });

  it("returns what exists when there are fewer quests than the count", () => {
    expect(pickDailyQuests(QUESTS.slice(0, 2), "2026-11-21")).toHaveLength(2);
    expect(pickDailyQuests([], "2026-11-21")).toEqual([]);
  });
});

describe("bostonDateKey", () => {
  it("uses Boston's date, not UTC", () => {
    // 03:00 UTC on Nov 22 is still Nov 21 in Boston.
    expect(bostonDateKey(new Date("2026-11-22T03:00:00Z"))).toBe("2026-11-21");
    expect(bostonDateKey(new Date("2026-11-22T06:00:00Z"))).toBe("2026-11-22");
  });
});

describe("doneToday", () => {
  it("counts only visits on that date", () => {
    const v = (quest_id: string, visit_date: string) => ({ quest_id, visit_date }) as Visit;
    expect([...doneToday([v("a", "2026-11-21"), v("b", "2026-11-20")], "2026-11-21")]).toEqual(["a"]);
  });
});

describe("dailyEligible", () => {
  // Sunday Nov 22, 2026, noon in Boston.
  const sunday = new Date("2026-11-22T17:00:00Z");

  it("skips quests that need a code", () => {
    const qr = { ...quest("qr", "s1", "event"), requires_qr: true };
    expect(dailyEligible([qr, quest("a", "s2", "food")], sunday).map((q) => q.id)).toEqual(["a"]);
  });

  it("skips places with no hours that day, keeps unknown and always-open", () => {
    const weekdays = { ...quest("wk", "s1", "food"), hours: "Mon-Fri 09:00-17:00" };
    const sundayOnly = { ...quest("sun", "s2", "food"), hours: "Sun 10:00-14:00" };
    const always = { ...quest("all", "s3", "scenic"), hours: "always" };
    const unknown = quest("unk", "s4", "scenic");
    expect(dailyEligible([weekdays, sundayOnly, always, unknown], sunday).map((q) => q.id)).toEqual([
      "sun",
      "all",
      "unk",
    ]);
  });
});

describe("xpToday", () => {
  it("sums xp_awarded from that date's visits", () => {
    const v = (xp_awarded: number, visit_date: string) => ({ xp_awarded, visit_date }) as Visit;
    expect(xpToday([v(72, "2026-11-21"), v(120, "2026-11-21"), v(50, "2026-11-20")], "2026-11-21")).toBe(192);
  });
});

describe("bostonWeekStart", () => {
  it("returns that week's Monday", () => {
    expect(bostonWeekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(bostonWeekStart("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(bostonWeekStart("2026-11-18")).toBe("2026-11-16");
  });
});
