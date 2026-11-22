import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NO_EXPLORE_FILTERS,
  getExploreFilters,
  hasExploreFilters,
  setExploreFilters,
  moreFilterCount,
  servesLine,
  subscribeExploreFilters,
} from "./explore-filters";

afterEach(() => setExploreFilters(NO_EXPLORE_FILTERS));

describe("Explore filters", () => {
  it("start empty", () => {
    expect(getExploreFilters()).toEqual(NO_EXPLORE_FILTERS);
    expect(hasExploreFilters()).toBe(false);
  });

  it("merge patches and notify subscribers", () => {
    const listener = vi.fn();
    const off = subscribeExploreFilters(listener);
    setExploreFilters({ craving: "food" });
    setExploreFilters({ budget: 1 });
    expect(getExploreFilters()).toEqual({ ...NO_EXPLORE_FILTERS, craving: "food", budget: 1 });
    expect(hasExploreFilters()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    setExploreFilters({ minutes: 60 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("count the map-only extras and match lines", () => {
    setExploreFilters({ line: "Green", openNow: true });
    expect(moreFilterCount()).toBe(2);
    expect(hasExploreFilters()).toBe(true);
    expect(servesLine(["Green-B"], "Green")).toBe(true);
    expect(servesLine(["Mattapan"], "Red")).toBe(true);
    expect(servesLine(["Orange"], "Red")).toBe(false);
    expect(servesLine(["Orange"], "any")).toBe(true);
  });
});
