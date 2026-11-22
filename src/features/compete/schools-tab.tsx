"use client";

// Weekly school leaderboard (view leaderboard_weekly), DESIGN.md §11.2: podium, ranked list
// with bars, the player's contribution, and "How XP counts". Schools under the player
// minimum show "–" and "Needs 5 players · 3 of 5". The player's school is highlighted, and
// pinned above the list when it's far down. The data loads in compete-page.tsx so the
// podium can sit in the phone title band.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaderboardRow } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import type { Player } from "@/features/hub/use-player";
import { bostonDateKey } from "@/features/quests/daily";
import { PlayerAvatar } from "@/features/shell/shell-parts";
import { MIN_PLAYERS, type RankedRow, schoolAbbr, weeklyXp } from "./compete";

/** Pin the player's school above the list when it's this far down or more. */
const PIN_AFTER = 5;

export type SchoolsLoad = { status: "loading" } | { status: "error" } | { status: "ready"; rows: LeaderboardRow[] };

const FALLBACK_COLOR = "#6E5A5E";

function SchoolMark({ row, size, ring = false }: { row: Pick<RankedRow, "name" | "color">; size: number; ring?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <circle cx="32" cy="32" r={ring ? 29 : 32} fill={row.color ?? FALLBACK_COLOR} stroke={ring ? "#FBF6EC" : undefined} strokeWidth={ring ? 4 : undefined} />
      <text x="32" y="38.5" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontSize={schoolAbbr(row.name).length > 2 ? 16 : 18} fontWeight={700} fill="#FFFFFF">
        {schoolAbbr(row.name)}
      </text>
    </svg>
  );
}

