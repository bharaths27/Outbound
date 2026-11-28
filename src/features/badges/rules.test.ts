import { describe, expect, it } from "vitest";
import { type BadgeVisit, earnedBadges } from "./rules";

let n = 0;
const v = (o: Partial<BadgeVisit> & { at?: string }): BadgeVisit => {
  const at = o.at ?? "2026-11-24T15:00:00-05:00";
  return {
    quest_id: o.quest_id ?? `q${n++}`,
    station_lines: o.station_lines ?? ["Red"],
    neighborhood: o.neighborhood ?? "Downtown",
    checked_in_at: new Date(at).toISOString(),
    visit_date: at.slice(0, 10),
    squad_id: o.squad_id ?? null,
    cross_school: o.cross_school ?? false,
  };
};
const base = { questsPerNeighborhood: { Downtown: 10, Chinatown: 4 }, reviews: [], longestStreak: 0 };

describe("badge rules", () => {
  it("First Stop on the first check-in, nothing else", () => {
    expect(earnedBadges({ ...base, visits: [v({})] })).toEqual(["first_stop"]);
  });
  it("Line Collector needs all four lines, Blue included", () => {
    const three = ["Red", "Orange", "Green-B"].map((l) => v({ station_lines: [l] }));
    expect(earnedBadges({ ...base, visits: three })).not.toContain("line_collector");
    expect(earnedBadges({ ...base, visits: [...three, v({ station_lines: ["Blue"] })] })).toContain("line_collector");
  });
  it("Night Owl needs 3 different nights after 10 PM", () => {
    const twoSameNight = [v({ at: "2026-11-20T22:30:00-05:00" }), v({ at: "2026-11-20T23:10:00-05:00" }), v({ at: "2026-11-21T22:05:00-05:00" })];
    expect(earnedBadges({ ...base, visits: twoSameNight })).not.toContain("night_owl");
    expect(earnedBadges({ ...base, visits: [...twoSameNight, v({ at: "2026-11-22T23:00:00-05:00" })] })).toContain("night_owl");
  });
  it("Early Bird needs 3 mornings before 8 AM", () => {
    const m = ["2026-11-18", "2026-11-19", "2026-11-20"].map((d) => v({ at: `${d}T07:15:00-05:00` }));
    expect(earnedBadges({ ...base, visits: m })).toContain("early_bird");
  });
  it("Cross-Town: 4 neighborhoods in the same week, not spread over two", () => {
    const hoods = ["A", "B", "C"].map((h) => v({ neighborhood: h, at: "2026-11-24T12:00:00-05:00" }));
    expect(earnedBadges({ ...base, visits: [...hoods, v({ neighborhood: "D", at: "2026-12-02T12:00:00-05:00" })] })).not.toContain("cross_town");
    expect(earnedBadges({ ...base, visits: [...hoods, v({ neighborhood: "D", at: "2026-11-27T12:00:00-05:00" })] })).toContain("cross_town");
  });
  it("Squad Goals: 3 different quests with a squad", () => {
    const sq = [0, 1, 2].map(() => v({ squad_id: "s1" }));
    expect(earnedBadges({ ...base, visits: sq.slice(0, 2) })).not.toContain("squad_goals");
    expect(earnedBadges({ ...base, visits: sq })).toContain("squad_goals");
  });
  it("Critic and Taste Maker come from reviews", () => {
    const reviews = Array.from({ length: 10 }, (_, i) => ({ note: i === 0 ? "" : "great", likes: i === 3 ? 10 : 2 }));
    const got = earnedBadges({ ...base, visits: [], reviews });
    expect(got).not.toContain("critic"); // only 9 have notes
    expect(got).toContain("taste_maker");
    expect(earnedBadges({ ...base, visits: [], reviews: [...reviews, { note: "x", likes: 0 }] })).toContain("critic");
  });
  it("streak badges at 7 and 30 days", () => {
    expect(earnedBadges({ ...base, visits: [], longestStreak: 7 })).toEqual(["week_on_the_t"]);
    expect(earnedBadges({ ...base, visits: [], longestStreak: 30 })).toEqual(["week_on_the_t", "month_on_the_t"]);
  });
  it("Green Line Veteran needs solo stations on B, C, D and E", () => {
    const shared = v({ station_lines: ["Green-B", "Green-C", "Green-D", "Green-E"] }); // Copley doesn't count
    const solos = ["B", "C", "D"].map((b) => v({ station_lines: [`Green-${b}`] }));
    expect(earnedBadges({ ...base, visits: [shared, ...solos] })).not.toContain("green_line_veteran");
    expect(earnedBadges({ ...base, visits: [...solos, v({ station_lines: ["Green-E"] })] })).toContain("green_line_veteran");
  });
  it("Bridge Builder: 5 cross-school check-ins", () => {
    expect(earnedBadges({ ...base, visits: Array.from({ length: 5 }, () => v({ cross_school: true })) })).toContain("bridge_builder");
  });
  it("Weekly Regular: Quest of the Week 4 weeks in a row", () => {
    const run = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"];
    expect(earnedBadges({ ...base, visits: [], questOfWeekWeeks: run })).toContain("weekly_regular");
    expect(earnedBadges({ ...base, visits: [], questOfWeekWeeks: [run[0], run[1], run[3]] })).not.toContain("weekly_regular");
  });
  it("Passport Complete and Boston Local follow neighborhood tiers", () => {
    const pc = [v({ neighborhood: "Downtown" }), v({ neighborhood: "Chinatown" })];
    expect(earnedBadges({ ...base, visits: pc })).toContain("passport_complete");
    const gold = ["A", "B", "C"].flatMap((h) => Array.from({ length: 5 }, () => v({ neighborhood: h })));
    expect(earnedBadges({ ...base, visits: gold })).toContain("boston_local");
  });
});
