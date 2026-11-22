// Hub filter state: the backend's Filters (craving, budget, minutes) plus "open now" and
// search terms, which only the hub knows about. Pure functions so the chip bar, search bar, and tests
// share one set of rules. Matching itself is matchesFilters (src/lib/search).

import type { Filters, PriceTier, Quest, QuestType } from "@/lib/data/types";
import { matchesFilters } from "@/lib/search/matchFilters";
import { normalizeTag } from "@/lib/search/fallbackParser";
import { isOpenAt } from "./hours";

export interface HubFilters extends Filters {
  openNow: boolean;
  /** Tags and keywords from a search. A quest matches if it matches any of them. */
  terms: string[];
}

export const EMPTY_FILTERS: HubFilters = { craving: "any", budget: null, minutes: null, openNow: false, terms: [] };

export const TYPE_OPTIONS: { value: QuestType; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "event", label: "Events" },
  { value: "scenic", label: "Scenery" }, // DESIGN.md calls the category "Scenery"
];

/** budget is a max price tier (0 free … 3 splurge). */
export const BUDGET_OPTIONS: { value: PriceTier; label: string }[] = [
  { value: 0, label: "Free" },
  { value: 1, label: "Under $10" },
  { value: 2, label: "$10–20" },
  { value: 3, label: "$20+" },
];

/** Minutes available, counted from the player when their ride time is known, else from the station. */
export const TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hr" },
  { value: 90, label: "1.5 hr" },
  { value: 120, label: "2 hr" },
  { value: 150, label: "2.5 hr" },
  { value: 180, label: "3 hr" },
  { value: 240, label: "4 hr" },
  { value: 300, label: "5 hr" },
  { value: 360, label: "6 hr" },
  { value: 480, label: "All day" },
];

const TYPE_VALUES = new Set<string>(TYPE_OPTIONS.map((o) => o.value));

/** "late-night" → "Late night". Quest types use their chip label. */
export function cravingLabel(craving: string): string {
  const type = TYPE_OPTIONS.find((o) => o.value === craving);
  if (type) return type.label;
  const words = craving.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function budgetLabel(budget: PriceTier): string {
  return BUDGET_OPTIONS.find((o) => o.value === budget)!.label;
}

export function minutesLabel(minutes: number): string {
  const preset = TIME_OPTIONS.find((o) => o.value === minutes);
  if (preset) return preset.label;
  if (minutes % 60 === 0) return `${minutes / 60} hr`;
  return `${minutes} min`;
}

/**
 * Craving chips for a station: the three quest types, then its most common vibe tags
 * (up to `limit`, ties broken alphabetically). The active craving is always included, and
 * one that isn't in the top list goes first so a searched tag shows as a selected chip
 * without scrolling the row.
 */
export function cravingOptions(quests: Quest[], active: string, limit = 6): { value: string; label: string }[] {
  const counts = new Map<string, { tag: string; n: number }>();
  for (const q of quests) {
    for (const tag of q.vibe_tags) {
      const key = normalizeTag(tag);
      const entry = counts.get(key) ?? { tag, n: 0 };
      entry.n += 1;
      counts.set(key, entry);
    }
  }
  const tags = [...counts.values()]
    .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map((e) => e.tag);
  if (active !== "any" && !TYPE_VALUES.has(active) && !tags.some((t) => normalizeTag(t) === normalizeTag(active))) {
    tags.unshift(active);
  }
  return [...TYPE_OPTIONS, ...tags.map((t) => ({ value: t, label: cravingLabel(t) }))];
}

/** Applies a search's filters and terms. "Open now" stays as the user set it. */
export function fromSearch(current: HubFilters, search: { filters: Filters; terms: string[] }): HubFilters {
  const { craving, budget, minutes } = search.filters;
  return { craving: craving || "any", budget, minutes, openNow: current.openNow, terms: search.terms };
}

const words = (text: string) => text.toLowerCase().replace(/[-_]+/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * How well a quest matches one search term. Gemini picks from its own tag list, which
 * doesn't always match the content's tags ("photo-spot" vs "photo"), so a term matches
 * when it equals a tag, when all its words appear among the quest's tag words, or when
 * all its words appear in the title or description (singular or plural).
 */
export function matchesTerm(quest: Quest, term: string): boolean {
  const key = normalizeTag(term);
  if (quest.vibe_tags.some((t) => normalizeTag(t) === key)) return true;
  const termWords = words(term).map((w) => normalizeTag(w));
  if (termWords.length === 0) return false;
  const tagWords = new Set(quest.vibe_tags.flatMap(words).map((w) => normalizeTag(w)));
  // "photo-spot" matches a quest tagged "photo": the term's first word is the tag.
  if (quest.vibe_tags.some((t) => normalizeTag(t) === termWords[0])) return true;
  const textWords = new Set(words(`${quest.title} ${quest.description ?? ""}`).map((w) => normalizeTag(w)));
  return termWords.every((w) => textWords.has(w) || tagWords.has(w));
}

/** How many filters are set (for "Clear" and the result line). */
export function activeCount(f: HubFilters): number {
  return (
    (f.craving !== "any" ? 1 : 0) +
    (f.budget !== null ? 1 : 0) +
    (f.minutes !== null ? 1 : 0) +
    (f.openNow ? 1 : 0) +
    f.terms.length
  );
}

/**
 * Filters, then (with search terms) puts quests matching more terms first. `rideMin` is the
 * ride from the player to this station when known (counted against the time filter).
 */
export function applyFilters(quests: Quest[], f: HubFilters, now: Date, rideMin: number | null = null): Quest[] {
  const hits = (q: Quest) => f.terms.filter((t) => matchesTerm(q, t)).length;
  const kept = quests.filter(
    (q) => matchesFilters(q, f, { rideMin: rideMin ?? 0 }) && (!f.openNow || isOpenAt(q.hours, now) !== false) && (f.terms.length === 0 || hits(q) > 0),
  );
  return f.terms.length === 0 ? kept : kept.map((q) => ({ q, n: hits(q) })).sort((a, b) => b.n - a.n).map((x) => x.q);
}

/** "8 quests", "1 quest", "No quests". */
export function resultLabel(n: number): string {
  if (n === 0) return "No quests";
  return n === 1 ? "1 quest" : `${n} quests`;
}
