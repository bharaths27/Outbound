"use client";

// Client half of /q/[questId]: the server page loads the quest and station; this adds the
// player's progress and check-in.

import type { Quest, Station } from "@/lib/data/types";
import { QuestDetail } from "./quest-detail";
import { useNow } from "./use-now";
import { usePlayer } from "./use-player";

export function QuestPage({ quest, station }: { quest: Quest; station: Station }) {
  const { player, reload } = usePlayer();
  const now = useNow();
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 md:px-6 md:py-10">
      <QuestDetail
        quest={quest}
        station={station}
        player={player}
        now={now}
        onCheckedIn={reload}
        stationHref={`/?station=${encodeURIComponent(station.id)}`}
      />
    </div>
  );
}
