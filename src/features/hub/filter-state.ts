// Hub filter state: the backend's Filters (craving, budget, minutes) plus "open now",
// which only the hub knows about. Pure functions so the chip bar, search bar, and tests
// share one set of rules. Matching itself is matchesFilters (src/lib/search).

import type { Filters, PriceTier, Quest, QuestType } from "@/lib/data/types";
import { matchesFilters } from "@/lib/search/matchFilters";
import { normalizeTag } from "@/lib/search/fallbackParser";
import { isOpenAt } from "./hours";

export interface HubFilters extends Filters {
  openNow: boolean;
}

export const EMPTY_FILTERS: HubFilters = { craving: "any", budget: null, minutes: null, openNow: false };

export const TYPE_OPTIONS: { value: QuestType; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "event", label: "Events" },
  { value: "scenic", label: "Scenic" },
];

/** budget is a max price tier (0 free … 3 splurge). */
export const BUDGET_OPTIONS: { value: PriceTier; label: string }[] = [
  { value: 0, label: "Free" },
  { value: 1, label: "Under $10" },
  { value: 2, label: "$10–20" },
  { value: 3, label: "$20+" },
];

/** Minutes available, counted from the station (ride time isn't known yet). */
export const TIME_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hr" },
  { value: 120, label: "2 hr" },
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

/** Applies a search's parsed filters. "Open now" stays as the user set it. */
export function fromParsed(current: HubFilters, parsed: Filters): HubFilters {
  return { craving: parsed.craving || "any", budget: parsed.budget, minutes: parsed.minutes, openNow: current.openNow };
}

/** How many filters are set (for "Clear" and the result line). */
export function activeCount(f: HubFilters): number {
  return (f.craving !== "any" ? 1 : 0) + (f.budget !== null ? 1 : 0) + (f.minutes !== null ? 1 : 0) + (f.openNow ? 1 : 0);
}

export function applyFilters(quests: Quest[], f: HubFilters, now: Date): Quest[] {
  return quests.filter((q) => matchesFilters(q, f) && (!f.openNow || isOpenAt(q.hours, now) !== false));
}

/** "8 quests", "1 quest", "No quests". */
export function resultLabel(n: number): string {
  if (n === 0) return "No quests";
  return n === 1 ? "1 quest" : `${n} quests`;
}
