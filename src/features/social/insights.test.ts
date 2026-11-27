import { describe, expect, it } from "vitest";
import type { Review, Visit } from "@/lib/data/types";
import { calendar, insights, monthCounts, scoreTone, shiftMonth } from "./insights";

const v = (quest_id: string, visit_date: string): Visit => ({
  id: 0, user_id: "u", quest_id, squad_id: null, checked_in_at: `${visit_date}T15:00:00Z`, visit_date, xp_awarded: 10, cross_school: false, hidden: false,
});
const r = (quest_id: string | null, rating: number, visited_on = "2026-11-03", place_name = "P"): Review => ({
  id: `${quest_id}-${rating}`, user_id: "u", quest_id, place_name, place_address: null, lat: null, lon: null, rating, note: "", visited_on,
  source: quest_id ? "outbound" : "google", created_at: `${visited_on}T10:00:00Z`,
});
const hood: Record<string, string> = { a: "Back Bay", b: "Chinatown", c: "Back Bay" };

describe("insights", () => {
  const visits = [v("a", "2026-11-02"), v("a", "2026-11-09"), v("b", "2026-11-20"), v("c", "2026-10-30")];
  const reviews = [r("a", 9.1), r("b", 6.4), r(null, 8, "2026-11-12", "Tatte")];
  const i = insights(visits, reviews, (q) => hood[q] ?? null, "2026-11");

  it("counts distinct places this month and overall (imports included)", () => {
    expect(i.placesThisMonth).toBe(3); // a, b, Tatte
    expect(i.placesAllTime).toBe(4); // a, b, c, Tatte
    expect(i.checkIns).toBe(4);
  });
  it("counts neighborhoods and finds the favorite", () => {
    expect(i.neighborhoods).toBe(2);
    expect(i.neighborhoodsThisMonth).toBe(2);
    expect(i.topNeighborhood).toEqual({ name: "Back Bay", count: 3 });
  });
  it("averages ratings and sorts the top rated", () => {
    expect(i.avgRating).toBe(7.8);
    expect(i.topRated.map((x) => x.rating)).toEqual([9.1, 8, 6.4]);
  });
  it("handles an empty profile", () => {
    const e = insights([], [], () => null, "2026-11");
    expect(e).toMatchObject({ placesAllTime: 0, avgRating: null, topNeighborhood: null });
  });
});

describe("months and calendar", () => {
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
  });
  it("counts places per month", () => {
    const c = monthCounts([v("a", "2026-11-02"), v("a", "2026-11-03"), v("b", "2026-09-01")], [], "2026-11", 3);
    expect(c.map((x) => [x.key, x.count])).toEqual([["2026-09", 1], ["2026-10", 0], ["2026-11", 1]]);
  });
  it("lays out November 2026 starting on a Sunday", () => {
    const cells = calendar([v("a", "2026-11-26")], "2026-11");
    expect(cells[0]?.day).toBe(1); // Nov 1, 2026 is a Sunday
    expect(cells.filter(Boolean)).toHaveLength(30);
    expect(cells.find((c) => c?.day === 26)?.visits).toHaveLength(1);
  });
  it("colors scores like Beli", () => {
    expect([scoreTone(9), scoreTone(7), scoreTone(4)]).toEqual(["high", "mid", "low"]);
  });
});
