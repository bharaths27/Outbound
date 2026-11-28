import { describe, expect, it } from "vitest";
import { SEASONS, seasonalStamps } from "./seasonal";

const by = (views: ReturnType<typeof seasonalStamps>, id: string) => views.find((v) => v.season.id === id)!;

describe("seasonal stamps", () => {
  it("needs 3 different days inside the window", () => {
    const two = seasonalStamps(["2026-10-05", "2026-10-05", "2026-10-09"], "2026-11-26");
    expect(by(two, "fall_foliage").earned).toBe(false);
    const three = seasonalStamps(["2026-10-05", "2026-10-09", "2026-11-14"], "2026-11-26");
    expect(by(three, "fall_foliage").earned).toBe(true);
    expect(by(three, "fall_foliage").earnedOn).toBe("2026-11-14");
  });

  it("ignores days outside the window", () => {
    const v = seasonalStamps(["2026-09-30", "2026-10-02", "2026-11-16", "2026-11-20"], "2026-11-26");
    expect(by(v, "fall_foliage").earned).toBe(false);
  });

  it("winter lights wraps into January", () => {
    const v = seasonalStamps(["2026-12-20", "2026-12-31", "2027-01-10"], "2027-01-20");
    expect(by(v, "winter_lights").earned).toBe(true);
  });

  it("does not mix two different years", () => {
    const v = seasonalStamps(["2025-10-05", "2025-10-06", "2026-10-07"], "2026-11-26");
    expect(by(v, "fall_foliage").earned).toBe(false);
  });

  it("knows the Head of the Charles and Marathon windows", () => {
    const hocr = SEASONS.find((s) => s.id === "head_of_the_charles")!.window(2026);
    expect(hocr).toEqual(["2026-10-10", "2026-10-19"]); // third Saturday is Oct 17
    const marathon = SEASONS.find((s) => s.id === "marathon_monday")!.window(2026);
    expect(marathon).toEqual(["2026-04-16", "2026-04-26"]); // Patriots' Day is Apr 20
  });

  it("marks the live season and counts days so far", () => {
    const v = seasonalStamps(["2026-11-02", "2026-11-10"], "2026-11-12");
    expect(by(v, "fall_foliage").live).toBe(true);
    expect(by(v, "fall_foliage").daysThisWindow).toBe(2);
    expect(by(v, "winter_lights").live).toBe(false);
  });
});
