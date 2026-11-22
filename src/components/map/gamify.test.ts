import { describe, expect, it } from "vitest";
import { placePoints } from "./gamify";

// Same cases as the SQL check of place_points() in 009_place_points.sql.
describe("place points", () => {
  it("matches the database", () => {
    expect(placePoints("restaurant", 22)).toMatchObject({ base: 10, distanceXp: 18, budgetXp: 5, total: 35 });
    expect(placePoints("park", 0)).toMatchObject({ base: 15, distanceXp: 0, budgetXp: 15, total: 30 });
    expect(placePoints("cafe", 200)).toMatchObject({ base: 5, distanceXp: 40, budgetXp: 10, total: 55 });
    expect(placePoints("bar", 0).total).toBe(10);
  });
});
