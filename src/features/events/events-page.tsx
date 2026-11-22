"use client";

// Events (/events): every event quest (museums, markets, historic houses, pop-ups) in one list,
// open-now first, with its station, hours, and a link to the quest or a route on the map. The
// times are each spot's regular opening hours from the quest content, not a live calendar.

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { data } from "@/lib/data";
import type { Quest, Station } from "@/lib/data/types";
import { QuestThumb } from "@/features/hub/category";
import { openState } from "@/features/hub/hours";
import { QuestMeta, XpChip } from "@/features/hub/quest-card";
import { PageHeader } from "@/features/shell/page-header";

interface Loaded {
  events: Quest[];
  stations: Map<string, Station>;
}

/** "Fri,Sat 07:00-17:00" → "Fri, Sat 7:00 to 17:00"; "always" → "Open any time". */
function hoursText(hours: string | null): string | null {
  if (!hours) return null;
  if (hours.trim().toLowerCase() === "always") return "Open any time";
  return hours.replace(/,/g, ", ").replace(/\b0(\d):/g, "$1:").replace(/-(\d)/g, " to $1").replace(/;\s*/g, " · ");
}

export function EventsPage() {
  const [loaded, setLoaded] = useState<Loaded | null | "error">(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    Promise.all([data.getAllQuests(), data.getStations()])
      .then(([quests, stations]) => {
        if (!cancelled)
          setLoaded({ events: quests.filter((q) => q.type === "event"), stations: new Map(stations.map((s) => [s.id, s])) });
      })
      .catch(() => !cancelled && setLoaded("error"));
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Open now first, then by XP.
  const sorted = useMemo(() => {
    if (!loaded || loaded === "error") return [];
    const open = (q: Quest) => (openState(q.hours, now)?.open === false ? 1 : 0);
    return [...loaded.events].sort((a, b) => open(a) - open(b) || b.xp - a.xp);
  }, [loaded, now]);

  return (
    <>
      <PageHeader title="Events" />
      <div className="mx-auto w-full max-w-[720px] px-4 pt-3 pb-8 desk:max-w-[1360px] desk:px-8 desk:pt-6 desk:pb-12">
        <p className="mb-4 text-base text-muted-foreground">
          Museums, markets, and historic spots near the T. Each one is a quest: go during its hours and check in for XP and
          a stamp. Times are regular opening hours.
        </p>
        {loaded === null && <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">Loading events…</p>}
        {loaded === "error" && (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">
            Events didn’t load. Check your connection and refresh.
          </p>
        )}
        {loaded && loaded !== "error" && sorted.length === 0 && (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">No events right now.</p>
        )}
        {loaded && loaded !== "error" && sorted.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 desk:grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] desk:gap-4">
            {sorted.map((q) => {
              const station = loaded.stations.get(q.station_id);
              const hours = hoursText(q.hours);
              const go = `/?go=${q.lat.toFixed(5)},${q.lon.toFixed(5)}&name=${encodeURIComponent(q.title)}`;
              return (
                <li key={q.id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
                  <QuestThumb type={q.type} photo={q.photo_url} className="size-24 shrink-0 rounded-xl" iconSize={36} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-start gap-2">
                      <Link href={`/q/${q.id}`} className="min-w-0 flex-1 font-semibold leading-snug text-ink hover:underline">
                        {q.title}
                      </Link>
                      <XpChip xp={q.xp} />
                    </div>
                    {station && <p className="text-[13px] text-muted-foreground">Near {station.name}</p>}
                    <QuestMeta quest={q} now={now} />
                    {hours && <p className="text-xs text-muted-foreground">{hours}</p>}
                    <div className="mt-1 flex gap-2">
                      <Link
                        href={`/q/${q.id}`}
                        className="inline-flex h-9 items-center rounded-full bg-maroon px-3.5 text-sm font-semibold text-white hover:bg-maroon-600"
                      >
                        Open quest
                      </Link>
                      <Link
                        href={go}
                        className="inline-flex h-9 items-center gap-1 rounded-full border border-border-strong px-3.5 text-sm font-semibold text-ink hover:bg-sand"
                      >
                        <MapPin className="size-4" aria-hidden />
                        Route
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
