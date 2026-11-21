import { describe, expect, it } from "vitest";
import { parseQuery } from "./fallbackParser";
import { matchesFilters } from "./matchFilters";
import type { Quest } from "@/lib/data/types";

const TAGS = ["cheap", "quick", "spicy", "noodles", "cozy", "late-night", "coffee", "dumplings", "study spot"];

describe("parseQuery", () => {
  it.each([
    ["cheap spicy noodles, 30 min", { craving: "spicy", budget: 1, minutes: 30 }],
    ["free things to do", { craving: "any", budget: 0, minutes: null }],
    ["quick coffee", { craving: "coffee", budget: null, minutes: 30 }],
    ["late night dumpling under $20", { craving: "late-night", budget: 2, minutes: null }],
    ["cozy study spot", { craving: "cozy", budget: null, minutes: null }],
    ["cheap dinner 1.5 hours", { craving: "food", budget: 1, minutes: 90 }],
    ["scenic noodles.", { craving: "noodles", budget: null, minutes: null }],
    ["", { craving: "any", budget: null, minutes: null }],
  ])("parses %j", (query, expected) => {
    expect(parseQuery(query, TAGS)).toEqual(expected);
  });

  it("never uses budget or time words as the craving, even when they are tags", () => {
    expect(parseQuery("cheap quick spicy food", TAGS)).toEqual({ craving: "spicy", budget: 1, minutes: 30 });
  });

  it("takes the lowest budget when words conflict", () => {
    expect(parseQuery("cheap but free", TAGS).budget).toBe(0);
  });
});

describe("matchesFilters", () => {
  const quest = {
    id: "q", station_id: "s", type: "food", title: "t", description: null, lat: 0, lon: 0,
    price_tier: 1, vibe_tags: ["spicy", "late-night"], hours: null, photo_url: null, xp: 50,
    walk_min: 5, duration_min: 30, checkin_radius_m: 75, requires_qr: false,
  } satisfies Quest;

  it("matches a quest type, a vibe tag, or any", () => {
    expect(matchesFilters(quest, { craving: "food", budget: null, minutes: null })).toBe(true);
    expect(matchesFilters(quest, { craving: "scenic", budget: null, minutes: null })).toBe(false);
    expect(matchesFilters(quest, { craving: "late night", budget: null, minutes: null })).toBe(true);
    expect(matchesFilters(quest, { craving: "any", budget: null, minutes: null })).toBe(true);
  });

  it("filters by max price tier", () => {
    expect(matchesFilters(quest, { craving: "any", budget: 1, minutes: null })).toBe(true);
    expect(matchesFilters(quest, { craving: "any", budget: 0, minutes: null })).toBe(false);
  });

  it("applies the backend time rule: ride + 2 x walk + time at the spot", () => {
    // 0 ride + 2 x 5 walk + 30 at the spot = 40 minutes
    expect(matchesFilters(quest, { craving: "any", budget: null, minutes: 40 })).toBe(true);
    expect(matchesFilters(quest, { craving: "any", budget: null, minutes: 39 })).toBe(false);
    expect(matchesFilters(quest, { craving: "any", budget: null, minutes: 60 }, { rideMin: 20 })).toBe(true);
    expect(matchesFilters(quest, { craving: "any", budget: null, minutes: 60 }, { rideMin: 21 })).toBe(false);
  });
});
