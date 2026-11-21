"use client";

// "Your passport" (DESIGN.md "The stamp"): stamps grouped by neighborhood, each with its
// tier and progress toward the next one, earned stamps next to the ones still to collect,
// and a list of neighborhoods not visited yet. Tiers and counts come from the passport view.

import { Compass, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { data } from "@/lib/data";
import type { Profile, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { TIER_LABEL, buildPassport, progressLine, type NeighborhoodView, type PassportView } from "./build-passport";
import { Stamp } from "./stamp";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "signed-out" }
  | { status: "ready"; profile: Profile; view: PassportView };

const TIER_FILL: Record<Tier, string> = { bronze: "bg-tier-bronze", silver: "bg-tier-silver", gold: "bg-tier-gold" };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const stationHref = (id: string) => `/?station=${encodeURIComponent(id)}`;

async function loadPassport(): Promise<Load> {
  const profile = await data.getCurrentUser();
  if (!profile) return { status: "signed-out" };
  const [rows, quests, stations] = await Promise.all([data.getPassport(profile.id), data.getAllQuests(), data.getStations()]);
  return { status: "ready", profile, view: buildPassport(rows, quests, stations) };
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <h1 className="type-display">Your passport</h1>
      {load.status === "loading" && <PassportSkeleton />}
      {load.status === "error" && (
        <Centered
          title="Your passport didn't load."
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
      {load.status === "ready" && <Passport profile={load.profile} view={load.view} />}
    </div>
  );
}

function Passport({ profile, view }: { profile: Profile; view: PassportView }) {
  const empty = view.visited.length === 0;
  return (
    <>
      <p className="type-body -mt-4 text-muted-foreground tabular-nums">
        {view.totalStamps} {view.totalStamps === 1 ? "stamp" : "stamps"} · {view.visited.length}{" "}
        {view.visited.length === 1 ? "neighborhood" : "neighborhoods"} · Level {profile.level}
      </p>

      <Tabs defaultValue={empty ? "explore" : "stamps"} className="gap-4">
        <TabsList>
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
            <Centered title="You've been everywhere" body="Every neighborhood with quests has at least one of your stamps." />
          ) : (
            <>
              {empty && <p className="type-body text-muted-foreground">Pick a neighborhood to start. Your first stamp there earns bonus XP.</p>}
              <ul className="flex flex-col divide-y rounded-xl border">
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
    </>
  );
}

function Neighborhood({ n }: { n: NeighborhoodView }) {
  const collected = n.earned.length;
  const total = collected + n.locked.length;
  return (
    <section aria-labelledby={`hood-${n.neighborhood}`} className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 rounded-xl bg-muted p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={`hood-${n.neighborhood}`} className="type-title">
              {n.neighborhood}
            </h2>
            {n.stations.length > 0 && (
              <p className="type-small inline-flex items-center gap-1 text-muted-foreground">
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
          <p className="type-small inline-flex shrink-0 items-center gap-1.5 rounded-full bg-background px-2.5 py-1 font-semibold">
            <span aria-hidden className={cn("size-2.5 rounded-full", TIER_FILL[n.tier])} />
            {TIER_LABEL[n.tier]}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Progress
            value={Math.round(n.progress * 100)}
            aria-label={`${n.neighborhood} tier progress`}
            className="h-1.5 bg-background"
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
              <Stamp questId={q.id} title={q.title} neighborhood={n.neighborhood} type={q.type} tier={n.tier} locked size={88} />
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
