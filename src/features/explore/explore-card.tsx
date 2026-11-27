"use client";

// The white "Explore Boston" card over the map (DESIGN.md §6–7 Explore): the italic title,
// one line, and Craving / Budget / Time chips. Each chip opens a short menu. The picks carry
// into every station hub opened afterwards (explore-filters.ts), where the full filters live.

import { ChevronDown, ChevronUp, PartyPopper, Search, SlidersHorizontal } from "lucide-react";
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
  moreFilterCount,
  setExploreFilters,
  subscribeExploreFilters,
  type ExploreFilters,
  type MapLine,
} from "./explore-filters";

const COLLAPSED_KEY = "outbound.explore.collapsed";
const LINES: { id: MapLine; label: string; color?: string }[] = [
  { id: "any", label: "Any line" },
  { id: "Red", label: "Red", color: "#da291c" },
  { id: "Orange", label: "Orange", color: "#ed8b00" },
  { id: "Green", label: "Green", color: "#00843d" },
  { id: "Blue", label: "Blue", color: "#003da5" },
];
const XP_STEPS: { v: number | null; label: string }[] = [
  { v: null, label: "Any" },
  { v: 25, label: "25+" },
  { v: 50, label: "50+" },
  { v: 100, label: "100+" },
];

const ANY = "any";

export function useExploreFilters() {
  return useSyncExternalStore(subscribeExploreFilters, getExploreFilters, () => NO_EXPLORE_FILTERS);
}

