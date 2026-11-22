"use client";

// Today's Quests (/quests, DESIGN.md §2.3, reference mobile/quests and desktop/quests).
// A daily progress bar, category filters, the cross-school bonus, and quest cards with a
// done state. Done comes from today's check-ins (visits.visit_date), not a manual toggle:
// an open quest's square links to the quest, where the player checks in.

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { XP_PER_LEVEL, data, levelProgress } from "@/lib/data";
import type { Quest, QuestType, Station } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { CATEGORY, QuestThumb } from "@/features/hub/category";
import { LineLetter, groupLines } from "@/features/hub/line-badge";
import { XpChip } from "@/features/hub/quest-card";
import { usePlayer } from "@/features/hub/use-player";
import { PageHeader } from "@/features/shell/page-header";
import { QuestOfTheWeekCard, QuestOfWeekBadge } from "@/features/weekly/quest-of-the-week";
import { DAILY_COUNT, bostonDateKey, dailyEligible, doneToday, pickDailyQuests, xpToday } from "./daily";

type Filter = "all" | QuestType;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "food", label: "Food" },
  { id: "event", label: "Events" },
  { id: "scenic", label: "Scenery" },
];

const DOT: Record<QuestType, string> = { food: "bg-cat-food-ink", event: "bg-cat-event-ink", scenic: "bg-cat-scenery-ink" };

interface Loaded {
  quests: Quest[];
  stations: Map<string, Station>;
}

