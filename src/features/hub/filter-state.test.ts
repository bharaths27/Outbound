import { describe, expect, it } from "vitest";
import type { Quest } from "@/lib/data/types";
import {
  EMPTY_FILTERS,
  activeCount,
  applyFilters,
  cravingLabel,
  cravingOptions,
  fromParsed,
  minutesLabel,
  resultLabel,
} from "./filter-state";

const quest = (over: Partial<Quest>): Quest => ({
  id: "q",
  station_id: "place-test",
  type: "food",
  title: "Test",
  description: null,
  lat: 0,
  lon: 0,
  price_tier: 1,
  vibe_tags: [],
  hours: "always",
  photo_url: null,
  xp: 40,
  duration_min: 20,
  walk_min: 5,
  ...over,
});

const noodles = quest({ id: "noodles", vibe_tags: ["spicy", "noodles", "cheap"], hours: "11:00-22:00" });
const slice = quest({ id: "slice", vibe_tags: ["pizza", "late-night", "cheap"], hours: "11:00-02:00", duration_min: 15, walk_min: 2 });
const tour = quest({ id: "tour", type: "event", price_tier: 3, vibe_tags: ["history"], hours: "10:00-17:00", duration_min: 75 });
const park = quest({ id: "park", type: "scenic", price_tier: 0, vibe_tags: ["outdoors"], hours: null });
const all = [noodles, slice, tour, park];

const nov = (hhmm: string) => new Date(`2026-11-21T${hhmm}:00-05:00`);

describe("applyFilters", () => {
  it("returns everything with no filters", () => {
    expect(applyFilters(all, EMPTY_FILTERS, nov("12:00"))).toEqual(all);
  });

  it("filters by quest type or by vibe tag (single craving)", () => {
    const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
      applyFilters(all, { ...EMPTY_FILTERS, ...f }, nov("12:00")).map((q) => q.id);
    expect(ids({ craving: "event" })).toEqual(["tour"]);
    expect(ids({ craving: "late night" })).toEqual(["slice"]);
    expect(ids({ craving: "cheap" })).toEqual(["noodles", "slice"]);
  });

  it("combines budget and time with the backend's time rule", () => {
    // 2*walk + duration: noodles 30, slice 19, tour 85, park 30
    const ids = applyFilters(all, { ...EMPTY_FILTERS, budget: 1, minutes: 30 }, nov("12:00")).map((q) => q.id);
    expect(ids).toEqual(["noodles", "slice", "park"]);
  });

  it("open now hides closed places but keeps ones with unknown hours", () => {
    const ids = applyFilters(all, { ...EMPTY_FILTERS, openNow: true }, nov("23:30")).map((q) => q.id);
    expect(ids).toEqual(["slice", "park"]);
  });
});

describe("cravingOptions", () => {
  it("lists types, then the most common tags", () => {
    const values = cravingOptions(all, "any", 2).map((o) => o.value);
    expect(values).toEqual(["food", "event", "scenic", "cheap", "history"]);
  });

  it("puts an active craving that isn't in the top tags first", () => {
    const opts = cravingOptions(all, "late-night", 1);
    expect(opts.map((o) => o.value)).toEqual(["food", "event", "scenic", "late-night", "cheap"]);
    expect(opts[3].label).toBe("Late night");
  });

  it("doesn't duplicate a type or an already-listed tag", () => {
    expect(cravingOptions(all, "food", 1)).toHaveLength(4);
    expect(cravingOptions(all, "Cheap", 1)).toHaveLength(4);
  });
});

describe("helpers", () => {
  it("applies parsed search filters but keeps open now", () => {
    const next = fromParsed({ ...EMPTY_FILTERS, openNow: true, budget: 3 }, { craving: "spicy", budget: null, minutes: 30 });
    expect(next).toEqual({ craving: "spicy", budget: null, minutes: 30, openNow: true });
  });

  it("counts active filters", () => {
    expect(activeCount(EMPTY_FILTERS)).toBe(0);
    expect(activeCount({ craving: "food", budget: 0, minutes: 60, openNow: true })).toBe(4);
  });

  it("labels things", () => {
    expect(cravingLabel("scenic")).toBe("Scenic");
    expect(cravingLabel("photo-spot")).toBe("Photo spot");
    expect(minutesLabel(60)).toBe("1 hr");
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(180)).toBe("3 hr");
    expect(resultLabel(0)).toBe("No quests");
    expect(resultLabel(1)).toBe("1 quest");
    expect(resultLabel(8)).toBe("8 quests");
  });
});
