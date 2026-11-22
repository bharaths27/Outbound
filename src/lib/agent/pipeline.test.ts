// End-to-end test of the Guide pipeline with fake Grok, fake Gemini and fake APIs:
// real Mastra workflows, agents, tool calls and the Report tool run for real.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuideQuest } from "@/lib/guide";

const QUESTS: GuideQuest[] = [
  { id: "tatte-fenway-pastry", title: "Fenway Pastry Pick", type: "food", description: "Pick a pastry at Tatte", price_tier: 1, vibe_tags: ["pastry", "coffee"], hours: "always", xp: 60, duration_min: 20, walk_min: 8, station_id: "place-kencl", stations: { name: "Kenmore", lines: ["Green-B"], neighborhood: "Fenway-Kenmore" } },
  { id: "kenmore-citgo-angle", title: "Kenmore Sign Hunt", type: "scenic", description: "Citgo sign photo", price_tier: 0, vibe_tags: ["photo"], hours: "always", xp: 50, duration_min: 10, walk_min: 2, station_id: "place-kencl", stations: { name: "Kenmore", lines: ["Green-B"], neighborhood: "Fenway-Kenmore" } },
];
const STATIONS = [{ id: "place-kencl", name: "Kenmore", lines: ["Green-B"], lat: 42.3489, lon: -71.0951, neighborhood: "Fenway-Kenmore" }];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({ select: () => ({ limit: async () => ({ data: table === "stations" ? STATIONS : QUESTS, error: null }) }) }),
  }),
}));

// Fake Gemini: answers by agent, based on its system prompt and how many times it was called.
const calls: Record<string, number> = {};
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const text = (t: string) => ({ content: [{ type: "text", text: t }], finishReason: "stop", usage, warnings: [] });
const tool = (name: string, input: unknown) => ({
  content: [{ type: "tool-call", toolCallId: `${name}-${Math.random()}`, toolName: name, input: JSON.stringify(input) }],
  finishReason: "tool-calls", usage, warnings: [],
});
const REPORT = {
  title: "Pastry run on the Green Line", summary: "Grab a pastry at Tatte near Kenmore.",
  steps: ["Ride the Green Line B to Kenmore", "Walk 8 minutes to Tatte"],
  picks: [{ questId: "tatte-fenway-pastry", why: "Matches your croissant" }, { questId: "made-up", why: "x" }],
  places: [{ name: "Flour Bakery", note: "Sticky buns", rating: 4.7, price: "$$", openNow: true, nearStation: "Kenmore" }],
  transit: { station: "Kenmore", line: "Green-B", nextTrainMin: 3, delay: "Green Line +4 min" },
  tips: ["Go before 7 PM"],
};
function fakeGemini() {
  return {
    specificationVersion: "v2", provider: "fake", modelId: "fake", supportedUrls: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: async (options: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const system = JSON.stringify(options.prompt.filter((m: any) => m.role === "system"));
      const who = system.includes("Food Researcher") ? "food" : system.includes("Trip Planner") ? "trip" : system.includes("Report Writer") || system.includes("structured answer") ? "report" : "other";
      calls[who] = (calls[who] ?? 0) + 1;
      if (who === "food") return calls.food === 1 ? tool("findFoodPlaces", { query: "croissant" }) : text("Croissant. Best: Flour Bakery 4.7, Kenmore 6 min walk. Quest: tatte-fenway-pastry");
      if (who === "trip" && tripFails) throw Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { statusCode: 429 });
      if (who === "trip") return calls.trip === 1 ? tool("nextTrains", { stationId: "place-kencl" }) : text("Ride Green B to Kenmore, next train in 3 min.\nQUESTS: tatte-fenway-pastry");
      if (who === "report" || options.responseFormat?.type === "json") return text(JSON.stringify(REPORT));
      return text(JSON.stringify(REPORT));
    },
  };
}
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: () => () => fakeGemini() }));

let photoCategory = "food";
let tripFails = false;
const fetchLog: string[] = [];
beforeEach(() => {
  tripFails = false;
  for (const k of Object.keys(calls)) delete calls[k];
  fetchLog.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pk";
  process.env.GEMINI_API_KEY = "g";
  process.env.XAI_API_KEY = "x";
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    fetchLog.push(String(url));
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (String(url).includes("api.x.ai")) {
      const body = JSON.parse(String(init?.body));
      const isPhoto = JSON.stringify(body.input).includes("input_image");
      const out = isPhoto
        ? { category: photoCategory, label: photoCategory === "other" ? "a cat" : "croissant", details: "A flaky croissant.", searchTerms: ["croissant", "pastry"], placeGuess: null, confidence: 0.9 }
        : { reply: "Try Fenway Pastry Pick at Kenmore!", quest_ids: ["tatte-fenway-pastry"] };
      return json({ output_text: JSON.stringify(out) });
    }
    if (String(url).includes("/api/places")) return json({ places: [{ name: "Flour Bakery", address: "1 Main St", lat: 42.349, lng: -71.095, rating: 4.7, ratings: 900, price: 2, openNow: true, category: "Bakery" }] });
    if (String(url).includes("/api/trains")) return json({ arrivals: [{ route: "Green-B", minutes: 3, status: null }] });
    if (String(url).includes("/api/lateness")) return json({ lines: [{ badge: "Green Line +4 min" }] });
    return new Response("not found", { status: 404 });
  });
});

