// Joins the backend's passport rows (tiers, counts, stamps) with every quest and station,
// so each neighborhood can show earned stamps next to the ones still to collect. Tiers and
// counts come from the passport view as-is; this only groups and orders.

import type { PassportNeighborhood, Quest, Station, Tier } from "@/lib/data/types";

export interface EarnedStamp {
  quest: Quest;
  /** Latest check-in. */
  at: string;
  /** How many times the player checked in here (one stamp per quest). */
  visits: number;
  crossSchool: boolean;
}

export interface NeighborhoodView {
  neighborhood: string;
  tier: Tier;
  questsDone: number;
  nextTier: Exclude<Tier, "bronze"> | null;
  questsToNextTier: number;
  /** Share of the way to the next tier, 1 at gold. */
  progress: number;
  earned: EarnedStamp[];
  locked: Quest[];
  /** Stations with quests in this neighborhood. */
  stations: StationRef[];
}

export interface StationRef {
  id: string;
  name: string;
}

export interface UnvisitedNeighborhood {
  neighborhood: string;
  quests: number;
  stations: StationRef[];
}

export interface PassportView {
  visited: NeighborhoodView[];
  unvisited: UnvisitedNeighborhood[];
  totalStamps: number;
}

export function buildPassport(rows: PassportNeighborhood[], quests: Quest[], stations: Station[]): PassportView {
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const questById = new Map(quests.map((q) => [q.id, q]));
  const hoodOf = (q: Quest) => stationById.get(q.station_id)?.neighborhood;

  const questsByHood = new Map<string, Quest[]>();
  for (const q of quests) {
    const hood = hoodOf(q);
    if (!hood) continue;
    questsByHood.set(hood, [...(questsByHood.get(hood) ?? []), q]);
  }
  const stationsIn = (hood: string): StationRef[] =>
    stations
      .filter((s) => s.neighborhood === hood && (questsByHood.get(hood) ?? []).some((q) => q.station_id === s.id))
      .map((s) => ({ id: s.id, name: s.name }));

  const visited = rows.map((row): NeighborhoodView => {
    const earnedById = new Map<string, EarnedStamp>();
    for (const stamp of row.stamps) {
      const quest = questById.get(stamp.quest_id);
      if (!quest) continue; // a quest that was removed from the content
      const prev = earnedById.get(quest.id);
      earnedById.set(quest.id, {
        quest,
        at: prev && prev.at > stamp.at ? prev.at : stamp.at,
        visits: (prev?.visits ?? 0) + 1,
        crossSchool: (prev?.crossSchool ?? false) || stamp.cross_school,
      });
    }
    const earned = [...earnedById.values()].sort((a, b) => b.at.localeCompare(a.at));
    const locked = (questsByHood.get(row.neighborhood) ?? []).filter((q) => !earnedById.has(q.id));
    const total = row.quests_done + row.quests_to_next_tier;
    return {
      neighborhood: row.neighborhood,
      tier: row.tier,
      questsDone: row.quests_done,
      nextTier: row.next_tier,
      questsToNextTier: row.quests_to_next_tier,
      progress: row.next_tier === null ? 1 : total > 0 ? row.quests_done / total : 0,
      earned,
      locked,
      stations: stationsIn(row.neighborhood),
    };
  });

  // Most recently active neighborhood first.
  const latest = (n: NeighborhoodView) => n.earned[0]?.at ?? "";
  visited.sort((a, b) => latest(b).localeCompare(latest(a)));

  const seen = new Set(rows.map((r) => r.neighborhood));
  const unvisited = [...questsByHood]
    .filter(([hood]) => !seen.has(hood))
    .map(([neighborhood, qs]) => ({ neighborhood, quests: qs.length, stations: stationsIn(neighborhood) }))
    .sort((a, b) => b.quests - a.quests || a.neighborhood.localeCompare(b.neighborhood));

  return { visited, unvisited, totalStamps: visited.reduce((n, v) => n + v.earned.length, 0) };
}

const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

/**
 * "2 more for Silver", or "Gold. Every quest here collected." Says so plainly when the
 * neighborhood doesn't have enough quests left to reach the next tier.
 */
export function progressLine(n: NeighborhoodView): string {
  if (n.nextTier === null) return n.locked.length === 0 ? "Gold. Every quest here collected." : "Gold";
  const more = n.questsToNextTier;
  if (n.locked.length < more) {
    return n.locked.length === 0
      ? `Every quest here collected. ${TIER_LABEL[n.nextTier]} unlocks as new quests are added.`
      : `${n.locked.length} left here. ${TIER_LABEL[n.nextTier]} needs more quests.`;
  }
  return `${more} more for ${TIER_LABEL[n.nextTier]}`;
}

export { TIER_LABEL };
