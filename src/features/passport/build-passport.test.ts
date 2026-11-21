import { describe, expect, it } from "vitest";
import type { PassportNeighborhood, Quest, Station } from "@/lib/data/types";
import { buildPassport, progressLine } from "./build-passport";

const station = (id: string, name: string, neighborhood: string): Station => ({
  id,
  name,
  lines: ["Red"],
  lat: 42.36,
  lon: -71.06,
  neighborhood,
  story: null,
});
const quest = (id: string, station_id: string): Quest => ({
  id,
  station_id,
  type: "scenic",
  title: id,
  description: null,
  lat: 42.36,
  lon: -71.06,
  price_tier: 0,
  vibe_tags: [],
  hours: "always",
  photo_url: null,
  xp: 50,
  duration_min: 10,
  walk_min: 2,
  checkin_radius_m: 75,
  requires_qr: false,
});

const stations = [
  station("place-kencl", "Kenmore", "Fenway–Kenmore"),
  station("place-bucen", "BU Central", "Fenway–Kenmore"),
  station("place-harsq", "Harvard", "Harvard Square"),
  station("place-chncl", "Chinatown", "Chinatown"),
  station("place-alfcl", "Alewife", "Cambridge"), // no quests
];
const quests = [
  quest("k1", "place-kencl"),
  quest("k2", "place-kencl"),
  quest("b1", "place-bucen"),
  quest("h1", "place-harsq"),
  quest("h2", "place-harsq"),
  quest("c1", "place-chncl"),
  quest("c2", "place-chncl"),
  quest("c3", "place-chncl"),
];
const row = (over: Partial<PassportNeighborhood>): PassportNeighborhood => ({
  user_id: "u",
  neighborhood: "Fenway–Kenmore",
  quests_done: 1,
  tier: "bronze",
  has_cross_school_stamp: false,
  stamps: [],
  next_tier: "silver",
  quests_to_next_tier: 2,
  ...over,
});

describe("buildPassport", () => {
  const rows = [
    row({
      neighborhood: "Fenway–Kenmore",
      quests_done: 2,
      stamps: [
        { quest_id: "k1", at: "2026-11-01T10:00:00Z", cross_school: false },
        { quest_id: "b1", at: "2026-11-03T10:00:00Z", cross_school: true },
        { quest_id: "k1", at: "2026-11-10T10:00:00Z", cross_school: false },
      ],
      quests_to_next_tier: 1,
    }),
    row({
      neighborhood: "Harvard Square",
      stamps: [{ quest_id: "h1", at: "2026-11-05T10:00:00Z", cross_school: false }],
    }),
  ];
  const view = buildPassport(rows, quests, stations);

  it("groups one stamp per quest, newest first, and lists what's left", () => {
    const fk = view.visited.find((v) => v.neighborhood === "Fenway–Kenmore")!;
    expect(fk.earned.map((e) => [e.quest.id, e.visits, e.at, e.crossSchool])).toEqual([
      ["k1", 2, "2026-11-10T10:00:00Z", false],
      ["b1", 1, "2026-11-03T10:00:00Z", true],
    ]);
    expect(fk.locked.map((q) => q.id)).toEqual(["k2"]);
    expect(fk.stations.map((x) => x.name)).toEqual(["Kenmore", "BU Central"]);
    expect(fk.progress).toBeCloseTo(2 / 3);
  });

  it("orders neighborhoods by latest activity", () => {
    expect(view.visited.map((v) => v.neighborhood)).toEqual(["Fenway–Kenmore", "Harvard Square"]);
    expect(view.totalStamps).toBe(3);
  });

  it("lists neighborhoods with quests the player hasn't visited", () => {
    expect(view.unvisited).toEqual([
      { neighborhood: "Chinatown", quests: 3, stations: [{ id: "place-chncl", name: "Chinatown" }] },
    ]);
  });

  it("skips stamps for quests no longer in the content", () => {
    const v = buildPassport([row({ stamps: [{ quest_id: "gone", at: "2026-11-01T00:00:00Z", cross_school: false }] })], quests, stations);
    expect(v.visited[0].earned).toEqual([]);
  });

  it("is empty for a new player", () => {
    const v = buildPassport([], quests, stations);
    expect(v.visited).toEqual([]);
    expect(v.unvisited).toHaveLength(3);
    expect(v.totalStamps).toBe(0);
  });
});

describe("progressLine", () => {
  const base = buildPassport([row({})], quests, stations).visited[0];
  it("says what's next", () => {
    expect(progressLine(base)).toBe("2 more for Silver");
    expect(progressLine({ ...base, nextTier: null, locked: [] })).toBe("Gold. Every quest here collected.");
    expect(progressLine({ ...base, nextTier: null })).toBe("Gold");
  });

  it("is honest when there aren't enough quests left for the next tier", () => {
    expect(progressLine({ ...base, locked: [] })).toBe("Every quest here collected. Silver unlocks as new quests are added.");
    expect(progressLine({ ...base, locked: base.locked.slice(0, 1) })).toBe("1 left here. Silver needs more quests.");
  });
});
