import { describe, expect, it } from "vitest";
import { parseTakeoutReviews } from "./takeout";

const geo = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-71.0589, 42.3601] },
      properties: {
        date: "2025-10-04T19:02:11.000Z",
        five_star_rating_published: 5,
        review_text_published: "Best dumplings in Chinatown",
        location: { name: "Gene's Chinese Flatbread", address: "86 Bedford St, Boston, MA", country_code: "US" },
      },
    },
    { type: "Feature", properties: { five_star_rating_published: 4, location: { name: "No text place" }, date: "2024-01-02T00:00:00Z" } },
    { type: "Feature", properties: { location: { name: "No rating" } } },
  ],
};

describe("parseTakeoutReviews", () => {
  it("reads the current GeoJSON layout", () => {
    const r = parseTakeoutReviews(JSON.stringify(geo));
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      name: "Gene's Chinese Flatbread",
      address: "86 Bedford St, Boston, MA",
      lat: 42.3601,
      lon: -71.0589,
      stars: 5,
      text: "Best dumplings in Chinatown",
      date: "2025-10-04",
    });
    expect(r[1].text).toBe("");
  });

  it("reads the older layout", () => {
    const old = {
      type: "FeatureCollection",
      features: [
        {
          properties: {
            Published: "2021-06-01T12:00:00Z",
            "Star Rating": 3,
            "Review Comment": "ok",
            Location: { "Business Name": "Tatte", Address: "Boston", "Geo Coordinates": { Latitude: "42.35", Longitude: "-71.07" } },
          },
        },
      ],
    };
    const [r] = parseTakeoutReviews(JSON.stringify(old));
    expect(r.name).toBe("Tatte");
    expect(r.stars).toBe(3);
    expect(r.lat).toBe(42.35);
    expect(r.date).toBe("2021-06-01");
  });

  it("explains bad files", () => {
    expect(() => parseTakeoutReviews("not json")).toThrow(/isn't JSON/);
    expect(() => parseTakeoutReviews('{"hello":1}')).toThrow(/No reviews found/);
  });
});
