// Explore's "Craving / Budget / Time" picks (DESIGN.md §6 Explore). They live outside React
// so the Explore card can set them and every station hub opened afterwards starts with them
// (the hub still lets the player change or clear them per stop). Not persisted: a reload
// starts fresh.

import type { Filters } from "@/lib/data/types";

/** The map's extra filters (Explore card "More filters"): they apply to the map only, not the hubs. */
export type MapLine = "any" | "Red" | "Orange" | "Green" | "Blue";
export interface ExploreFilters extends Pick<Filters, "craving" | "budget" | "minutes"> {
  line: MapLine; // near a stop on this line
  minXp: number | null; // worth at least this many XP
  openNow: boolean; // quests open right now, events happening now
  hideVisited: boolean; // hide quests you've checked in to
  freeFood: boolean; // only free food: free food quests and events with free food
}

export const NO_EXPLORE_FILTERS: ExploreFilters = {
  craving: "any",
  budget: null,
  minutes: null,
  line: "any",
  minXp: null,
  openNow: false,
  hideVisited: false,
  freeFood: false,
};

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

/** How many of the "More filters" are on. */
export function moreFilterCount(f: ExploreFilters = current): number {
  return (f.line !== "any" ? 1 : 0) + (f.minXp !== null ? 1 : 0) + (f.openNow ? 1 : 0) + (f.hideVisited ? 1 : 0) + (f.freeFood ? 1 : 0);
}

export function hasExploreFilters(f: ExploreFilters = current): boolean {
  return f.craving !== "any" || f.budget !== null || f.minutes !== null || moreFilterCount(f) > 0;
}

/** Does a station with these lines ("Green-B", "Red", "Mattapan") serve the picked line? */
export function servesLine(lines: readonly string[] | undefined, line: MapLine): boolean {
  if (line === "any") return true;
  return !!lines?.some((l) => l === line || l.startsWith(`${line}-`) || (line === "Red" && l === "Mattapan"));
}
