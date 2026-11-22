// Food Researcher: a Mastra agent (Gemini) that takes a dish from a photo and finds where to get it
// near the T. Tools: searchQuests (our food quests) and findFoodPlaces (Google Places through our
// /api/places, each spot tagged with its closest T station). Its report goes to the Trip Planner.
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { geminiModels, makeTools } from "./planner";

export interface StationRow {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lon: number;
  neighborhood: string;
}

let stationCache: { at: number; rows: StationRow[] } | null = null;
export async function loadStations(): Promise<StationRow[]> {
  if (stationCache && Date.now() - stationCache.at < 30 * 60_000) return stationCache.rows;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env not set");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("stations").select("id,name,lines,lat,lon,neighborhood").limit(500);
  if (error) throw new Error(`stations: ${error.message}`);
  stationCache = { at: Date.now(), rows: (data ?? []) as StationRow[] };
  return stationCache.rows;
}

/** Distance in km between two points. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Closest station and the walk in minutes (about 12 min per km). */
export function nearestStation(lat: number, lon: number, stations: StationRow[]) {
  let best: { s: StationRow; d: number } | null = null;
  for (const s of stations) {
    const d = km(lat, lon, s.lat, s.lon);
    if (!best || d < best.d) best = { s, d };
  }
  return best ? { id: best.s.id, name: best.s.name, lines: best.s.lines, walkMin: Math.max(1, Math.round(best.d * 12)) } : null;
}

interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  ratings: number;
  price: number | null;
  openNow: boolean | null;
  category: string;
}

/** Best-rated first, but a 4.8 with 6 reviews doesn't beat a 4.6 with 900. */
export function rankPlaces(places: Place[]) {
  const score = (p: Place) => (p.rating ?? 3.5) * Math.log10(10 + (p.ratings ?? 0));
  return [...places].sort((a, b) => score(b) - score(a));
}

export interface FoundSpot {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/** `found` collects every spot the tool returned (with coordinates), so the app can route to them. */
export function makeFoodTools(origin: string, found: FoundSpot[] = []) {
  const findFoodPlaces = createTool({
    id: "findFoodPlaces",
    description:
      "Find real restaurants, cafes or shops in Boston for a dish (Google Places). Each result has rating, price level ($ to $$$$), open now, and the closest T station with walking minutes.",
    inputSchema: z.object({
      query: z.string().describe("Dish or cuisine, e.g. 'tonkotsu ramen' or 'boba tea'"),
      nearStation: z.string().optional().describe("Optional station name to search around, e.g. Kenmore"),
    }),
    execute: async ({ query, nearStation }) => {
      const stations = await loadStations().catch(() => [] as StationRow[]);
      const center = nearStation
        ? stations.find((s) => s.name.toLowerCase().includes(nearStation.toLowerCase()))
        : undefined;
      const lat = center?.lat ?? 42.355, lng = center?.lon ?? -71.065;
      const res = await fetch(`${origin}/api/places?text=${encodeURIComponent(`${query} near Boston`)}&lat=${lat}&lng=${lng}`, {
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) return { places: [], note: `Place search failed (HTTP ${res.status}). Use Outbound quests only.` };
      if (j?.disabled) return { places: [], note: "Place search isn't set up. Use Outbound quests only." };
      const price = ["free", "$", "$$", "$$$", "$$$$"];
      return {
        places: rankPlaces((j?.places ?? []) as Place[])
          .filter((p) => typeof p.lat === "number" && typeof p.lng === "number")
          .slice(0, 5)
          .map((p) => {
            const near = nearestStation(p.lat, p.lng, stations);
            found.push({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
            return {
              name: p.name,
              address: p.address,
              rating: p.rating,
              reviews: p.ratings,
              price: p.price == null ? null : price[p.price],
              openNow: p.openNow,
              closestT: near ? `${near.name} (${near.lines.join("/")}), ${near.walkMin} min walk` : null,
            };
          }),
      };
    },
  });
  return { findFoodPlaces, searchQuests: makeTools(origin).searchQuests };
}

export function makeFoodResearcher(origin: string, found: FoundSpot[] = []) {
  return new Agent({
    id: "outbound-food-researcher",
    name: "Outbound Food Researcher",
    description: "Finds where to get a dish from a photo, near the T.",
    instructions: `You are the Food Researcher for Outbound, a game for Boston college students who ride the T.
You get a dish or drink that a student photographed. Research where to get it near the T:
1) call searchQuests with type "food" and 1 to 3 keywords for the dish (retry with no keywords if empty);
2) call findFoodPlaces with the dish name.
Then write a research report of at most 120 words: what the dish is; the 2 to 4 best spots (name, rating,
price, open now, closest T station and walk); and the Outbound quest ids that match, if any.
Prefer spots that are open now and close to a station. Never invent spots, ratings or quests.`,
    model: geminiModels(),
    tools: makeFoodTools(origin, found),
  });
}
