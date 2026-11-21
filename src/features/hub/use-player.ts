"use client";

// The signed-in player's progress, for "done" stamps and tiers on quest cards. Signed-out
// players get empty progress; the hub still works for them.

import { useCallback, useEffect, useState } from "react";
import { data } from "@/lib/data";
import type { PassportNeighborhood, Profile, Tier, Visit } from "@/lib/data/types";

export interface Player {
  profile: Profile | null;
  visits: Visit[];
  passport: PassportNeighborhood[];
}

const EMPTY: Player = { profile: null, visits: [], passport: [] };

async function loadPlayer(): Promise<Player> {
  const profile = await data.getCurrentUser();
  if (!profile) return EMPTY;
  const [visits, passport] = await Promise.all([data.getVisits(profile.id), data.getPassport(profile.id)]);
  return { profile, visits, passport };
}

export function usePlayer(): { player: Player; reload: () => void } {
  const [player, setPlayer] = useState<Player>(EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadPlayer()
      .then((p) => !cancelled && setPlayer(p))
      .catch(() => !cancelled && setPlayer(EMPTY)); // progress is a bonus; never block the hub
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { player, reload };
}

/** The player's most recent visit to a quest, if any. */
export function lastVisit(player: Player, questId: string): Visit | undefined {
  return player.visits
    .filter((v) => v.quest_id === questId)
    .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))[0];
}

export function tierIn(player: Player, neighborhood: string): Tier | null {
  return player.passport.find((p) => p.neighborhood === neighborhood)?.tier ?? null;
}
