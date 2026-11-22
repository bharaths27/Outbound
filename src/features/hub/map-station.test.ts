import { describe, expect, it } from "vitest";
import { fromMapStation } from "./map-station";

describe("fromMapStation", () => {
  it("builds a hub station with no story or neighborhood", () => {
    expect(
      fromMapStation({
        id: "place-aport",
        name: "Airport",
        lines: ["Blue"],
        lat: 42.37,
        lon: -71.03,
      }),
    ).toEqual({
      id: "place-aport",
      name: "Airport",
      lines: ["Blue"],
      lat: 42.37,
      lon: -71.03,
      neighborhood: "",
      story: null,
    });
  });

  it("is null when the map doesn't know the station", () => {
    expect(fromMapStation(undefined)).toBeNull();
  });
});
