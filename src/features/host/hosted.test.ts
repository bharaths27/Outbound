import { describe, expect, it } from "vitest";
import { sampleReviews, spotKind } from "@/lib/sample-places";
import { eventMapHref, eventStatus, whenText } from "./hosted";

const at = (h: number, m = 0) => new Date(2026, 10, 22, h, m).toISOString();

describe("hosted events", () => {
  const now = new Date(2026, 10, 22, 19, 0);
  it("knows if an event is on now, soon, later or over", () => {
    expect(eventStatus({ starts_at: at(18), ends_at: at(21) }, now)).toBe("now");
    expect(eventStatus({ starts_at: at(20), ends_at: at(22) }, now)).toBe("soon");
    expect(eventStatus({ starts_at: at(23), ends_at: at(23, 30) }, now)).toBe("later");
    expect(eventStatus({ starts_at: at(12), ends_at: at(14) }, now)).toBe("ended");
  });
  it("says when in plain words", () => {
    expect(whenText({ starts_at: at(18), ends_at: at(21) }, now)).toBe("Happening now, until 9:00 PM");
    expect(whenText({ starts_at: at(20), ends_at: at(22) }, now)).toBe("Today 8:00 PM to 10:00 PM");
  });
  it("links to the event on the map", () => {
    expect(eventMapHref({ id: "ev-1", title: "Demo Night", lat: 42.3505, lon: -71.1035 })).toBe("/?go=42.35050,-71.10350&name=Demo%20Night&event=ev-1");
  });
});

describe("sample place info", () => {
  it("maps basemap classes to kinds", () => {
    expect(spotKind("pub")).toBe("bar");
    expect(spotKind("cafe")).toBe("cafe");
    expect(spotKind("shop")).toBe("place");
    expect(spotKind(undefined)).toBe("place");
  });
  it("gives the same sample reviews for a place every time, rated 3.6 to 4.8", () => {
    const a = sampleReviews("Flour Bakery", "bakery");
    expect(sampleReviews("Flour Bakery", "bakery")).toEqual(a);
    expect(a.reviews).toHaveLength(3);
    expect(a.rating).toBeGreaterThanOrEqual(3.6);
    expect(a.rating).toBeLessThanOrEqual(4.8);
    for (const r of a.reviews) expect(r.stars).toBeGreaterThanOrEqual(3);
  });
});
