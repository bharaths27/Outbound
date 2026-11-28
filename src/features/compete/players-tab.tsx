"use client";

// Players tab (view leaderboard_players_weekly): public players ranked by this week's XP,
// with the same ranked rows as Schools. Players set to friends-only or ghost aren't listed;
// the note says so, so a missing name isn't a surprise.

import { SchoolLogo } from "@/features/schools/school-logo";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FriendButton, useFriendships } from "@/features/friends/friends";
import { data } from "@/lib/data";
import type { PlayerLeaderboardRow } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; rows: PlayerLeaderboardRow[] };

export function PlayersTab({ myId, active }: { myId: string | null; active: boolean }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const friends = useFriendships(active ? myId : null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    data
      .getPlayerLeaderboard()
      .then((rows) => !cancelled && setLoad({ status: "ready", rows }))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [active, attempt]);

  if (load.status === "loading") {
    return (
      <ul className="overflow-hidden rounded-xl border border-border bg-surface" aria-busy aria-label="Loading players">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="h-[62px] border-t border-sand first:border-t-0" />
        ))}
      </ul>
    );
  }
  if (load.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="type-heading">The leaderboard didn’t load.</p>
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

  const { rows } = load;
  const top = Math.max(1, ...rows.map((r) => r.weekly_xp));
  const mine = myId ? rows.find((r) => r.user_id === myId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-10 text-center">
          <p className="type-heading">No one’s on the board yet this week</p>
          <p className="type-body max-w-sm text-muted-foreground">Finish a quest to be first.</p>
          <Button asChild>
            <Link href="/">Open the map</Link>
          </Button>
        </div>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((r) => (
            <PlayerRow key={r.user_id} row={r} top={top} mine={r.user_id === myId} friends={myId ? friends : null} />
          ))}
        </ol>
      )}
      <p className="type-small text-center text-muted-foreground">
        {mine
          ? `You’re #${mine.rank} this week.`
          : "This list shows the top 50 players with a public profile."}{" "}
        Resets Monday at 12:00 AM.{" "}
        {!mine && myId && (
          <Link href="/settings/privacy" className="font-semibold text-maroon underline underline-offset-4">
            Privacy settings
          </Link>
        )}
      </p>
    </div>
  );
}

function PlayerRow({
  row,
  top,
  mine,
  friends,
}: {
  row: PlayerLeaderboardRow;
  top: number;
  mine: boolean;
  friends: ReturnType<typeof useFriendships> | null;
}) {
  const pct = Math.round((row.weekly_xp / top) * 100);
  const initial = row.display_name.trim().charAt(0).toUpperCase() || "?";
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-t border-sand px-3.5 py-2.5 transition-colors first:border-t-0 hover:bg-cream/60 desk:gap-4 desk:px-5 desk:py-3",
        mine && "bg-cream",
      )}
      aria-current={mine ? "true" : undefined}
    >
      <span
        className={cn(
          "w-[22px] shrink-0 text-center font-bold tabular-nums desk:w-7 desk:text-base",
          row.rank <= 3 ? "text-maroon" : "text-muted-foreground",
        )}
        aria-label={`Rank ${row.rank}`}
      >
        {row.rank}
      </span>
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold font-display text-lg font-bold text-gold-foreground desk:size-10"
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1 desk:flex desk:items-center desk:gap-4">
        <div className="flex items-baseline justify-between gap-2 desk:block desk:w-[220px] desk:shrink-0">
          <span className="block truncate text-sm font-bold desk:text-[15px]">
            <Link href={`/u/${row.user_id}`} className="hover:text-maroon hover:underline">
              {row.display_name}
            </Link>
            {mine && <span className="ml-1.5 rounded-full bg-maroon px-1.5 py-px align-middle text-[11px] font-bold text-white">You</span>}
          </span>
          <span className="shrink-0 text-[15px] font-semibold text-ink-2 tabular-nums desk:hidden">
            {row.weekly_xp.toLocaleString("en-US")}
          </span>
          <span className="hidden items-center gap-1.5 truncate text-[13px] text-muted-foreground desk:flex">
            <SchoolLogo school={{ name: row.school_name }} height={18} />
            {row.school_name}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand desk:mt-0 desk:h-2 desk:flex-1">
          <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground desk:hidden">
          <SchoolLogo school={{ name: row.school_name }} height={16} />
          {row.school_name}
        </span>
        <span className="hidden w-[100px] shrink-0 text-right text-[15px] font-semibold text-ink-2 tabular-nums desk:block">
          {row.weekly_xp.toLocaleString("en-US")} XP
        </span>
      </div>
      {friends && !mine && <FriendButton name={row.display_name} userId={row.user_id} friends={friends} />}
    </li>
  );
}
