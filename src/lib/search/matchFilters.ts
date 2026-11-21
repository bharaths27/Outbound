// Client-side quest filtering, so filter chips update instantly. Shared by the mock
// service and the hub UI.

import type { Filters, Quest } from "@/lib/data/types";
import { normalizeTag } from "./fallbackParser";

const QUEST_TYPES = new Set(["food", "event", "scenic"]);

export function matchesFilters(quest: Quest, filters: Filters | undefined): boolean {
  if (!filters) return true;
  const { craving, budget } = filters;
  if (craving && craving !== "any") {
    if (QUEST_TYPES.has(craving)) {
      if (quest.type !== craving) return false;
    } else {
      const key = normalizeTag(craving);
      if (!quest.vibe_tags.some((t) => normalizeTag(t) === key)) return false;
    }
  }
  if (budget !== null && budget !== undefined && quest.price_tier > budget) return false;
  // `minutes` is not applied: quests have no duration or walk-time field yet.
  // Requested from the backend in docs/requests-for-others.md.
  return true;
}
