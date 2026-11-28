"use client";

// Badges and the check-in streak on the passport, from rpc('my_game_progress') (migration
// 005_gamification). The backend decides what's earned; locked badges show greyed out
// with how to earn them. Streaks count Boston days in a row with a check-in.

import { ChevronDown, Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { data } from "@/lib/data";
import type { GameProgress } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { BADGE_ART, BADGE_ORDER, BadgePatch } from "@/features/badges/badge-patch";
import { COMING_SOON } from "@/features/badges/rules";
import { showBadge, unlockDates } from "@/features/badges/unlock";
import { inkDate } from "./fresh-stamps";


export function BadgesAndStreak({ className, userId = null }: { className?: string; userId?: string | null }) {
  // undefined while loading; null when signed out (nothing to show).
  const [progress, setProgress] = useState<GameProgress | null | undefined | "error">(undefined);
  const [attempt, setAttempt] = useState(0);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    data
      .getGameProgress()
      .then((p) => !cancelled && setProgress(p))
      .catch(() => !cancelled && setProgress("error"));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (progress === null) return null;
  if (progress === "error") {
    // DESIGN.md §9 error state: title, one line, Try again.
    return (
      <section aria-label="Badges and streak" className={cn("flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3", className)}>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Badges and streak didn&apos;t load.</p>
          <p className="text-[13px] text-muted-foreground">Your stamps are fine. Try again in a moment.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setProgress(undefined);
            setAttempt((a) => a + 1);
          }}
        >
          Try again
        </Button>
      </section>
    );
  }
  if (progress === undefined) {
    return <div className={cn("h-[132px] animate-pulse rounded-xl bg-sand motion-reduce:animate-none", className)} aria-hidden />;
  }

  const earned = new Set(progress.badges);
  // Earned first, then ones you can still get, then coming soon.
  const ordered = [...BADGE_ORDER].sort(
    (a, b) => Number(earned.has(b)) - Number(earned.has(a)) || Number(COMING_SOON.has(a)) - Number(COMING_SOON.has(b)),
  );
  const shown = all ? ordered : ordered.slice(0, 8);
  const dates = unlockDates(userId);
  const streak = progress.current_streak;
  return (
    <section aria-label="Badges and streak" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-3 rounded-xl bg-maroon px-4 py-3 text-white">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            streak > 0 ? "bg-gold text-gold-foreground" : "bg-white/12 text-on-maroon-muted",
          )}
        >
          <Flame className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl leading-tight font-semibold tabular-nums">
            {streak > 0 ? `${streak}-day streak` : "No streak yet"}
          </p>
          <p className="text-[13px] text-on-maroon-muted tabular-nums">
            {streak > 0 ? "Check in tomorrow to keep it going." : "Check in on back-to-back days to start one."}
            {progress.longest_streak > 0 && ` Best: ${progress.longest_streak} ${progress.longest_streak === 1 ? "day" : "days"}.`}
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">
          Badges <span className="font-normal text-muted-foreground tabular-nums">· {earned.size} of {BADGE_ORDER.length}</span>
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 desk:grid-cols-4">
        {shown.map((id) => {
          const has = earned.has(id);
          const soon = !has && COMING_SOON.has(id);
          const b = BADGE_ART[id];
          const body = (
            <>
              <BadgePatch id={id} locked={!has} size={56} className={cn(has && "transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110")} />
              <span className="min-w-0">
                <span className={cn("block text-sm leading-tight font-bold", !has && "text-muted-foreground")}>{b.name}</span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  {has ? (dates[id] ? `Earned ${inkDate(dates[id]).slice(0, -5).toLowerCase().replace(/^./, (c) => c.toUpperCase())} · replay` : "Earned · tap to replay") : b.how}
                </span>
                {soon && <span className="mt-0.5 inline-block rounded-full bg-sand px-1.5 py-px text-[10px] font-bold text-muted-foreground uppercase">Coming soon</span>}
              </span>
            </>
          );
          return (
            <li key={id}>
              {has ? (
                <button
                  type="button"
                  onClick={() => showBadge(id)}
                  aria-label={`${b.name}, earned. Replay the unlock`}
                  className="group ob-shine flex h-full w-full items-center gap-2.5 rounded-xl border border-gold-500 bg-badge-earned p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-maroon"
                >
                  {body}
                </button>
              ) : (
                <div className="flex h-full items-center gap-2.5 rounded-xl border border-dashed border-border-strong bg-surface p-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {!all && ordered.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="mx-auto inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-maroon hover:bg-sand">
          Show all {ordered.length} badges <ChevronDown className="size-4" aria-hidden />
        </button>
      )}
    </section>
  );
}
