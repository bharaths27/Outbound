"use client";

// Quest of the Week (migration 005_gamification): rpc('quest_of_the_week') names one quest
// a week. Its first check-in that week earns its base XP again, so cards show a gold
// "2× XP" badge on it. The card leads Quests and floats over the map on Explore.

import { Crown, X } from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { data } from "@/lib/data";
import type { Quest, Station, Visit } from "@/lib/data/types";
import { bostonDateKey, bostonWeekStart } from "@/features/quests/daily";
import { cn } from "@/lib/utils";
import { QuestThumb } from "@/features/hub/category";
import { usePlayer } from "@/features/hub/use-player";

const thisWeek = () => bostonWeekStart(bostonDateKey(new Date()));

// One request per Boston week, shared by every badge. A long-lived tab asks again after
// Monday, and "no featured quest yet" or an error is retried on the next mount, not kept.
// Rejects on error, so the full card can offer Try again; badges treat it as "none".
let featured: { week: string; id: Promise<string | null> } | null = null;
function loadFeaturedId(): Promise<string | null> {
  const week = thisWeek();
  if (featured?.week !== week) {
    const entry: { week: string; id: Promise<string | null> } = {
      week,
      id: data.getQuestOfTheWeek().then(
        (q) => {
          const id = q?.quest_id ?? null;
          if (id === null && featured === entry) featured = null;
          return id;
        },
        (err: unknown) => {
          if (featured === entry) featured = null;
          throw err;
        },
      ),
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
    loadFeaturedId()
      .catch(() => null)
      .then((v) => !cancelled && setId(v));
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

type Featured =
  | { status: "loading" }
  | { status: "none" }
  | { status: "error" }
  | { status: "ready"; quest: Quest; station: Station | null };

/** The featured quest with its station. `retry` asks again after an error. */
function useFeaturedQuest(): { featured: Featured; retry: () => void } {
  const [featuredQuest, setFeatured] = useState<Featured>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadFeaturedId()
      .then(async (id): Promise<Featured> => {
        if (!id) return { status: "none" };
        const quest = await data.getQuest(id);
        if (!quest) return { status: "none" };
        const station = await data.getStation(quest.station_id).catch(() => null);
        return { status: "ready", quest, station };
      })
      .catch((): Featured => ({ status: "error" }))
      .then((v) => !cancelled && setFeatured(v));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return {
    featured: featuredQuest,
    retry: () => {
      setFeatured({ status: "loading" });
      setAttempt((a) => a + 1);
    },
  };
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
  const { featured: loaded, retry } = useFeaturedQuest();
  // The floating Explore card just stays out of the way unless there's a quest to show.
  if (loaded.status === "none" || (compact && loaded.status !== "ready")) return null;
  if (loaded.status === "loading") {
    return <div className={cn("h-[108px] animate-pulse rounded-[18px] bg-sand motion-reduce:animate-none desk:rounded-xl", className)} aria-hidden />;
  }
  if (loaded.status === "error") {
    // DESIGN.md §9 error state: title, one line, Try again.
    return (
      <section
        aria-label="Quest of the Week"
        className={cn("flex items-center gap-3 rounded-[18px] border border-border bg-surface p-3.5 desk:rounded-xl desk:p-4", className)}
      >
        <div className="min-w-0 flex-1">
          <p className="type-eyebrow text-muted-foreground">Quest of the Week</p>
          <p className="mt-0.5 font-semibold text-ink">This week&apos;s quest didn&apos;t load.</p>
          <p className="text-[13px] text-muted-foreground">Check your connection and try again.</p>
        </div>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </section>
    );
  }
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
        {where && <p className="mt-1.5 truncate text-[13px] text-on-maroon-muted">{where}</p>}
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

const HIDDEN_KEY = "outbound.qotw.hidden";

function ExploreCard() {
  const hubOpen = useSearchParams().has("station");
  const { player } = usePlayer();
  const { featured: loaded } = useFeaturedQuest();
  // Hidden until next week: the key holds the week it was hidden in.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === thisWeek());
    } catch {}
  }, []);
  const hide = (v: boolean) => {
    setHidden(v);
    try {
      if (v) localStorage.setItem(HIDDEN_KEY, thisWeek());
      else localStorage.removeItem(HIDDEN_KEY);
    } catch {}
  };
  if (loaded.status !== "ready") return null;
  return (
    // Phones: above the Ask Guide button, clear of the zoom buttons. Desktop: bottom middle, between
    // Ask Guide (bottom left) and the zoom / locate buttons (bottom right), under the map's columns.
    <div
      className={cn(
        "pointer-events-none absolute right-16 bottom-[84px] left-4 z-10 flex justify-center desk:bottom-4 desk:left-1/2 desk:right-auto desk:w-[min(440px,calc(100%-440px))] desk:-translate-x-1/2",
        hubOpen && "hidden",
      )}
    >
      {hidden ? (
        <button
          type="button"
          onClick={() => hide(false)}
          className="pointer-events-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-maroon px-4 text-sm font-semibold text-white shadow-float hover:brightness-110"
        >
          <Crown className="size-4 text-gold" aria-hidden />
          Quest of the Week
        </button>
      ) : (
        <div className="pointer-events-auto relative w-full">
          <QuestOfTheWeekCard compact visits={player.visits} className="pr-11" />
          <button
            type="button"
            aria-label="Hide the Quest of the Week"
            title="Hide"
            onClick={() => hide(true)}
            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-white/80 hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