export function QuestsPage() {
  const [loaded, setLoaded] = useState<Loaded | null | "error">(null);
  const [filter, setFilter] = useState<Filter>("all");
  const { player } = usePlayer();
  const dateKey = bostonDateKey(new Date());

  useEffect(() => {
    let cancelled = false;
    Promise.all([data.getAllQuests(), data.getStations()])
      .then(([quests, stations]) => {
        if (!cancelled) setLoaded({ quests, stations: new Map(stations.map((s) => [s.id, s])) });
      })
      .catch(() => !cancelled && setLoaded("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  const daily = useMemo(
    () => (loaded && loaded !== "error" ? pickDailyQuests(dailyEligible(loaded.quests, new Date()), dateKey) : []),
    [loaded, dateKey],
  );
  const done = useMemo(() => doneToday(player.visits, dateKey), [player.visits, dateKey]);
  const doneQuests = daily.filter((q) => done.has(q.id));
  // Everything earned today, from check_in's xp_awarded (bonuses included), not base quest XP.
  // Only today's quests, so the XP agrees with "N of 5 done".
  const doneXp = useMemo(
    () => xpToday(player.visits, dateKey, new Set(daily.map((q) => q.id))),
    [player.visits, dateKey, daily],
  );
  const total = daily.length || DAILY_COUNT;
  const shown = filter === "all" ? daily : daily.filter((q) => q.type === filter);
  const progressLabel = `${doneQuests.length} of ${total} done · +${doneXp} XP today`;
  const profile = player.profile;

  return (
    <>
      <PageHeader
        title="Today’s Quests"
        desktopAside={
          <div className="w-full max-w-[380px] min-w-[260px] rounded-xl border border-border bg-surface px-[18px] py-4">
            <div className="flex justify-between gap-3 text-sm font-bold">
              <span>Daily progress</span>
              <span className="font-semibold text-muted-foreground tabular-nums">{progressLabel}</span>
            </div>
            <Progress value={doneQuests.length} max={total} className="mt-2.5 h-2.5 bg-sand" fill="bg-gold-500" />
          </div>
        }
      >
        <div className="flex items-center gap-3">
          <Progress value={doneQuests.length} max={total} className="h-2 flex-1 bg-white/20" fill="bg-gold" />
          <span className="text-[13px] text-on-maroon-muted tabular-nums">{progressLabel}</span>
        </div>
      </PageHeader>

      <div className="mx-auto w-full max-w-[720px] px-4 pt-3 pb-8 desk:max-w-[1360px] desk:px-8 desk:pt-6 desk:pb-12">
        <p className="mb-4 hidden text-base text-muted-foreground desk:block">
          Five quests across the T, new every morning. Check in at any of them for XP and a stamp.
        </p>
        <div className="flex flex-wrap items-start gap-6">
          <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-3 desk:gap-4">
            <div
              role="group"
              aria-label="Filter quests"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 desk:mx-0 desk:flex-wrap desk:px-0"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 desk:h-11 desk:px-[18px] desk:text-[15px]",
                    filter === f.id
                      ? "border-maroon bg-maroon text-white"
                      : "border-border-strong bg-surface text-ink hover:bg-sand desk:bg-sand desk:hover:bg-cream",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <QuestOfTheWeekCard />

            <div className="desk:hidden">
              <BonusBanner />
            </div>

            {loaded === null && <ListSkeleton />}
            {loaded === "error" && (
              <p className="type-body rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">
                Today’s quests didn’t load. Check your connection and refresh.
              </p>
            )}
            {loaded && loaded !== "error" && shown.length === 0 && (
              <p className="type-body rounded-xl border border-border bg-surface p-6 text-center text-muted-foreground">
                {daily.length === 0
                  ? "No quests yet. Tap a station on the map to see what’s nearby."
                  : `No ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()} quests today. Try another filter.`}
              </p>
            )}
            {shown.length > 0 && loaded && loaded !== "error" && (
              <ul className="grid grid-cols-1 gap-2.5 desk:grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))] desk:gap-3.5">
                {shown.map((q) => (
                  <QuestRow key={q.id} quest={q} station={loaded.stations.get(q.station_id)} done={done.has(q.id)} />
                ))}
              </ul>
            )}
            {!profile && loaded && loaded !== "error" && (
              <p className="type-small text-center text-muted-foreground">
                <Link href="/login?next=/quests" className="font-semibold text-maroon underline underline-offset-4">
                  Sign in
                </Link>{" "}
                to track today’s progress.
              </p>
            )}
          </main>

          <aside className="hidden min-w-0 flex-[1_1_320px] flex-col gap-5 desk:flex">
            <BonusBanner large />
            {profile && (
              <section className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-xl font-semibold text-maroon">Lv. {profile.level} Explorer</h2>
                  <span className="text-[13px] text-muted-foreground">Lv. {profile.level + 1} next</span>
                </div>
                <Progress
                  value={levelProgress(profile).into}
                  max={XP_PER_LEVEL}
                  label={`Progress to level ${profile.level + 1}`}
                  className="mt-3 h-2.5 bg-sand"
                  fill="bg-gold-500"
                />
                <p className="mt-1.5 text-[13px] text-muted-foreground tabular-nums">
                  {profile.xp.toLocaleString("en-US")} XP · {profile.xp_to_next_level} XP to go
                </p>
              </section>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function Progress({
  value,
  max,
  className,
  fill,
  label = "Quests done today",
}: {
  value: number;
  max: number;
  className?: string;
  fill: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("overflow-hidden rounded-full", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const PEOPLE =
  "M9 4.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zM17 6.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM3 19c.6-3 3-5 6-5s5.4 2 6 5M15 14.5c2.6-.3 5 1.4 5.6 4.5";

function BonusBanner({ large = false }: { large?: boolean }) {
  const icon = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-gold text-gold-foreground",
        large ? "size-[52px]" : "size-12",
      )}
    >
      <svg width={large ? 26 : 24} height={large ? 26 : 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={PEOPLE} />
      </svg>
    </div>
  );
  if (large) {
    return (
      <section className="rounded-xl bg-maroon p-5 text-white">
        {icon}
        <p className="mt-3.5 type-eyebrow text-gold">Cross-school bonus</p>
        <h2 className="mt-1 font-display text-2xl leading-tight font-semibold">Squad up across schools for 2× XP</h2>
        <p className="mt-2 text-sm leading-relaxed text-on-maroon-muted">
          Check in with your squad for +20% XP, or double XP if a squad-mate from another school checks in at the same
          quest within an hour. Cross-school stamps get a gold ring.
        </p>
        <Link
          href="/leaderboard?tab=squads"
          className="mt-4 inline-flex h-11 items-center rounded-lg bg-gold px-4 text-sm font-bold text-gold-foreground outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Start a squad
        </Link>
      </section>
    );
  }
  return (
    <Link
      href="/leaderboard?tab=squads"
      className="flex items-center gap-3 rounded-[18px] bg-maroon p-3.5 text-white outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="type-eyebrow text-gold">Cross-school bonus</p>
        <p className="mt-0.5 text-[15px] leading-snug font-semibold">
          +20% XP with your squad, or double if a squad-mate from another school checks in within an hour
        </p>
      </div>
    </Link>
  );
}

function QuestRow({ quest, station, done }: { quest: Quest; station: Station | undefined; done: boolean }) {
  const line = station ? groupLines(station.lines)[0] : undefined;
  const where = station ? `${station.neighborhood} · ${station.name}` : "";
  const cat = CATEGORY[quest.type];
  return (
    <li className="relative flex items-center gap-3 rounded-[18px] border border-border bg-surface p-2.5 desk:gap-3.5 desk:rounded-xl desk:p-3.5">
      <QuestThumb type={quest.type} photo={quest.photo_url} iconSize={34} className="size-16 shrink-0 rounded-lg desk:size-[76px]" />
      <div className="min-w-0 flex-1">
        {/* The title link covers the card, so the whole row opens the quest. */}
        <Link
          href={`/q/${quest.id}`}
          className="block text-base leading-tight font-bold outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-maroon desk:text-[17px]"
        >
          {quest.title}
        </Link>
        {station && (
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground desk:text-sm">
            {line && <LineLetter line={line.line} size={16} />}
            <span className="truncate">{where}</span>
          </p>
        )}
        <div className="mt-1.5 flex gap-1.5 desk:mt-2">
          <span className="inline-flex items-center gap-[5px] rounded-full bg-sand px-2.5 py-[3px] text-xs font-semibold text-ink-2">
            <span aria-hidden className={cn("size-2 rounded-full", DOT[quest.type])} />
            {cat.label}
          </span>
          <XpChip xp={quest.xp} className="text-xs" />
          <QuestOfWeekBadge questId={quest.id} />
        </div>
      </div>
      {done ? (
        <span
          role="img"
          aria-label="Done today"
          className="relative flex size-11 shrink-0 items-center justify-center rounded-md bg-maroon text-white"
        >
          <Check className="size-[22px]" strokeWidth={2.4} aria-hidden />
        </span>
      ) : (
        <span aria-hidden className="relative size-11 shrink-0 rounded-md border-2 border-[#CDBBA3] bg-surface" />
      )}
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-2.5 desk:grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))]" aria-hidden>
      {Array.from({ length: DAILY_COUNT }, (_, i) => (
        <li key={i} className="h-[86px] animate-pulse rounded-[18px] bg-sand motion-reduce:animate-none desk:h-[106px] desk:rounded-xl" />
      ))}
    </ul>
  );
}
