import { describe, expect, it, vi } from "vitest";
import type { GuideQuest } from "@/lib/guide";

const QUESTS: GuideQuest[] = [
  { id: "tatte-fenway-pastry", title: "Fenway Pastry Pick", type: "food", description: "Pick a pastry at Tatte", price_tier: 1, vibe_tags: ["pastry", "coffee"], hours: "Mon-Sat 07:00-20:00", xp: 60, duration_min: 20, walk_min: 8, station_id: "place-kencl", stations: { name: "Kenmore", lines: ["Green-B"], neighborhood: "Fenway-Kenmore" } },
  { id: "kenmore-citgo-angle", title: "Kenmore Sign Hunt", type: "scenic", description: "Citgo sign photo", price_tier: 0, vibe_tags: ["photo"], hours: "always", xp: 50, duration_min: 10, walk_min: 2, station_id: "place-kencl", stations: { name: "Kenmore", lines: ["Green-B"], neighborhood: "Fenway-Kenmore" } },
  { id: "north-end-cannoli", title: "Cannoli Run", type: "food", description: "Cannoli in the North End", price_tier: 1, vibe_tags: ["dessert"], hours: "always", xp: 60, duration_min: 30, walk_min: 6, station_id: "place-haecl", stations: { name: "Haymarket", lines: ["Orange"], neighborhood: "North End" } },
];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ data: QUESTS, error: null }) }) }) }),
}));

import { filterQuests, makeTools, splitReply } from "./planner";

describe("filterQuests", () => {
  it("filters by type, price, time and station", () => {
    expect(filterQuests(QUESTS, { type: "food", station: "kenmore" }).map((q) => q.id)).toEqual(["tatte-fenway-pastry"]);
    expect(filterQuests(QUESTS, { maxPriceTier: 0 }).map((q) => q.id)).toEqual(["kenmore-citgo-angle"]);
    expect(filterQuests(QUESTS, { maxMinutes: 20 }).map((q) => q.id)).toEqual(["kenmore-citgo-angle"]);
    expect(filterQuests(QUESTS, { station: "north end" }).map((q) => q.id)).toEqual(["north-end-cannoli"]);
  });
  it("keywords must match something", () => {
    expect(filterQuests(QUESTS, { keywords: ["coffee"] }).map((q) => q.id)).toEqual(["tatte-fenway-pastry"]);
    expect(filterQuests(QUESTS, { keywords: ["pizza"] })).toEqual([]);
  });
});

describe("splitReply", () => {
  it("pulls known quest ids off the last line", () => {
    const r = splitReply("Go to Kenmore.\nQUESTS: tatte-fenway-pastry, made-up-id", QUESTS);
    expect(r.reply).toBe("Go to Kenmore.");
    expect(r.quests.map((q) => q.id)).toEqual(["tatte-fenway-pastry"]);
  });
  it("keeps the reply when there is no QUESTS line", () => {
    expect(splitReply("Nothing fits.", QUESTS)).toEqual({ reply: "Nothing fits.", quests: [] });
  });
});

describe("tools", () => {
  it("call our own APIs", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk";
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.includes("/api/trains")
        ? { arrivals: [{ route: "Green-B", minutes: 3, status: null, extra: 1 }] }
        : { lines: [{ badge: "Green Line +4 min" }] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const tools = makeTools("http://localhost:3000");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const run = (t: any, input: unknown) => t.execute(input, {});
    expect((await run(tools.searchQuests, { type: "food", station: "Kenmore" })).quests[0].id).toBe("tatte-fenway-pastry");
    expect(await run(tools.nextTrains, { stationId: "place-kencl" })).toEqual({ arrivals: [{ route: "Green-B", minutes: 3, status: null }] });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/api/trains?stop=place-kencl");
    expect(await run(tools.lineDelays, {})).toEqual({ lines: ["Green Line +4 min"] });
    vi.unstubAllGlobals();
  });
});
