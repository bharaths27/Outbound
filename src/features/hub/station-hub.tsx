"use client";

// The station hub's content: header, stop story, search, filters, and quest cards, or one
// quest's detail. The host decides whether it sits in a drawer or a sheet.

import { Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { openGuide } from "@/features/guide/open-guide";
import { data } from "@/lib/data";
import type { Quest, Station } from "@/lib/data/types";
import { getExploreFilters } from "@/features/explore/explore-filters";
import { FilterBar } from "./filter-bar";
import {
  EMPTY_FILTERS,
  applyFilters,
  cravingOptions,
  fromSearch,
  type HubFilters,
} from "./filter-state";
import { HubHeader, HubHeaderSkeleton } from "./hub-header";
import { QuestCard } from "./quest-card";
import { useRideMinutes } from "./ride-time";
import { QuestDetail } from "./quest-detail";
import { SearchBar } from "./search-bar";
import { useNow } from "./use-now";
import { lastVisit, tierIn, usePlayer } from "./use-player";
import { mapStation } from "./map-station";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | { status: "ready"; station: Station; quests: Quest[] };

const NO_QUESTS: Quest[] = [];

function Story({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 160;
  return (
    <p className="text-sm leading-[1.5] text-muted-2">
      {/* Inline "Read more", like the reference: cut at a word near 150 characters. */}
      {long && !expanded
        ? `${text.slice(0, text.lastIndexOf(" ", 150)).trimEnd()}… `
        : `${text} `}
      {long && (
        <button
          type="button"
          className="font-bold text-maroon underline-offset-4 hover:underline"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </p>
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

/** The quest with the shortest walk from the station. */
function closestQuest(quests: Quest[]): Quest | null {
  return quests.reduce<Quest | null>(
    (best, q) => (best === null || q.walk_min < best.walk_min ? q : best),
    null,
  );
}

/** Filters found nothing: say which filter to drop, and still show the closest quest. */
function NoMatches({
  filters,
  closest,
  onChange,
  card,
}: {
  filters: HubFilters;
  closest: Quest | null;
  onChange: (f: HubFilters) => void;
  card: (q: Quest) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-3 py-5 text-center">
        <p className="type-body text-muted-foreground">
          {filters.openNow
            ? "Nothing open matches. Try turning off Open now."
            : "No quests match these filters."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {filters.openNow && (
            <Button onClick={() => onChange({ ...filters, openNow: false })}>
              Turn off Open now
            </Button>
          )}
          <Button variant="outline" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </Button>
        </div>
      </div>
      {closest && (
        <>
          <p className="type-eyebrow text-muted-foreground">
            Closest to the station
          </p>
          {card(closest)}
        </>
      )}
    </div>
  );
}

export function StationHub({
  stationId,
  onClose,
}: {
  stationId: string;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Starts from the Explore card's Craving / Budget / Time picks, if any.
  const [filters, setFilters] = useState<HubFilters>(() => ({
    ...EMPTY_FILTERS,
    ...getExploreFilters(),
  }));
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
      .then(async ([found, quests]) => {
        const station = found ?? (await mapStation(stationId));
        if (cancelled) return;
        setLoad(
          station
            ? { status: "ready", station, quests }
            : { status: "missing" },
        );
      })
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [stationId, attempt]);

  const quests = load.status === "ready" ? load.quests : NO_QUESTS;
  const rideMin = useRideMinutes(stationId);
  const results = useMemo(
    () => applyFilters(quests, filters, now, rideMin),
    [quests, filters, now, rideMin],
  );
  const cravings = useMemo(
    () => cravingOptions(quests, filters.craving),
    [quests, filters.craving],
  );
  const knownTags = useMemo(
    () => [...new Set(quests.flatMap((q) => q.vibe_tags))],
    [quests],
  );

  if (load.status === "loading") {
    return (
      <div className="flex flex-col gap-4 pt-3 desk:pt-6">
        <HubHeaderSkeleton onClose={onClose} />
        <ListSkeleton />
      </div>
    );
  }

  if (load.status !== "ready") {
    return (
      <div className="flex flex-col gap-4 pt-3 desk:pt-6">
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="type-heading">
            {load.status === "missing"
              ? "We couldn't find that station."
              : "This station didn't load."}
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
  const openQuest = openQuestId
    ? quests.find((q) => q.id === openQuestId)
    : undefined;

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {/* Pinned while the rest scrolls (DESIGN.md §7). The scroll area has no top padding and
          the header carries it instead, so nothing scrolls into a gap above the header. A
          24 px fade in the panel's color hangs under it, so content scrolls out softly. */}
      <div className="sticky top-0 z-20 -mx-4 bg-background px-4 pt-3 pb-1 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-linear-to-b after:from-background after:to-transparent desk:-mx-6 desk:px-6 desk:pt-6">
        <HubHeader station={station} onClose={onClose} />
      </div>

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

          <Button
            variant="outline"
            className="self-start"
            onClick={() =>
              openGuide({ prompt: `What should I do near ${station.name}?` })
            }
          >
            <Sparkles className="text-maroon" aria-hidden />
            Ask Guide about {station.name}
          </Button>

          {/* Search and filters only help when there is something to filter. */}
          {quests.length > 0 && (
            <div className="flex flex-col gap-4">
              <SearchBar
                stationName={station.name}
                knownTags={knownTags}
                filters={filters}
                onSearch={(result) => setFilters((f) => fromSearch(f, result))}
                onChange={setFilters}
              />
              <FilterBar
                filters={filters}
                cravings={cravings}
                resultCount={results.length}
                rideMin={rideMin}
                onChange={setFilters}
              />
            </div>
          )}

          <section
            aria-label={`Quests near ${station.name}`}
            className="flex flex-col gap-3"
          >
            {quests.length === 0 ? (
              <p className="type-body py-6 text-center text-muted-foreground">
                No quests here yet. Try a station nearby.
              </p>
            ) : results.length === 0 ? (
              <NoMatches
                filters={filters}
                closest={closestQuest(quests)}
                onChange={setFilters}
                card={(q) => (
                  <QuestCard
                    quest={q}
                    neighborhood={station.neighborhood}
                    now={now}
                    tier={tier}
                    visit={lastVisit(player, q.id)}
                    onOpen={setOpenQuestId}
                  />
                )}
              />
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