function Chip({
  label,
  active,
  menuLabel,
  value,
  options,
  onChange,
}: {
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
          "flex h-8 min-w-0 flex-1 items-center justify-center desk:flex-auto gap-1.5 rounded-full border px-3 text-[13px] font-semibold outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2 desk:px-3",
          active ? "border-maroon bg-maroon text-white" : "border-border-strong bg-sand text-ink hover:brightness-[0.97]",
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="hidden size-3.5 shrink-0 opacity-70 desk:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-52 overflow-y-auto rounded-xl p-1.5">
        <DropdownMenuLabel className="type-eyebrow text-muted-foreground">{menuLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-9 rounded-lg text-sm">
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
  const extras = moreFilterCount(filters);
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  const collapse = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {}
  };

  // Phones: one slim bar (search + a Filters button) so the map stays visible; the filters open under it.
  const [open, setOpen] = useState(false);
  const active = (filters.craving !== ANY ? 1 : 0) + (filters.budget !== null ? 1 : 0) + (filters.minutes !== null ? 1 : 0) + extras;

  return (
    <section
      aria-labelledby="explore-title"
      className={cn(
        "rounded-[20px] bg-surface shadow-card desk:rounded-3xl",
        collapsed ? "p-1.5 desk:px-5 desk:py-2" : "p-1.5 desk:p-5",
        open && "max-desk:pb-3",
        className,
      )}
    >
      <div className="hidden items-center justify-between gap-3 desk:flex">
        <h1
          id="explore-title"
          className={cn("font-display leading-tight font-semibold whitespace-nowrap text-maroon italic", collapsed ? "text-[20px]" : "text-[28px]")}
        >
          Explore Boston
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          {any && !collapsed && (
            <button
              type="button"
              onClick={() => setExploreFilters(NO_EXPLORE_FILTERS)}
              className="min-h-9 px-2 text-sm font-semibold text-maroon underline-offset-4 hover:underline"
            >
              Clear
            </button>
          )}
          {collapsed && any && <span className="rounded-full bg-maroon px-2 py-0.5 text-xs font-bold text-white">Filters on</span>}
          {collapsed && (
            <button
              type="button"
              aria-label="Search places"
              onClick={() => {
                collapse(false);
                requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#${MAP_SEARCH_SLOT} input`)?.focus());
              }}
              className="grid size-8 place-items-center rounded-full text-ink transition-colors hover:bg-sand"
            >
              <Search className="size-4" aria-hidden />
            </button>
          )}
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Show the Explore card" : "Hide the Explore card"}
            title={collapsed ? "Show" : "Hide"}
            onClick={() => collapse(!collapsed)}
            className="flex h-8 items-center gap-1 rounded-full border border-border-strong px-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-sand"
          >
            {collapsed ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
            {collapsed ? "Show" : "Hide"}
          </button>
        </div>
      </div>
      {/* Phones: a grid whose first row is [search | Filters]; desktop: one column in reading order.
          Hidden, not removed, when folded on desktop: the map's search box lives in the slot. */}
      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 desk:grid-cols-1", collapsed && "desk:hidden")}>
        <p className="order-1 mt-0.5 hidden text-sm text-muted-foreground desk:block">
          {any ? "The map shows only what matches. Tap a station for its quests." : "Find food, events, and hidden spots across the T."}
        </p>
        {/* The map's "Where to?" search (TransitMap portals it here). Empty until the map loads. */}
        <div id={MAP_SEARCH_SLOT} className="order-0 min-h-10 desk:order-4 desk:mt-3 desk:min-h-0 desk:empty:hidden" />
        <button
          type="button"
          aria-expanded={open}
          aria-label={active ? `Filters, ${active} on` : "Filters"}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "relative order-0 grid size-10 place-items-center rounded-full border transition-all duration-200 active:scale-95 desk:hidden",
            open || active ? "border-maroon bg-maroon text-white" : "border-border-strong bg-sand text-ink",
          )}
        >
          <SlidersHorizontal className="size-[18px]" aria-hidden />
          {active > 0 && (
            <span className="absolute -top-1 -right-1 grid size-[18px] place-items-center rounded-full bg-gold text-[11px] font-bold text-gold-foreground ring-2 ring-surface">
              {active}
            </span>
          )}
        </button>
        <div
          className={cn(
            "order-2 col-span-2 mt-2.5 flex gap-1.5 px-1 desk:col-span-1 desk:mt-3 desk:gap-2 desk:px-0",
            !open && "max-desk:hidden",
            open && "max-desk:animate-in max-desk:fade-in max-desk:slide-in-from-top-1 max-desk:duration-200",
          )}
        >
          <Chip
            label={filters.craving === ANY ? "Craving" : cravingLabel(filters.craving)}
            active={filters.craving !== ANY}
            menuLabel="Craving"
            value={filters.craving}
            options={[{ value: ANY, label: "Anything" }, ...TYPE_OPTIONS]}
            onChange={(v) => setExploreFilters({ craving: v })}
          />
          <Chip
            label={filters.budget === null ? "Budget" : budgetLabel(filters.budget)}
            active={filters.budget !== null}
            menuLabel="Budget"
            value={filters.budget === null ? ANY : String(filters.budget)}
            options={[{ value: ANY, label: "Any budget" }, ...BUDGET_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))]}
            onChange={(v) => setExploreFilters({ budget: v === ANY ? null : (Number(v) as PriceTier) })}
          />
          <Chip
            label={filters.minutes === null ? "Time" : minutesLabel(filters.minutes)}
            active={filters.minutes !== null}
            menuLabel="Time you have"
            value={filters.minutes === null ? ANY : String(filters.minutes)}
            options={[{ value: ANY, label: "Any time" }, ...TIME_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))]}
            onChange={(v) => setExploreFilters({ minutes: v === ANY ? null : Number(v) })}
          />
          <button
            type="button"
            aria-expanded={more}
            title="More filters"
            onClick={() => setMore((m) => !m)}
            className={cn(
              "flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold outline-none transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-maroon desk:px-4",
              extras || more ? "border-maroon bg-maroon text-white" : "border-border-strong bg-sand text-ink hover:brightness-[0.97]",
            )}
          >
            <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
            <span className="sr-only">More filters</span>
            {extras ? <span className="rounded-full bg-white/25 px-1.5 text-xs">{extras}</span> : null}
          </button>
        </div>
        {more && (
          <div className={cn("order-3 col-span-2 px-1 desk:col-span-1 desk:px-0", !open && "max-desk:hidden")}>
            <MoreFilters f={filters} />
          </div>
        )}
        <div className={cn("order-5 col-span-2 flex items-center gap-2 px-1 desk:col-span-1 desk:block desk:px-0", !open && "max-desk:hidden")}>
          <div className="min-w-0 flex-1">
            <HostedEventsLink />
          </div>
          {any && (
            <button
              type="button"
              onClick={() => setExploreFilters(NO_EXPLORE_FILTERS)}
              className="mt-2.5 h-9 shrink-0 rounded-full px-2 text-sm font-semibold text-maroon desk:hidden"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** "More filters": line, points, open now, places you've been, free food. They filter the map. */
function MoreFilters({ f }: { f: ExploreFilters }) {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-sand/70 p-3 desk:p-4" aria-label="More filters">
      <div>
        <p className="type-eyebrow mb-1.5 text-muted-foreground">Near the line</p>
        <div className="flex flex-wrap gap-1.5">
          {LINES.map((l) => (
            <Pill key={l.id} on={f.line === l.id} onClick={() => setExploreFilters({ line: l.id })}>
              {l.color && <span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden />}
              {l.label}
            </Pill>
          ))}
        </div>
      </div>
      <div>
        <p className="type-eyebrow mb-1.5 text-muted-foreground">Worth at least</p>
        <div className="flex flex-wrap gap-1.5">
          {XP_STEPS.map((x) => (
            <Pill key={x.label} on={f.minXp === x.v} onClick={() => setExploreFilters({ minXp: x.v })}>
              {x.v === null ? "Any XP" : `${x.label} XP`}
            </Pill>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1 desk:grid-cols-2">
        <Switch label="Open now" hint="Quests open, events on" on={f.openNow} set={(v) => setExploreFilters({ openNow: v })} />
        <Switch label="Free food only" hint="Quests and events" on={f.freeFood} set={(v) => setExploreFilters({ freeFood: v })} />
        <Switch label="Hide places I've been" hint="Quests you checked in to" on={f.hideVisited} set={(v) => setExploreFilters({ hideVisited: v })} />
      </div>
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-all duration-200 active:scale-95",
        on ? "border-maroon bg-maroon text-white" : "border-border-strong bg-surface text-ink hover:bg-sand",
      )}
    >
      {children}
    </button>
  );
}

function Switch({ label, hint, on, set }: { label: string; hint: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-surface/60">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-6 w-9 shrink-0 rounded-full bg-border-strong transition-colors peer-checked:bg-maroon peer-focus-visible:ring-2 peer-focus-visible:ring-maroon after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
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
      className="mt-2.5 flex min-h-9 items-center gap-2 rounded-xl bg-violet-50 px-3 py-1.5 text-[13px] text-violet-900 transition-colors hover:bg-violet-100 desk:mt-3 dark:bg-violet-950/50 dark:text-violet-100"
    >
      <PartyPopper className="size-4 shrink-0 text-violet-700 dark:text-violet-200" aria-hidden />
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