const { makeChatWorkflow, makePhotoWorkflow, runWorkflow } = await import("./pipeline");
const IMG = "data:image/jpeg;base64,AAAA";

describe("photo pipeline", () => {
  it("food: Grok → Food Researcher → Trip Planner → Report", async () => {
    photoCategory = "food";
    const events: string[] = [];
    const report = await runWorkflow(
      makePhotoWorkflow({ origin: "http://app", quests: QUESTS, emit: (e) => events.push(`${e.stage}:${e.status}`) }),
      { image: IMG, note: "" },
    );
    expect(events).toEqual([
      "vision:running", "vision:done", "food:running", "food:done", "trip:running", "trip:done", "report:running", "report:done",
    ]);
    expect(calls.food).toBe(2);
    expect(calls.trip).toBe(2);
    expect(fetchLog.some((u) => u.startsWith("http://app/api/places?text=croissant"))).toBe(true);
    expect(fetchLog).toContain("http://app/api/trains?stop=place-kencl");
    expect(report.kind).toBe("plan");
    expect(report.detected).toEqual({ kind: "food", label: "croissant" });
    expect(report.picks.map((p) => p.id)).toEqual(["tatte-fenway-pastry"]); // made-up id dropped
    expect(report.transit?.nextTrainMin).toBe(3);
    expect(report.places[0].name).toBe("Flour Bakery");
  });

  it("location: skips the Food Researcher", async () => {
    photoCategory = "location";
    const events: string[] = [];
    const report = await runWorkflow(
      makePhotoWorkflow({ origin: "http://app", quests: QUESTS, emit: (e) => events.push(`${e.stage}:${e.status}`) }),
      { image: IMG, note: "" },
    );
    expect(events).toContain("food:skipped");
    expect(calls.food).toBeUndefined();
    expect(calls.trip).toBe(2);
    expect(report.detected?.kind).toBe("location");
  });

  it("other: asks for another photo, no agents run", async () => {
    photoCategory = "other";
    const report = await runWorkflow(makePhotoWorkflow({ origin: "http://app", quests: QUESTS, emit: () => {} }), { image: IMG, note: "" });
    expect(report.kind).toBe("retry");
    expect(report.summary).toContain("a cat");
    expect(calls.food ?? 0).toBe(0);
    expect(calls.trip ?? 0).toBe(0);
  });
});

describe("when an agent is rate limited", () => {
  it("location still gets a plan from the backup quest search", async () => {
    photoCategory = "location";
    tripFails = true;
    const events: string[] = [];
    const report = await runWorkflow(
      makePhotoWorkflow({ origin: "http://app", quests: QUESTS, emit: (e) => events.push(`${e.stage}:${e.status}`) }),
      { image: IMG, note: "" },
    );
    expect(events).toContain("trip:error");
    expect(report.kind).toBe("plan");
    expect(report.picks.length).toBeGreaterThan(0);
  });
});

describe("parsePhoto", async () => {
  const { parsePhoto } = await import("./grok");
  it("accepts loose model output", () => {
    const p = parsePhoto({ category: "Landmark", label: "Chinatown Gate", details: "A gate", searchTerms: "chinatown, gate", placeGuess: "null", confidence: "90" }, "grok");
    expect(p.category).toBe("location");
    expect(p.searchTerms).toEqual(["chinatown", "gate"]);
    expect(p.placeGuess).toBeNull();
    expect(p.confidence).toBe(0.9);
  });
  it("treats unsure answers as other", () => {
    expect(parsePhoto({ category: "food", label: "x", confidence: 0.1 }, "grok").category).toBe("other");
    expect(parsePhoto({ category: "cat", label: "a cat", confidence: 0.9 }, "grok").category).toBe("other");
  });
});

describe("text pipeline", () => {
  it("Grok → Report tool", async () => {
    const events: string[] = [];
    const report = await runWorkflow(
      makeChatWorkflow({ origin: "http://app", quests: QUESTS, emit: (e) => events.push(`${e.stage}:${e.status}`) }),
      { message: "pastry near kenmore", history: [] },
    );
    expect(events).toEqual(["grok:running", "grok:done", "report:running", "report:done"]);
    expect(report.kind).toBe("chat");
    expect(report.picks[0].id).toBe("tatte-fenway-pastry");
  });

  it("report tool falls back to the agents' picks when Gemini is down", async () => {
    delete process.env.GEMINI_API_KEY;
    const report = await runWorkflow(makeChatWorkflow({ origin: "http://app", quests: QUESTS, emit: () => {} }), { message: "pastry", history: [] });
    expect(report.summary).toContain("Fenway Pastry Pick");
    expect(report.picks[0].id).toBe("tatte-fenway-pastry");
  });
});
