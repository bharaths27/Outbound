"use client";

// The white "Explore Boston" card over the map (DESIGN.md §6–7 Explore): the italic title,
// one line, and Craving / Budget / Time chips. Each chip opens a short menu. The picks carry
// into every station hub opened afterwards (explore-filters.ts), where the full filters live.

import { ChevronDown, Clock, CircleDollarSign, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { data } from "@/lib/data";
import { EVENTS_CHANGED, eventStatus } from "@/features/host/hosted";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PriceTier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { BUDGET_OPTIONS, TIME_OPTIONS, TYPE_OPTIONS, budgetLabel, cravingLabel, minutesLabel } from "@/features/hub/filter-state";
import {
  NO_EXPLORE_FILTERS,
  getExploreFilters,
  hasExploreFilters,
  setExploreFilters,
  subscribeExploreFilters,
} from "./explore-filters";

const ANY = "any";

export function useExploreFilters() {
  return useSyncExternalStore(subscribeExploreFilters, getExploreFilters, () => NO_EXPLORE_FILTERS);
}

function Chip({
  icon,
  label,
  active,
  menuLabel,
  value,
  options,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  menuLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={active ? `${menuLabel}: ${label}` : menuLabel}
        className={cn(
          "flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 desk:flex-none desk:px-4",
          active ? "border-maroon bg-maroon text-white" : "border-border-strong bg-sand text-ink hover:brightness-[0.97]",
        )}
      >
        {/* Phones drop the icon once a pick is made, so "Under $10" fits. */}
        <span className={cn("contents", active && "max-desk:hidden")}>{icon}</span>
        <span className="truncate">{label}</span>
        <ChevronDown className="hidden size-4 shrink-0 desk:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-52 overflow-y-auto rounded-xl p-1.5">
        <DropdownMenuLabel className="type-eyebrow text-muted-foreground">{menuLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 rounded-lg text-[15px]">
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Where the map's search box goes (TransitMap looks it up by id). */
export const MAP_SEARCH_SLOT = "ob-map-search";

export function ExploreCard({ className }: { className?: string }) {
  const filters = useExploreFilters();
  const any = hasExploreFilters(filters);

  return (
    <section
      aria-labelledby="explore-title"
      className={cn("rounded-[22px] bg-surface p-4 shadow-card desk:rounded-3xl desk:p-6", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h1 id="explore-title" className="font-display text-[26px] leading-tight font-semibold text-maroon italic desk:text-[36px]">
          Explore Boston
        </h1>
        {any && (
          <button
            type="button"
            onClick={() => setExploreFilters(NO_EXPLORE_FILTERS)}
            className="-my-2 min-h-11 shrink-0 px-1 text-sm font-semibold text-maroon underline-offset-4 hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground desk:text-[15px]">
        {any ? "Tap a station to see quests that match." : "Find food, events, and hidden spots across the T."}
      </p>
      <div className="mt-3 flex gap-2 desk:mt-4 desk:gap-2.5">
        <Chip
          icon={<Utensils className="size-4 shrink-0" aria-hidden />}
          label={filters.craving === ANY ? "Craving" : cravingLabel(filters.craving)}
          active={filters.craving !== ANY}
          menuLabel="Craving"
          value={filters.craving}
          options={[{ value: ANY, label: "Anything" }, ...TYPE_OPTIONS]}
          onChange={(v) => setExploreFilters({ craving: v })}
        />
        <Chip
          icon={<CircleDollarSign className="size-4 shrink-0" aria-hidden />}
          label={filters.budget === null ? "Budget" : budgetLabel(filters.budget)}
          active={filters.budget !== null}
          menuLabel="Budget"
          value={filters.budget === null ? ANY : String(filters.budget)}
          options={[{ value: ANY, label: "Any budget" }, ...BUDGET_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))]}
          onChange={(v) => setExploreFilters({ budget: v === ANY ? null : (Number(v) as PriceTier) })}
        />
        <Chip
          icon={<Clock className="size-4 shrink-0" aria-hidden />}
          label={filters.minutes === null ? "Time" : minutesLabel(filters.minutes)}
          active={filters.minutes !== null}
          menuLabel="Time you have"
          value={filters.minutes === null ? ANY : String(filters.minutes)}
          options={[{ value: ANY, label: "Any time" }, ...TIME_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))]}
          onChange={(v) => setExploreFilters({ minutes: v === ANY ? null : Number(v) })}
        />
      </div>
      {/* The map's "Where to?" search (TransitMap portals it here), so the left side of the map
          stays free for the live train list and the Guide can't cover it. Empty until the map loads. */}
      <div id={MAP_SEARCH_SLOT} className="mt-3 empty:hidden desk:mt-4" />
      <HostedEventsLink />
    </section>
  );
}

/** "3 student events on the map · Host one": the way to the Host page (phones have no Host tab). */
function HostedEventsLink() {
  const [counts, setCounts] = useState<{ all: number; now: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      data
        .getHostedEvents()
        .then((list) => {
          const current = list.filter((e) => eventStatus(e) !== "ended");
          if (!cancelled) setCounts({ all: current.length, now: current.filter((e) => eventStatus(e) === "now").length });
        })
        .catch(() => !cancelled && setCounts({ all: 0, now: 0 }));
    load();
    window.addEventListener(EVENTS_CHANGED, load);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENTS_CHANGED, load);
    };
  }, []);
  return (
    <Link
      href="/host"
      className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[15px] text-violet-900 hover:bg-violet-100 desk:mt-4 dark:bg-violet-950/50 dark:text-violet-100"
    >
      <span aria-hidden>🎉</span>
      <span className="min-w-0 flex-1">
        {counts && counts.all > 0 ? (
          <>
            <b>
              {counts.all} student event{counts.all > 1 ? "s" : ""}
            </b>{" "}
            on the map{counts.now ? `, ${counts.now} happening now` : ""}
          </>
        ) : (
          "Hosting something? Put it on the map"
        )}
      </span>
      <span className="font-semibold text-maroon dark:text-violet-200">Host</span>
    </Link>
  );
}
