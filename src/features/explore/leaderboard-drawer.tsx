"use client";

// Desktop Explore's leaderboard drawer (DESIGN.md §7 Explore). Closed: a maroon tab on the
// map's right edge. Open: the map narrows and the "School Leaderboard" card fills a side
// column, with the tab on the card's left edge. It sits left of the station hub when both
// are open. Phones don't get it: Leaderboard has its own tab there.

import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { data } from "@/lib/data";
import type { LeaderboardRow } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { rankSchools, type RankedRow } from "@/features/compete/compete";
import { usePlayer } from "@/features/hub/use-player";

const TOP = 5;

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; rows: LeaderboardRow[] };

/** The tab that opens and closes the drawer. `compact` is the small one used beside the hub. */
export function DrawerTab({
  open,
  onToggle,
  compact = false,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
}) {
  const Chevron = open ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="explore-leaderboard"
      aria-label={open ? "Hide the leaderboard" : "Show the leaderboard"}
      className={cn(
        "flex flex-col items-center gap-2 rounded-l-2xl bg-maroon text-on-maroon shadow-float outline-none hover:bg-maroon-600 focus-visible:ring-2 focus-visible:ring-gold",
        compact ? "w-8 py-2.5" : "w-12 py-4",
        className,
      )}
    >
      <Chevron className="size-5" aria-hidden />
      <Trophy className={cn("text-gold", compact ? "size-4" : "size-5")} aria-hidden />
      {!open && !compact && (
        <span className="text-sm font-bold [writing-mode:vertical-rl]" aria-hidden>
          Leaderboard
        </span>
      )}
    </button>
  );
}

export function LeaderboardCard({ className }: { className?: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { player } = usePlayer();
  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setAttempt((a) => a + 1);
  }, []);

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

  return (
    <section
      id="explore-leaderboard"
      aria-labelledby="explore-leaderboard-title"
      className={cn("flex flex-col rounded-3xl border border-border bg-surface p-6 shadow-card", className)}
    >
      <div className="flex items-baseline gap-2">
        <Trophy className="size-5 shrink-0 self-center text-gold-500" aria-hidden />
        <h2 id="explore-leaderboard-title" className="font-display text-[22px] font-semibold whitespace-nowrap text-maroon">
          School Leaderboard
        </h2>
        <span className="ml-auto shrink-0 text-[13px] text-muted-foreground">This week</span>
      </div>

      {load.status === "loading" && (
        <div className="mt-4 flex flex-col gap-3" aria-busy aria-label="Loading the leaderboard">
          {Array.from({ length: TOP }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      )}

      {load.status === "error" && (
        <div className="mt-4 flex flex-col items-start gap-3">
          <p className="font-semibold text-ink">The leaderboard didn&apos;t load.</p>
          <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

      {load.status === "ready" && <Standings rows={load.rows} mySchoolId={player.profile?.school_id ?? null} />}

      <Link
        href="/leaderboard"
        className="mt-4 self-start py-2 text-sm font-semibold text-maroon underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-maroon"
      >
        See full leaderboard
      </Link>
    </section>
  );
}

function Standings({ rows, mySchoolId }: { rows: LeaderboardRow[]; mySchoolId: number | null }) {
  const { rows: ranked, mine } = rankSchools(rows, mySchoolId);
  if (ranked.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">No check-ins yet this week. Be the first.</p>;
  }
  const top = ranked.slice(0, TOP);
  const max = Math.max(1, ...ranked.map((r) => r.weekly_xp));
  const pinned = mine && !top.includes(mine) ? mine : null;
  return (
    <ol className="mt-4 flex flex-col gap-3.5">
      {top.map((r) => (
        <Row key={r.school_id} row={r} max={max} />
      ))}
      {pinned && (
        <>
          <li aria-hidden className="h-px bg-border" />
          <Row row={pinned} max={max} />
        </>
      )}
    </ol>
  );
}

function Row({ row, max }: { row: RankedRow; max: number }) {
  return (
    <li className={cn("flex items-center gap-3", row.mine && "-mx-2 rounded-lg bg-cream px-2 py-1")} aria-current={row.mine ? "true" : undefined}>
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sand text-[13px] font-bold text-ink tabular-nums"
        aria-label={row.rank ? `Rank ${row.rank}` : "Unranked"}
      >
        {row.rank ?? "–"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate font-semibold text-ink">
            {row.name}
            {row.mine && <span className="font-normal text-muted-foreground"> · you</span>}
          </span>
          <span className="shrink-0 font-semibold text-ink tabular-nums">{row.weekly_xp.toLocaleString("en-US")} XP</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.round((row.weekly_xp / max) * 100)}%`, background: row.color ?? "var(--maroon-700)" }}
          />
        </div>
      </div>
    </li>
  );
}
