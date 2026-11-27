"use client";

// The seasonal row on the passport. Live seasons glow and show progress (x of 3 days),
// earned ones show their ink date, the rest sit greyed out with when they come back.

import { useEffect, useState } from "react";
import { data } from "@/lib/data";
import { cn } from "@/lib/utils";
import { DAYS_NEEDED, seasonalStamps, type SeasonView } from "./seasonal";
import { inkDate } from "./fresh-stamps";

const bostonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

export function SeasonalStamps({ userId }: { userId: string }) {
  const [views, setViews] = useState<SeasonView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    data
      .getVisits(userId)
      .then((v) => !cancelled && setViews(seasonalStamps(v.map((x) => x.visit_date), bostonToday())))
      .catch(() => !cancelled && setViews(seasonalStamps([], bostonToday())));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!views) return <div className="h-[150px] animate-pulse rounded-xl bg-sand motion-reduce:animate-none" aria-hidden />;
  const earned = views.filter((v) => v.earned).length;
  // Live first, then earned, then the rest in calendar order.
  const ordered = [...views].sort((a, b) => Number(b.live) - Number(a.live) || Number(b.earned) - Number(a.earned));

  return (
    <section aria-labelledby="seasonal-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="seasonal-title" className="font-semibold text-ink">
          Seasonal stamps
        </h3>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {earned} of {views.length}
        </span>
      </div>
      <p className="-mt-2 text-[13px] text-muted-foreground">Only out for part of the year. Check in on {DAYS_NEEDED} different days during the season to earn one.</p>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 desk:grid desk:grid-cols-6 desk:overflow-visible">
        {ordered.map((v) => (
          <li key={v.season.id} className="w-[104px] shrink-0 snap-start desk:w-auto">
            <SeasonTile v={v} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SeasonTile({ v }: { v: SeasonView }) {
  const { season, earned, live, daysThisWindow, earnedOn } = v;
  const status = earned ? `Earned ${inkDate(`${earnedOn}T12:00:00`)}` : live ? `${daysThisWindow} of ${DAYS_NEEDED} days` : season.when;
  return (
    <div
      className="group flex flex-col items-center gap-1.5 text-center"
      aria-label={`${season.name}: ${earned ? "earned" : live ? `live now, ${daysThisWindow} of ${DAYS_NEEDED} days` : `locked, comes back ${season.when}`}`}
    >
      <div className={cn("relative grid aspect-square w-full place-items-center rounded-full", live && !earned && "ring-2 ring-gold ring-offset-2 ring-offset-surface")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/seasonal/${season.id}.webp`}
          alt=""
          className={cn(
            "size-full object-contain transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105 motion-reduce:transition-none",
            !earned && "opacity-45 grayscale",
            live && !earned && "opacity-80 grayscale-[.4]",
          )}
        />
        {live && !earned && (
          <span className="absolute -top-1 right-0 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-bold text-ink shadow-sm">Live</span>
        )}
      </div>
      <p className="text-[12px] leading-tight font-semibold text-ink">{season.name}</p>
      <p className={cn("text-[11px] leading-tight", earned ? "text-maroon" : "text-muted-foreground")}>{status}</p>
      {live && !earned && (
        <div className="h-1 w-3/4 overflow-hidden rounded-full bg-sand" aria-hidden>
          <div className="h-full rounded-full bg-gold transition-[width] duration-500" style={{ width: `${(daysThisWindow / DAYS_NEEDED) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
