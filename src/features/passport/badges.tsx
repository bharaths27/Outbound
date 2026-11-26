"use client";

// Badges and the check-in streak on the passport, from rpc('my_game_progress') (migration
// 005_gamification). The backend decides what's earned; locked badges show greyed out
// with how to earn them. Streaks count Boston days in a row with a check-in.

import { Flame, Map as MapIcon, Moon, TrainFront, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { data } from "@/lib/data";
import type { BadgeId, GameProgress } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const BADGES: { id: BadgeId; name: string; how: string; icon: LucideIcon }[] = [
  { id: "line_collector", name: "Line Collector", how: "Check in on the Red, Orange and Green lines", icon: TrainFront },
  { id: "night_owl", name: "Night Owl", how: "Check in after 10 PM", icon: Moon },
  { id: "squad_goals", name: "Squad Goals", how: "Finish a quest with your squad", icon: Users },
  { id: "cross_town", name: "Cross-Town", how: "Visit 4 neighborhoods in one week", icon: MapIcon },
];

export function BadgesAndStreak({ className }: { className?: string }) {
  // undefined while loading; null when signed out (nothing to show).
  const [progress, setProgress] = useState<GameProgress | null | undefined | "error">(undefined);
  const [attempt, setAttempt] = useState(0);

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

      <ul className="grid grid-cols-2 gap-2 desk:grid-cols-4">
        {BADGES.map((b) => {
          const has = earned.has(b.id);
          const Icon = b.icon;
          return (
            <li
              key={b.id}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2.5",
                has ? "border-gold-500 bg-badge-earned" : "border-border bg-surface",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  has ? "bg-maroon text-gold" : "bg-sand text-badge-locked-ink",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm leading-tight font-bold", !has && "text-muted-foreground")}>{b.name}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{has ? "Earned" : b.how}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
