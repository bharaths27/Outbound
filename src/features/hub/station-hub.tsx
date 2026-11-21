"use client";

// The station hub's content: header, stop story, search, filters, and quest cards, or one
// quest's detail. The host decides whether it sits in a drawer or a sheet.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { data } from "@/lib/data";
import type { Quest, Station } from "@/lib/data/types";
import { FilterBar } from "./filter-bar";
import { EMPTY_FILTERS, applyFilters, cravingOptions, fromSearch, type HubFilters } from "./filter-state";
import { HubHeader, HubHeaderSkeleton } from "./hub-header";
import { QuestCard } from "./quest-card";
import { QuestDetail } from "./quest-detail";
import { SearchBar } from "./search-bar";
import { useNow } from "./use-now";
import { lastVisit, tierIn, usePlayer } from "./use-player";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; station: Station; quests: Quest[] };

const NO_QUESTS: Quest[] = [];

function Story({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 220;
  return (
    <div className="flex flex-col items-start gap-1">
      <p className={long && !expanded ? "type-body line-clamp-3" : "type-body"}>{text}</p>
      {long && (
        <Button variant="link" className="h-auto px-0 py-1" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "Show less" : "Read more"}
        </Button>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy aria-label="Loading quests">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function StationHub({ stationId, onClose }: { stationId: string; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filters, setFilters] = useState<HubFilters>(EMPTY_FILTERS);
  const [openQuestId, setOpenQuestId] = useState<string | null>(null);
  const { player, reload } = usePlayer();
  const now = useNow();
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening or leaving a quest starts at the top of the hub's scroll area.
  useEffect(() => {
    rootRef.current?.closest("[data-hub-scroll]")?.scrollTo({ top: 0 });
  }, [openQuestId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([data.getStation(stationId), data.getQuests(stationId)])
      .then(([station, quests]) => {
        if (cancelled) return;
        setLoad(station ? { status: "ready", station, quests } : { status: "missing" });
      })
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [stationId, attempt]);

  const quests = load.status === "ready" ? load.quests : NO_QUESTS;
  const results = useMemo(() => applyFilters(quests, filters, now), [quests, filters, now]);
  const cravings = useMemo(() => cravingOptions(quests, filters.craving), [quests, filters.craving]);
  const knownTags = useMemo(() => [...new Set(quests.flatMap((q) => q.vibe_tags))], [quests]);

  if (load.status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <HubHeaderSkeleton onClose={onClose} />
        <ListSkeleton />
      </div>
    );
  }

  if (load.status !== "ready") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="type-heading">
            {load.status === "missing" ? "We couldn't find that station." : "This station didn't load."}
          </p>
          <p className="type-body text-muted-foreground">
            {load.status === "missing"
              ? "Pick a station on the map to see what's nearby."
              : "Check your connection, then try again."}
          </p>
          {load.status === "error" && (
            <Button
              variant="outline"
              onClick={() => {
                setLoad({ status: "loading" });
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { station } = load;
  const tier = tierIn(player, station.neighborhood);
  const openQuest = openQuestId ? quests.find((q) => q.id === openQuestId) : undefined;

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <HubHeader station={station} onClose={onClose} />

      {openQuest ? (
        <QuestDetail
          quest={openQuest}
          station={station}
          player={player}
          now={now}
          onBack={() => setOpenQuestId(null)}
          onCheckedIn={reload}
        />
      ) : (
        <>
          {station.story && <Story text={station.story} />}

          <div className="flex flex-col gap-3">
            <SearchBar
              stationName={station.name}
              knownTags={knownTags}
              filters={filters}
              onSearch={(result) => setFilters((f) => fromSearch(f, result))}
              onChange={setFilters}
            />
            <FilterBar filters={filters} cravings={cravings} resultCount={results.length} onChange={setFilters} />
          </div>

          <section aria-label={`Quests near ${station.name}`} className="flex flex-col gap-3">
            {quests.length === 0 ? (
              <p className="type-body py-6 text-center text-muted-foreground">
                No quests here yet. Try a station nearby.
              </p>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="type-body text-muted-foreground">Nothing here matches all of those.</p>
                <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              </div>
            ) : (
              results.map((q) => (
                <QuestCard
                  key={q.id}
                  quest={q}
                  neighborhood={station.neighborhood}
                  now={now}
                  tier={tier}
                  visit={lastVisit(player, q.id)}
                  onOpen={setOpenQuestId}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
