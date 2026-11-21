"use client";

// Client half of /q/[questId]: the server page loads the quest and station; this adds the
// player's progress and check-in. The header links back to the station's hub.

import { PageHeader } from "@/features/shell/page-header";
import type { Quest, Station } from "@/lib/data/types";
import { QuestDetail } from "./quest-detail";
import { useNow } from "./use-now";
import { usePlayer } from "./use-player";

export function QuestPage({ quest, station }: { quest: Quest; station: Station }) {
  const { player, reload } = usePlayer();
  const now = useNow();
  const stationHref = `/?station=${encodeURIComponent(station.id)}`;
  return (
    <>
      <PageHeader
        title={`${station.name} · ${station.neighborhood}`}
        back={{ href: stationHref, label: `${station.name} station` }}
        desktopBackOnly
      />
      <QuestDetail quest={quest} station={station} player={player} now={now} onCheckedIn={reload} stationHref={stationHref} />
    </>
  );
}
