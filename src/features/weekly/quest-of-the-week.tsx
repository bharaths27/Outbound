"use client";

// Quest of the Week (migration 005_gamification): rpc('quest_of_the_week') names one quest
// a week. Its first check-in that week earns its base XP again, so cards show a gold
// "2× XP" badge on it. The card leads Quests and floats over the map on Explore.

import { Crown } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { data } from "@/lib/data";
import type { Quest, Station, Visit } from "@/lib/data/types";
import { bostonDateKey, bostonWeekStart } from "@/features/quests/daily";
import { cn } from "@/lib/utils";
import { QuestThumb } from "@/features/hub/category";
import { usePlayer } from "@/features/hub/use-player";

const thisWeek = () => bostonWeekStart(bostonDateKey(new Date()));

// One request per Boston week, shared by every badge. A long-lived tab asks again after
// Monday, and "no featured quest yet" or an error is retried on the next mount, not kept.
let featured: { week: string; id: Promise<string | null> } | null = null;
function loadFeaturedId(): Promise<string | null> {
  const week = thisWeek();
  if (featured?.week !== week) {
    const entry = {
      week,
      id: data
        .getQuestOfTheWeek()
        .then((q) => q?.quest_id ?? null)
        .catch(() => null)
        .then((id) => {
          if (id === null && featured === entry) featured = null;
          return id;
        }),
    };
    featured = entry;
  }
  return featured.id;
}

/** Whether the player already checked in to this quest this week (the bonus is used). */
export function bonusClaimed(questId: string, visits: Visit[] | undefined): boolean {
  const week = thisWeek();
  return Boolean(visits?.some((v) => v.quest_id === questId && v.visit_date >= week));
}

/** This week's featured quest id, or null (loading, none, or unavailable). */
export function useQuestOfTheWeekId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadFeaturedId().then((v) => !cancelled && setId(v));
    return () => {
      cancelled = true;
    };
  }, []);
  return id;
}

/** Gold "2× XP" pill for the featured quest. */
export function DoubleXpBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-gold px-2.5 py-[3px] text-xs font-bold whitespace-nowrap text-gold-foreground",
        className,
      )}
      title="Quest of the Week: your first check-in this week earns its XP twice"
    >
      <Crown className="size-3.5" aria-hidden />
      2× XP
    </span>
  );
}

/**
 * Renders the badge only on this week's quest. Pass the player's visits so it says the
 * bonus is used once they've checked in there this week (it's once per week).
 */
export function QuestOfWeekBadge({ questId, visits, className }: { questId: string; visits?: Visit[]; className?: string }) {
  const id = useQuestOfTheWeekId();
  if (id !== questId) return null;
  if (bonusClaimed(questId, visits)) {
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full bg-sand px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap text-muted-2", className)}>
        <Crown className="size-3.5" aria-hidden />
        2× XP claimed
      </span>
    );
  }
  return <DoubleXpBadge className={className} />;
}

type Loaded = { quest: Quest; station: Station | null } | null;

/** The featured quest with its station, or null while loading or when there isn't one. */
function useFeaturedQuest(): Loaded {
  const id = useQuestOfTheWeekId();
  const [loaded, setLoaded] = useState<Loaded>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    data
      .getQuest(id)
      .then(async (quest) => {
        if (!quest) return null;
        const station = await data.getStation(quest.station_id).catch(() => null);
        return { quest, station };
      })
      .then((v) => !cancelled && setLoaded(v))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  return loaded;
}

/**
 * The Quest of the Week card. `compact` is the slim version that floats over the map on
 * Explore; the full card leads the Quests page.
 */
export function QuestOfTheWeekCard({
  compact = false,
  visits,
  className,
}: {
  compact?: boolean;
  /** The player's visits, so the card says when this week's bonus is already used. */
  visits?: Visit[];
  className?: string;
}) {
  const loaded = useFeaturedQuest();
  if (!loaded) return null;
  const { quest, station } = loaded;
  const claimed = bonusClaimed(quest.id, visits);
  const badge = claimed ? (
    <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-white/15 px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap text-white">
      <Crown className="size-3.5" aria-hidden />
      Claimed
    </span>
  ) : (
    <DoubleXpBadge className="self-start" />
  );
  const where = station ? `${station.name} · ${station.neighborhood}` : null;

  if (compact) {
    return (
      <Link
        href={`/q/${quest.id}`}
        className={cn(
          "flex items-center gap-2.5 rounded-xl bg-maroon py-2 pr-3 pl-2 text-white shadow-float outline-none focus-visible:ring-2 focus-visible:ring-gold",
          className,
        )}
      >
        <QuestThumb type={quest.type} photo={quest.photo_url} iconSize={22} className="size-10 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold tracking-[0.08em] text-gold uppercase">Quest of the Week</span>
          <span className="block truncate text-sm font-bold">{quest.title}</span>
        </span>
        {badge}
      </Link>
    );
  }

  return (
    <Link
      href={`/q/${quest.id}`}
      className={cn(
        "flex items-center gap-3.5 rounded-[18px] bg-maroon p-3.5 text-white outline-none focus-visible:ring-2 focus-visible:ring-gold desk:rounded-xl desk:p-4",
        className,
      )}
    >
      <QuestThumb type={quest.type} photo={quest.photo_url} iconSize={30} className="size-16 shrink-0 rounded-lg desk:size-[76px]" />
      <div className="min-w-0 flex-1">
        <p className="type-eyebrow text-gold">Quest of the Week</p>
        <p className="mt-0.5 font-display text-xl leading-tight font-semibold">{quest.title}</p>
        {where && <p className="mt-1 truncate text-[13px] text-on-maroon-muted">{where}</p>}
        <p className="mt-1.5 text-[13px] text-on-maroon-muted">
          {claimed
            ? "You've claimed this week's double XP. A new Quest of the Week comes Monday."
            : "Your first check-in this week earns its XP twice."}
        </p>
      </div>
      {badge}
    </Link>
  );
}

/** Explore's floating card. Steps aside on phones while the station hub drawer is up. */
export function ExploreQuestOfTheWeek() {
  return (
    <Suspense fallback={null}>
      <ExploreCard />
    </Suspense>
  );
}

function ExploreCard() {
  const hubOpen = useSearchParams().has("station");
  const { player } = usePlayer();
  return (
    // Phones: above the Ask Guide button, clear of the zoom buttons. Desktop: bottom center.
    <div
      className={cn(
        "pointer-events-none absolute right-16 bottom-[84px] left-4 z-10 desk:right-auto desk:bottom-6 desk:left-1/2 desk:block desk:w-[380px] desk:-translate-x-1/2",
        hubOpen && "hidden",
      )}
    >
      <QuestOfTheWeekCard compact visits={player.visits} className="pointer-events-auto" />
    </div>
  );
}
