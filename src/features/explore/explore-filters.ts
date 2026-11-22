// Explore's "Craving / Budget / Time" picks (DESIGN.md §6 Explore). They live outside React
// so the Explore card can set them and every station hub opened afterwards starts with them
// (the hub still lets the player change or clear them per stop). Not persisted: a reload
// starts fresh.

import type { Filters } from "@/lib/data/types";

export type ExploreFilters = Pick<Filters, "craving" | "budget" | "minutes">;

export const NO_EXPLORE_FILTERS: ExploreFilters = { craving: "any", budget: null, minutes: null };

let current: ExploreFilters = NO_EXPLORE_FILTERS;
const listeners = new Set<() => void>();

export function getExploreFilters(): ExploreFilters {
  return current;
}

export function setExploreFilters(patch: Partial<ExploreFilters>): void {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}

export function subscribeExploreFilters(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasExploreFilters(f: ExploreFilters = current): boolean {
  return f.craving !== "any" || f.budget !== null || f.minutes !== null;
}