/** Top three, 2-1-3. Sits in the maroon band on phones and in a maroon card on desktop. */
export function Podium({ rows, className }: { rows: RankedRow[]; className?: string }) {
  const order = [rows[1], rows[0], rows[2]].filter(Boolean);
  return (
    <ol
      aria-label="Top three schools"
      className={cn("mx-auto grid max-w-[760px] grid-cols-3 items-end gap-2 desk:gap-4", className)}
    >
      {order.map((r) => {
        const first = r.rank === 1;
        return (
          <li
            key={r.school_id}
            className="flex flex-col items-center gap-1.5 desk:gap-2"
            aria-label={`Rank ${r.rank}, ${r.name}, ${r.weekly_xp.toLocaleString("en-US")} XP${r.mine ? ", your school" : ""}`}
          >
            <span className="desk:hidden">
              <SchoolMark row={r} size={first ? 72 : 58} ring />
            </span>
            <span className="hidden desk:block">
              <SchoolMark row={r} size={first ? 84 : 68} ring />
            </span>
            <span className="text-center text-sm leading-tight font-bold text-white desk:text-lg">{r.name}</span>
            <span className="text-[13px] font-bold text-gold tabular-nums desk:text-[15px]">
              {r.weekly_xp.toLocaleString("en-US")} XP
            </span>
            <span
              aria-hidden
              className={cn(
                "flex w-full justify-center rounded-t-[14px] bg-maroon-600 pt-2 font-display text-[28px] font-bold text-gold desk:rounded-t-2xl desk:pt-3 desk:text-4xl",
                first ? "h-[92px] desk:h-[120px]" : r.rank === 2 ? "h-[68px] desk:h-[88px]" : "h-[52px] desk:h-[68px]",
                r.mine && "ring-2 ring-gold ring-inset",
              )}
            >
              {r.rank}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function SchoolsTab({
  load,
  ranked,
  player,
  playerLoaded,
  onRetry,
}: {
  load: SchoolsLoad;
  ranked: { rows: RankedRow[]; mine: RankedRow | null } | null;
  player: Player;
  playerLoaded: boolean;
  onRetry: () => void;
}) {
  if (load.status === "loading" || !ranked) {
    if (load.status === "error") return <LoadError onRetry={onRetry} />;
    return (
      <div className="flex flex-col gap-2" aria-busy aria-label="Loading the leaderboard">
        <Skeleton className="hidden h-[260px] w-full rounded-2xl desk:block" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const { rows, mine } = ranked;
  const podium = rows.filter((r) => r.rank !== null && r.rank <= 3);
  const showPin = mine !== null && rows.indexOf(mine) >= PIN_AFTER;
  const top = Math.max(1, ...rows.map((r) => r.weekly_xp));

  return (
    <div className="flex flex-col gap-3 desk:gap-6">
      {podium.length > 0 && (
        <section aria-hidden className="hidden rounded-2xl bg-maroon px-8 pt-7 desk:block">
          <Podium rows={podium} />
        </section>
      )}

      <div className="flex flex-wrap items-start gap-3 desk:gap-6">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-3">
          <div className="desk:hidden">
            <Contribution player={player} playerLoaded={playerLoaded} mine={mine} compact />
          </div>

          {showPin && mine && (
            <section aria-label="Your school" className="flex flex-col gap-1.5">
              <p className="type-eyebrow text-muted-foreground">Your school</p>
              <ol className="overflow-hidden rounded-[18px] border border-maroon bg-surface desk:rounded-xl">
                <SchoolRow row={mine} top={top} />
              </ol>
            </section>
          )}

          <section aria-label="This week’s standings" className="overflow-hidden rounded-[18px] border border-border bg-surface desk:rounded-xl">
            <ol>
              {rows.map((r) => (
                <SchoolRow key={r.school_id} row={r} top={top} />
              ))}
            </ol>
            <p className="border-t border-sand px-4 py-3 text-center text-xs text-muted-foreground desk:px-5 desk:text-left desk:text-[13px]">
              Schools need {MIN_PLAYERS} active players to rank. Resets Monday at 12:00 AM.
            </p>
          </section>
        </div>

        <aside className="hidden min-w-0 flex-[1_1_320px] flex-col gap-5 desk:flex">
          <Contribution player={player} playerLoaded={playerLoaded} mine={mine} />
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="font-display text-xl font-semibold text-maroon">How XP counts</h2>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-normal text-ink-2">
              {[
                ["XP", "Each quest you finish adds its XP to your school."],
                ["2×", "Cross-school check-ins count double for both schools."],
                ["Wk", "Totals reset every Monday. Schools need 5 active players to rank."],
              ].map(([chip, text]) => (
                <li key={chip} className="flex gap-2.5">
                  <span className="h-fit shrink-0 rounded-full bg-xp-chip px-2 py-0.5 text-xs font-bold text-xp-chip-ink">{chip}</span>
                  {text}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="type-heading">The leaderboard didn&apos;t load.</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function SchoolRow({ row, top }: { row: RankedRow; top: number }) {
  const pct = Math.round((row.weekly_xp / top) * 100);
  return (
    <li
      className={cn(
        "flex items-center gap-3 border-t border-sand px-3.5 py-3 first:border-t-0 desk:gap-4 desk:px-5 desk:py-3.5",
        row.mine && "bg-cream",
      )}
      aria-current={row.mine ? "true" : undefined}
    >
      <span
        className="w-[22px] shrink-0 text-center font-bold text-muted-foreground tabular-nums desk:w-7 desk:text-base"
        aria-label={row.rank ? `Rank ${row.rank}` : "Unranked"}
      >
        {row.rank ?? "–"}
      </span>
      <span className="desk:hidden">
        <SchoolMark row={row} size={36} />
      </span>
      <span className="hidden desk:block">
        <SchoolMark row={row} size={40} />
      </span>
      <div className="min-w-0 flex-1 desk:flex desk:items-center desk:gap-4">
        <div className="flex items-baseline justify-between gap-2 desk:block desk:w-[180px] desk:shrink-0">
          <span className="block truncate text-[15px] font-bold desk:text-base">
            {row.name}
            {row.mine && <span className="ml-1.5 rounded-full bg-maroon px-1.5 py-px align-middle text-[11px] font-bold text-white">You</span>}
          </span>
          <span className="shrink-0 text-[15px] font-semibold text-ink-2 tabular-nums desk:hidden">
            {row.weekly_xp.toLocaleString("en-US")}
          </span>
          <span className="hidden text-[13px] text-muted-foreground tabular-nums desk:block">
            {row.eligible ? `${row.players} players` : `Needs ${MIN_PLAYERS} players · ${row.players} of ${MIN_PLAYERS}`}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sand desk:mt-0 desk:h-2 desk:flex-1">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: row.color ?? FALLBACK_COLOR }} />
        </div>
        <span className="mt-1 block text-xs text-muted-foreground tabular-nums desk:hidden">
          {row.eligible ? `${row.players} players` : `Needs ${MIN_PLAYERS} players · ${row.players} of ${MIN_PLAYERS}`}
        </span>
        <span className="hidden w-[100px] shrink-0 text-right text-[15px] font-semibold text-ink-2 tabular-nums desk:block">
          {row.weekly_xp.toLocaleString("en-US")} XP
        </span>
      </div>
    </li>
  );
}

function Contribution({
  player,
  playerLoaded,
  mine,
  compact = false,
}: {
  player: Player;
  playerLoaded: boolean;
  mine: RankedRow | null;
  compact?: boolean;
}) {
  if (!playerLoaded) return null;
  const profile = player.profile;
  if (!profile) {
    return (
      <section className="flex items-center gap-3 rounded-[18px] border border-border bg-surface px-3.5 py-3 desk:flex-col desk:items-start desk:rounded-xl desk:p-5">
        <p className="flex-1 text-[15px] font-semibold">Sign in to add XP to your school.</p>
        <Button asChild size="sm" className="rounded-full">
          <Link href="/login?next=/leaderboard">Sign in</Link>
        </Button>
      </section>
    );
  }
  const xp = weeklyXp(player.visits, bostonDateKey(new Date()));
  const school = mine?.name ?? "school";
  const shell = {
    profile,
    school: mine ? { id: mine.school_id, name: mine.name, email_domain: "", color: mine.color } : null,
  };
  if (compact) {
    return (
      <section className="flex items-center gap-3 rounded-[18px] border border-border bg-surface px-3.5 py-3">
        <PlayerAvatar player={shell} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">Your {schoolAbbr(school)} contribution</p>
          <p className="text-[13px] text-muted-foreground tabular-nums">{xp.toLocaleString("en-US")} XP this week</p>
        </div>
        <Link
          href="/quests"
          className="flex h-10 shrink-0 items-center rounded-full bg-maroon px-3.5 text-[13px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
        >
          Earn more
        </Link>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center gap-3">
        <PlayerAvatar player={shell} size={52} />
        <div className="min-w-0">
          <p className="text-[17px] font-bold">Your {schoolAbbr(school)} contribution</p>
          <p className="truncate text-sm text-muted-foreground">
            {profile.display_name ?? "You"} · {school}
          </p>
        </div>
      </div>
      <p className="mt-3.5 font-display text-[32px] font-bold text-maroon tabular-nums">{xp.toLocaleString("en-US")} XP</p>
      <p className="text-sm text-muted-foreground">this week</p>
      <Link
        href="/quests"
        className="mt-4 flex h-[46px] items-center justify-center rounded-lg bg-maroon text-[15px] font-bold text-white outline-none hover:bg-maroon-600 focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
      >
        Earn more XP
      </Link>
    </section>
  );
}
