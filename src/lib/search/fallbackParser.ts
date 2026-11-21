// Keyword parser that turns a free-text search ("cheap spicy noodles, 30 min") into the
// backend's Filters shape ({ craving, budget, minutes } in src/lib/types.ts).
// Used by the mock data service now, and kept as the fallback when Person 4's Gemini
// endpoint fails or times out. Pure and synchronous: no network, no randomness.

import type { Filters, PriceTier, QuestType } from "@/lib/data/types";

const FREE_WORDS = new Set(["free", "gratis"]);
const CHEAP_WORDS = new Set(["cheap", "budget", "broke", "affordable", "inexpensive"]);
const QUICK_WORDS = new Set(["quick", "fast"]);
const BUDGET_TIME_WORDS = new Set([...FREE_WORDS, ...CHEAP_WORDS, ...QUICK_WORDS]);

const TYPE_WORDS: Record<QuestType, readonly string[]> = {
  food: ["food", "eat", "eats", "hungry", "restaurant", "restaurants", "lunch", "dinner", "breakfast", "brunch", "snack", "snacks"],
  event: ["event", "events", "show", "shows", "concert", "concerts", "party", "parties"],
  scenic: ["scenic", "view", "views", "park", "parks", "sunset", "photo", "photos"],
};

function tierForPrice(dollars: number): PriceTier {
  if (dollars <= 0) return 0;
  if (dollars <= 10) return 1;
  if (dollars <= 20) return 2;
  return 3;
}

function parseMinutes(text: string, words: readonly string[]): number | null {
  const minutes = text.match(/\b(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (minutes) return Number(minutes[1]) || null;
  const hours = text.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hours) return Math.round(Number(hours[1]) * 60) || null;
  if (/\bhalf (?:an )?hour\b/.test(text)) return 30;
  if (/\b(?:an|one) hour\b/.test(text)) return 60;
  if (words.some((w) => QUICK_WORDS.has(w))) return 30;
  return null;
}

function parseBudget(text: string, words: readonly string[]): PriceTier | null {
  const candidates: PriceTier[] = [];
  const priceCap = text.match(/\b(?:under|below|less than|max|<)\s*\$?\s*(\d+)/);
  if (priceCap) candidates.push(tierForPrice(Number(priceCap[1])));
  if (words.some((w) => FREE_WORDS.has(w))) candidates.push(0);
  if (words.some((w) => CHEAP_WORDS.has(w))) candidates.push(1);
  if (candidates.length === 0) return null;
  return Math.min(...candidates) as PriceTier;
}

const singular = (w: string) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
export const normalizeTag = (tag: string) => singular(tag.toLowerCase().trim().replace(/[\s_]+/g, "-"));

/**
 * Parse a free-text query into Filters.
 * `craving` is the first matching vibe tag (most specific), else a quest type named in the
 * query ("dinner" -> "food"), else "any". Filters holds one craving, so extra tags are
 * dropped for now; see docs/requests-for-others.md.
 * @param knownTags the vibe-tag vocabulary (usually every `vibe_tags` value across the
 *   loaded quests). The returned craving uses the tag's original spelling.
 */
export function parseQuery(query: string, knownTags: readonly string[]): Filters {
  const text = query.toLowerCase().replace(/[^\p{L}\p{N}$<.\s-]/gu, " ").replace(/\s+/g, " ").trim();
  const words = text
    .split(" ")
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter(Boolean);

  // Single words and adjacent pairs ("late night" -> "late-night"), in query order.
  // Budget and time words ("cheap", "quick") already set their own filter, so they never
  // count as the craving even if a quest uses them as a tag.
  const phrases: string[] = [];
  words.forEach((w, i) => {
    if (i + 1 < words.length) phrases.push(normalizeTag(`${w}-${words[i + 1]}`));
    if (!BUDGET_TIME_WORDS.has(w)) phrases.push(normalizeTag(w));
  });
  const tagByKey = new Map(knownTags.map((t) => [normalizeTag(t), t]));
  const tag = phrases.map((p) => tagByKey.get(p)).find((t) => t !== undefined);
  const type = (Object.keys(TYPE_WORDS) as QuestType[]).find((t) =>
    TYPE_WORDS[t].some((w) => words.includes(w)),
  );

  return {
    craving: tag ?? type ?? "any",
    budget: parseBudget(text, words),
    minutes: parseMinutes(text, words),
  };
}
