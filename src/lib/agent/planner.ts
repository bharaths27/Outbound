// Outbound Trip Planner: a Mastra agent (Gemini) that plans a short T outing from our own data.
// Tools: searchQuests (Supabase), nextTrains (MBTA via /api/trains), lineDelays (Tiger Data via
// /api/lateness). Server-only. Used by /api/agent.
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { bostonNow, type GuideQuest } from "@/lib/guide";

export const AGENT_MODEL = process.env.MASTRA_MODEL || "gemini-2.5-flash";
const PRICE = ["free", "under $10", "$10-25", "splurge"];
const QUEST_FIELDS =
  "id,title,type,description,price_tier,vibe_tags,hours,xp,duration_min,walk_min,station_id,stations(name,lines,neighborhood)";

// Quests are public data, so the publishable key is enough. Cached for 5 minutes.
let cache: { at: number; quests: GuideQuest[] } | null = null;
export async function loadQuests(): Promise<GuideQuest[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.quests;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env not set");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("quests").select(QUEST_FIELDS).limit(300);
  if (error) throw new Error(`quests: ${error.message}`);
  cache = { at: Date.now(), quests: (data ?? []) as unknown as GuideQuest[] };
  return cache.quests;
}

export interface QuestFilter {
  type?: "food" | "event" | "scenic" | "any";
  maxPriceTier?: number;
  maxMinutes?: number;
  station?: string;
  keywords?: string[];
}

/** Filter and rank quests. Pure, so it is unit-tested without Supabase. */
export function filterQuests(quests: GuideQuest[], f: QuestFilter, limit = 8) {
  const words = (f.keywords ?? []).map((w) => w.toLowerCase()).filter(Boolean);
  const station = f.station?.toLowerCase().trim();
  return quests
    .filter((q) => !f.type || f.type === "any" || q.type === f.type)
    .filter((q) => f.maxPriceTier == null || q.price_tier <= f.maxPriceTier)
    .filter((q) => f.maxMinutes == null || (q.duration_min ?? 30) + 2 * (q.walk_min ?? 5) <= f.maxMinutes)
    .filter((q) => {
      if (!station) return true;
      const s = q.stations;
      return [q.station_id, s?.name, s?.neighborhood].some((v) => v?.toLowerCase().includes(station));
    })
    .map((q) => {
      const text = [q.title, q.description, ...(q.vibe_tags ?? [])].join(" ").toLowerCase();
      return { q, score: words.filter((w) => text.includes(w)).length };
    })
    .filter(({ score }) => !words.length || score > 0)
    .sort((a, b) => b.score - a.score || b.q.xp - a.q.xp)
    .slice(0, limit)
    .map(({ q }) => ({
      id: q.id,
      title: q.title,
      type: q.type,
      stationId: q.station_id,
      station: q.stations?.name ?? q.station_id,
      lines: q.stations?.lines ?? [],
      neighborhood: q.stations?.neighborhood ?? null,
      price: PRICE[q.price_tier] ?? "?",
      hours: q.hours ?? "unknown",
      minutes: (q.duration_min ?? 30) + (q.walk_min ?? 5),
      xp: q.xp,
    }));
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${new URL(url).pathname} HTTP ${res.status}`);
  return body;
}

/** Tools are built per request so they can call this deployment's own APIs. */
export function makeTools(origin: string) {
  const searchQuests = createTool({
    id: "searchQuests",
    description:
      "Search Outbound quests (food, events, scenic spots near T stations). Returns id, title, station, lines, price, opening hours, total minutes and XP. Call it with broad filters first; drop keywords if nothing matches.",
    inputSchema: z.object({
      type: z.enum(["food", "event", "scenic", "any"]).optional().describe("Kind of quest"),
      maxPriceTier: z.number().int().min(0).max(3).optional().describe("0 free, 1 under $10, 2 $10-25, 3 splurge"),
      maxMinutes: z.number().int().optional().describe("Time the player has, including walking there and back"),
      station: z.string().optional().describe("Station or neighborhood name, e.g. Kenmore or Back Bay"),
      keywords: z.array(z.string()).optional().describe("Food or vibe words like pizza, coffee, photo"),
    }),
    execute: async (input) => ({ quests: filterQuests(await loadQuests(), input) }),
  });

  const nextTrains = createTool({
    id: "nextTrains",
    description: "Live next train arrivals (MBTA) at a station, by station id like place-kencl.",
    inputSchema: z.object({ stationId: z.string().describe("Station id from searchQuests, e.g. place-kencl") }),
    execute: async ({ stationId }) => {
      const j = await getJson(`${origin}/api/trains?stop=${encodeURIComponent(stationId)}`);
      return {
        arrivals: (j.arrivals ?? []).slice(0, 5).map((a: { route: string; minutes: number; status: string | null }) => ({
          route: a.route,
          minutes: a.minutes,
          status: a.status,
        })),
      };
    },
  });

  const lineDelays = createTool({
    id: "lineDelays",
    description: "How late each T line is right now compared with normal, from our Tiger Data history.",
    inputSchema: z.object({}),
    execute: async () => {
      const j = await getJson(`${origin}/api/lateness`);
      return { lines: (j.lines ?? []).map((l: { badge: string }) => l.badge) };
    },
  });

  return { searchQuests, nextTrains, lineDelays };
}

export function makePlanner(origin: string) {
  const key = process.env.GEMINI_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const google = createGoogleGenerativeAI({ apiKey: key });
  return new Agent({
    id: "outbound-trip-planner",
    name: "Outbound Trip Planner",
    description: "Plans a short outing on the T from Outbound quests, live trains and line delays.",
    instructions: `You are the Outbound Trip Planner for college students in Boston.
Plan a short outing on the T (Red, Orange and Green Lines) using ONLY quests returned by searchQuests.
Steps: 1) call searchQuests with the player's craving, budget, time and place; 2) pick 1 to 3 quests that are
open at the current time (check the hours); 3) call nextTrains for the station of your first pick; 4) call
lineDelays and mention a delay only if that line is late.
Reply in at most 5 short sentences: where to go, which line and how soon the next train is, and the XP.
Never invent places, prices, times or quests. If nothing fits, say so and suggest the closest quest.
End with one last line exactly like: QUESTS: id1, id2`,
    model: google(AGENT_MODEL),
    tools: makeTools(origin),
  });
}

/** Pull the quest ids from the agent's last line and drop that line from the reply. */
export function splitReply(text: string, quests: GuideQuest[]) {
  const m = text.match(/QUESTS:\s*(.*)\s*$/i);
  const ids = m ? m[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean) : [];
  const byId = new Map(quests.map((q) => [q.id, q]));
  const picks = ids
    .map((id) => byId.get(id))
    .filter((q): q is GuideQuest => !!q)
    .slice(0, 3)
    .map((q) => ({ id: q.id, title: q.title, station_id: q.station_id, station_name: q.stations?.name ?? null, xp: q.xp, price_tier: q.price_tier }));
  return { reply: (m ? text.slice(0, m.index) : text).trim(), quests: picks };
}

export function plannerPrompt(message: string, now = bostonNow()) {
  return `Current time in Boston: ${now}.\nPlayer: ${message}`;
}
