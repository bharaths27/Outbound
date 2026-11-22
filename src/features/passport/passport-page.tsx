"use client";

// "My Passport" (DESIGN.md §11.1): the reference's stamp-book look (profile strip, book
// page with a ribbon, stamp grid, legend) over the app's structure: Your stamps, grouped by
// neighborhood with tier progress, and To explore. Desktop adds a profile card with stats and
// a "Next stamp" card beside the book. Tiers and counts come from the passport view.

import { Compass, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { data, levelProgress as sharedLevelProgress } from "@/lib/data";
import type { Profile, School, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { TIER_LABEL, buildPassport, progressLine, type NeighborhoodView, type PassportView } from "./build-passport";
import { BadgesAndStreak } from "./badges";
import { Stamp } from "./stamp";
import { PageHeader } from "@/features/shell/page-header";
import { PlayerAvatar } from "@/features/shell/shell-parts";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "signed-out" }
  | { status: "ready"; profile: Profile; school: School | null; view: PassportView };

const TIER_FILL: Record<Tier, string> = { bronze: "bg-tier-bronze", silver: "bg-tier-silver", gold: "bg-tier-gold" };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const stationHref = (id: string) => `/?station=${encodeURIComponent(id)}`;

async function loadPassport(): Promise<Load> {
  const profile = await data.getCurrentUser();
  if (!profile) return { status: "signed-out" };
  const [rows, quests, stations, schools] = await Promise.all([
    data.getPassport(profile.id),
    data.getAllQuests(),
    data.getStations(),
    data.getSchools().catch(() => [] as School[]),
  ]);
  const school = schools.find((s) => s.id === profile.school_id) ?? null;
  return { status: "ready", profile, school, view: buildPassport(rows, quests, stations) };
}

export function PassportPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadPassport()
      .then((l) => !cancelled && setLoad(l))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const ready = load.status === "ready" ? load : null;
  return (
    <>
      <PageHeader title="My Passport" className="desk:pb-0">
        {ready && <ProfileStrip profile={ready.profile} school={ready.school} />}
      </PageHeader>
      {/* Phones: the maroon band continues behind the book page. */}
      <div className="bg-maroon px-2.5 desk:bg-transparent desk:px-0">
        <div className="mx-auto flex w-full max-w-[720px] flex-wrap items-start gap-6 desk:max-w-[1360px] desk:px-8 desk:pt-6 desk:pb-12">
          {ready && (
            <aside className="hidden min-w-0 flex-[1_1_300px] flex-col gap-5 desk:flex">
              <ProfileCard profile={ready.profile} school={ready.school} view={ready.view} />
              <NextStamp view={ready.view} />
            </aside>
          )}
          <main className="relative min-w-0 flex-[999_1_640px] desk:rounded-[30px] desk:bg-maroon desk:p-4 desk:shadow-[0_14px_36px_rgb(74_20_36/0.22)]">
            <div className="relative flex min-h-[calc(100dvh-200px)] flex-col gap-4 rounded-t-[22px] border border-b-0 border-divider bg-surface px-3.5 pt-4 pb-6 desk:min-h-0 desk:rounded-[20px] desk:border-0 desk:bg-paper desk:px-6 desk:pt-6">
              {/* Bookmark ribbon */}
              <svg aria-hidden width="22" height="40" viewBox="0 0 22 40" className="absolute -top-1 right-[22px] desk:right-8">
                <path d="M0 0h22v40l-11-8-11 8z" className="fill-gold-500" />
              </svg>
              {load.status === "loading" && <PassportSkeleton />}
              {load.status === "error" && (
                <Centered
                  title="Your passport didn’t load."
                  body="Check your connection, then try again."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setLoad({ status: "loading" });
                        setAttempt((n) => n + 1);
                      }}
                    >
                      Try again
                    </Button>
                  }
                />
              )}
              {load.status === "signed-out" && (
                <Centered
                  title="Sign in to start your passport"
                  body="Every quest you finish adds a stamp. Collect enough in a neighborhood to go from Bronze to Gold."
                  action={
                    <Button asChild>
                      <Link href="/login?next=/passport">Sign in</Link>
                    </Button>
                  }
                />
              )}
              {ready && <Passport profile={ready.profile} view={ready.view} />}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

const STAR = "M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z";

function levelProgress(profile: Profile) {
  const { into, pct } = sharedLevelProgress(profile);
  return { pct: pct * 100, into };
}

