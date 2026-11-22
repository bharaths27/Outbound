import { describe, expect, it } from "vitest";
import { parseRideTimes } from "./ride-time";

describe("parseRideTimes", () => {
  it("keeps the station minutes from /api/ride-times", () => {
    expect(parseRideTimes({ from: [42.35, -71.1], minutes: { "place-kencl": 9, "place-pktrm": 14 } })).toEqual({
      "place-kencl": 9,
      "place-pktrm": 14,
    });
  });
  it("drops bad values and treats errors as no data", () => {
    expect(parseRideTimes({ minutes: { a: -1, b: "x", c: 3 } })).toEqual({ c: 3 });
    expect(parseRideTimes({ error: "from must be lat,lng" })).toBeNull();
    expect(parseRideTimes(null)).toBeNull();
  });
});
