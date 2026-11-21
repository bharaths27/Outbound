"use client";

// Weekly school leaderboard (view leaderboard_weekly). The player's school is highlighted
// in the list, and pinned above it when it's further down than the first few rows; schools under the player minimum show "Needs 5 players"
// instead of a rank.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { data } from "@/lib/data";
import type { LeaderboardRow } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { MIN_PLAYERS, rankSchools, type RankedRow } from "./compete";

/** Pin the player's school above the list when it's this far down or more. */
const PIN_AFTER = 5;

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; rows: LeaderboardRow[] };

export function SchoolsTab({ mySchoolId }: { mySchoolId: number | null }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    data
      .getSchoolLeaderboard()
      .then((rows) => !cancelled && setLoad({ status: "ready", rows }))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (load.status === "loading") {
    return (
      <div className="flex flex-col gap-2" aria-busy aria-label="Loading the leaderboard">
        <Skeleton className="h-5 w-full max-w-md" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="type-heading">The leaderboard didn&apos;t load.</p>
        <Button
          variant="outline"
          onClick={() => {
            setLoad({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { rows, mine } = rankSchools(load.rows, mySchoolId);
  const showPin = mine !== null && rows.indexOf(mine) >= PIN_AFTER;
  return (
    <div className="flex flex-col gap-4">
      <p className="type-small text-muted-foreground">
        Total XP earned this week. Schools need {MIN_PLAYERS} active players to rank. Resets Monday.
      </p>

      {showPin && mine && (
        <section aria-label="Your school" className="flex flex-col gap-1.5">
          <p className="type-small text-muted-foreground">Your school</p>
          <ol>
            <SchoolRow row={mine} pinned />
          </ol>
        </section>
      )}

      <ol className="flex flex-col divide-y rounded-xl border" aria-label="This week's standings">
        {rows.map((r) => (
          <SchoolRow key={r.school_id} row={r} />
        ))}
      </ol>
    </div>
  );
}

function SchoolRow({ row, pinned = false }: { row: RankedRow; pinned?: boolean }) {
  return (
    <li
      className={cn(
        "flex min-h-14 items-center gap-3 px-4 py-3",
        pinned && "rounded-xl bg-muted",
        !pinned && row.mine && "bg-muted/60",
      )}
      aria-current={row.mine ? "true" : undefined}
    >
      <span className="type-heading w-6 shrink-0 text-right tabular-nums" aria-label={row.rank ? `Rank ${row.rank}` : "Unranked"}>
        {row.rank ?? "–"}
      </span>
      {/* School colors appear only as small marks (DESIGN.md). */}
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-muted-foreground" style={row.color ? { backgroundColor: row.color } : undefined} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn("type-body truncate", row.mine && "font-semibold")}>
          {row.name}
          {row.mine && <span className="sr-only"> (your school)</span>}
        </span>
        <span className="type-small text-muted-foreground tabular-nums">
          {row.eligible
            ? `${row.players} ${row.players === 1 ? "player" : "players"}`
            : `Needs ${MIN_PLAYERS} players · ${row.players} of ${MIN_PLAYERS}`}
        </span>
      </div>
      <span className="type-heading shrink-0 tabular-nums">
        {row.weekly_xp.toLocaleString("en-US")} <span className="type-small text-muted-foreground">XP</span>
      </span>
    </li>
  );
}