/** Phones: avatar, name, school, level pill, and XP to the next level, in the title band. */
function ProfileStrip({ profile, school }: { profile: Profile; school: School | null }) {
  const { pct } = levelProgress(profile);
  return (
    <div className="flex items-center gap-3">
      <PlayerAvatar player={{ profile, school }} size={56} className="text-2xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-lg font-bold">{profile.display_name ?? "Explorer"}</span>
          {school && <span className="truncate text-[13px] text-on-maroon-muted">{school.name}</span>}
          <span className="ml-auto shrink-0 rounded-full bg-gold px-2.5 py-[3px] text-xs font-bold text-gold-foreground">
            Lv. {profile.level} Explorer
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Progress to level ${profile.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-on-maroon-muted tabular-nums">
          {profile.xp.toLocaleString("en-US")} XP · {profile.xp_to_next_level} to Lv. {profile.level + 1}
        </p>
      </div>
    </div>
  );
}

function ProfileCard({ profile, school, view }: { profile: Profile; school: School | null; view: PassportView }) {
  const { pct } = levelProgress(profile);
  const gold = view.visited.filter((n) => n.tier === "gold").length;
  const cross = view.visited.reduce((s, n) => s + n.earned.filter((e) => e.crossSchool).length, 0);
  return (
    <section aria-label="Profile" className="rounded-2xl bg-maroon p-6 text-center text-white">
      <div className="flex justify-center">
        <PlayerAvatar player={{ profile, school }} size={96} />
      </div>
      <p className="mt-3 font-display text-[28px] font-semibold">{profile.display_name ?? "Explorer"}</p>
      {school && <p className="text-sm text-on-maroon-muted">{school.name}</p>}
      <div className="mt-4 rounded-2xl bg-paper p-3.5 text-left text-ink">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-lg font-semibold text-maroon">Lv. {profile.level} Explorer</span>
          <span className="text-[13px] text-muted-foreground">Lv. {profile.level + 1} next</span>
        </div>
        <div
          role="progressbar"
          aria-label={`Progress to level ${profile.level + 1}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-sand"
        >
          <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground tabular-nums">
          {profile.xp.toLocaleString("en-US")} XP · {profile.xp_to_next_level} to go
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Stamps", view.totalStamps],
          ["Gold", gold],
          ["Cross-school", cross],
        ].map(([label, n]) => (
          <div key={label}>
            <dt className="text-xs text-on-maroon-muted">{label}</dt>
            <dd className="mt-0.5 font-display text-2xl font-bold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The first neighborhood not visited yet, or the closest next tier. */
function NextStamp({ view }: { view: PassportView }) {
  const fresh = view.unvisited[0];
  const climbing = [...view.visited]
    .filter((n) => n.nextTier && n.locked.length >= n.questsToNextTier)
    .sort((a, b) => a.questsToNextTier - b.questsToNextTier)[0];
  const target = fresh
    ? {
        name: fresh.neighborhood,
        body: `Finish one quest in ${fresh.neighborhood} to earn its Bronze stamp.`,
        station: fresh.stations[0],
      }
    : climbing
      ? { name: climbing.neighborhood, body: `${progressLine(climbing)} in ${climbing.neighborhood}.`, station: climbing.stations[0] }
      : null;
  if (!target) return null;
  return (
    <section aria-label="Next stamp" className="rounded-2xl border border-border bg-surface p-5">
      <p className="type-eyebrow text-maroon-600">Next stamp</p>
      <p className="mt-2.5 font-display text-xl font-semibold">{target.name}</p>
      {target.station && <p className="mt-0.5 text-[13px] text-muted-foreground">near {target.station.name}</p>}
      <p className="mt-3 mb-3.5 text-sm leading-normal text-muted-2">{target.body}</p>
      {target.station && (
        <Link
          href={stationHref(target.station.id)}
          className="flex h-[46px] items-center justify-center rounded-lg bg-maroon text-[15px] font-bold text-white outline-none hover:bg-maroon-600 focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
        >
          See {target.name} quests
        </Link>
      )}
    </section>
  );
}

function Legend() {
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 border-t border-divider pt-2.5 text-xs text-muted-2 desk:grid-cols-4">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full border-[2.5px] border-tier-bronze" />
        <b className="text-ink">Bronze</b> 1 quest
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full bg-tier-silver" />
        <b className="text-ink">Silver</b> 3 quests
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full bg-gold-500" />
        <b className="text-ink">Gold</b> 5 quests
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" className="fill-gold-500">
          <path d={STAR} />
        </svg>
        <b className="text-ink">Cross-school</b> gold ring
      </span>
    </div>
  );
}

function Passport({ profile, view }: { profile: Profile; view: PassportView }) {
  const empty = view.visited.length === 0;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 pr-9">
        <h2 className="font-display text-xl font-semibold text-maroon desk:text-[28px] desk:italic">Boston Passport</h2>
        <span className="text-right text-[13px] text-muted-foreground tabular-nums">
          {view.totalStamps} {view.totalStamps === 1 ? "stamp" : "stamps"}
          <span className="hidden desk:inline">
            {" "}
            · {view.visited.length} {view.visited.length === 1 ? "neighborhood" : "neighborhoods"} · Level {profile.level}
          </span>
        </span>
      </div>

      <BadgesAndStreak />

      <Tabs defaultValue={empty ? "explore" : "stamps"} className="gap-4">
        <TabsList className="w-full desk:w-fit">
          <TabsTrigger value="stamps">Your stamps</TabsTrigger>
          <TabsTrigger value="explore">To explore</TabsTrigger>
        </TabsList>

        <TabsContent value="stamps" className="flex flex-col gap-8">
          {empty ? (
            <Centered
              title="No stamps yet"
              body="Pick a quest near you to earn your first."
              action={
                <Button asChild>
                  <Link href="/">Open the map</Link>
                </Button>
              }
            />
          ) : (
            view.visited.map((n) => <Neighborhood key={n.neighborhood} n={n} />)
          )}
        </TabsContent>

        <TabsContent value="explore" className="flex flex-col gap-2">
          {view.unvisited.length === 0 ? (
            <Centered title="You’ve been everywhere" body="Every neighborhood with quests has at least one of your stamps." />
          ) : (
            <>
              {empty && <p className="type-body text-muted-foreground">Pick a neighborhood to start. Your first stamp there earns bonus XP.</p>}
              <ul className="flex flex-col divide-y divide-sand rounded-xl border border-border bg-surface">
                {view.unvisited.map((u) => (
                  <li key={u.neighborhood} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <p className="type-heading">{u.neighborhood}</p>
                      <p className="type-small text-muted-foreground">
                        <span className="tabular-nums">{u.quests}</span> {u.quests === 1 ? "quest" : "quests"} near{" "}
                        {u.stations.map((s) => s.name).join(", ")}
                      </p>
                    </div>
                    {u.stations[0] && (
                      <Button variant="outline" asChild className="shrink-0">
                        <Link href={stationHref(u.stations[0].id)}>
                          <Compass aria-hidden />
                          Explore
                        </Link>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>
      </Tabs>
      <Legend />
    </>
  );
}

function Neighborhood({ n }: { n: NeighborhoodView }) {
  const collected = n.earned.length;
  const total = collected + n.locked.length;
  return (
    <section aria-labelledby={`hood-${n.neighborhood}`} className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 rounded-xl bg-cream p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={`hood-${n.neighborhood}`} className="type-title">
              {n.neighborhood}
            </h2>
            {n.stations.length > 0 && (
              <p className="type-small flex flex-wrap items-center gap-x-1 text-muted-foreground">
                <MapPin className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {n.stations.map((s, i) => (
                  <span key={s.id}>
                    <Link href={stationHref(s.id)} className="underline-offset-4 hover:underline">
                      {s.name}
                    </Link>
                    {i < n.stations.length - 1 && ","}
                  </span>
                ))}
              </p>
            )}
          </div>
          <p className="type-small inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 font-semibold">
            <span aria-hidden className={cn("size-2.5 rounded-full", TIER_FILL[n.tier])} />
            {TIER_LABEL[n.tier]}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Progress
            value={Math.round(n.progress * 100)}
            aria-label={`${n.neighborhood} tier progress`}
            className="h-1.5 bg-surface"
            indicatorClassName={TIER_FILL[n.tier]}
          />
          <div className="type-small flex justify-between gap-3 text-muted-foreground">
            <span>{progressLine(n)}</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">
              {collected} of {total} collected
            </span>
          </div>
        </div>
      </header>

      <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5">
        {n.earned.map((e) => (
          <li key={e.quest.id}>
            <Link
              href={`/q/${e.quest.id}`}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-1 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Stamp
                questId={e.quest.id}
                title={e.quest.title}
                neighborhood={n.neighborhood}
                stationId={e.quest.station_id}
                type={e.quest.type}
                tier={n.tier}
                crossSchool={e.crossSchool}
                size={88}
              />
              <span className="type-small line-clamp-2 group-hover:underline">{e.quest.title}</span>
              <span className="type-tiny text-muted-foreground tabular-nums">
                {dateFormat.format(new Date(e.at))}
                {e.visits > 1 && ` · ×${e.visits}`}
              </span>
            </Link>
          </li>
        ))}
        {n.locked.map((q) => (
          <li key={q.id}>
            <Link
              href={`/q/${q.id}`}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-1 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Stamp questId={q.id} title={q.title} neighborhood={n.neighborhood} stationId={q.station_id} type={q.type} tier={n.tier} locked size={88} />
              <span className="type-small line-clamp-2 text-muted-foreground group-hover:underline">{q.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Centered({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="type-heading">{title}</p>
      <p className="type-body max-w-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

function PassportSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-label="Loading your passport">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-8 w-48 rounded-lg" />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="aspect-square w-full rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
