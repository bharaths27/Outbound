// Client-side quest filtering, so filter chips update instantly. Shared by the mock
// service and the hub UI.

import type { Filters, Quest } from "@/lib/data/types";
import { normalizeTag } from "./fallbackParser";

const QUEST_TYPES = new Set(["food", "event", "scenic"]);

export interface MatchOptions {
  /** Minutes to ride to the quest's station. 0 = already at the station (the default
   *  until the map can supply a ride time). */
  rideMin?: number;
}

export function matchesFilters(quest: Quest, filters: Filters | undefined, opts: MatchOptions = {}): boolean {
  if (!filters) return true;
  const { craving, budget, minutes } = filters;
  if (craving && craving !== "any") {
    if (QUEST_TYPES.has(craving)) {
      if (quest.type !== craving) return false;
    } else {
      const key = normalizeTag(craving);
      if (!quest.vibe_tags.some((t) => normalizeTag(t) === key)) return false;
    }
  }
  if (budget !== null && budget !== undefined && quest.price_tier > budget) return false;
  // Backend rule (migration 002): ride + walk there and back + time at the spot.
  if (minutes !== null && minutes !== undefined) {
    if ((opts.rideMin ?? 0) + 2 * quest.walk_min + quest.duration_min > minutes) return false;
  }
  return true;
}
