"use client";

// Always-visible hub filters (DESIGN.md "Filters"): craving, budget, time available,
// open now, the result count, and "Clear". Every change applies instantly. Each chip
// row scrolls sideways on phones instead of wrapping.

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { PriceTier } from "@/lib/data/types";
import { normalizeTag } from "@/lib/search/fallbackParser";
import { BUDGET_OPTIONS, EMPTY_FILTERS, TIME_OPTIONS, activeCount, minutesLabel, resultLabel, type HubFilters } from "./filter-state";

export interface FilterBarProps {
  filters: HubFilters;
  cravings: { value: string; label: string }[];
  resultCount: number;
  /** Ride time from the player to this station, when known; the time filter counts it. */
  rideMin?: number | null;
  onChange: (next: HubFilters) => void;
}

function ChipRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <p id={id} className="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
        {hint && <span className="font-semibold tracking-normal normal-case"> · {hint}</span>}
      </p>
      {/* Phones: one row that scrolls sideways, bleeding into the box's padding.
          Desktop: chips wrap. */}
      <div className="-mx-4 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] desk:mx-0 desk:overflow-visible desk:px-0 [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

export function FilterBar({ filters, cravings, resultCount, rideMin = null, onChange }: FilterBarProps) {
  const openId = useId();
  const set = (patch: Partial<HubFilters>) => onChange({ ...filters, ...patch });
  // ToggleGroup values are strings; tags match loosely ("late night" = "late-night").
  const activeCraving =
    cravings.find((c) => normalizeTag(c.value) === normalizeTag(filters.craving))?.value ?? "";

  return (
    <section aria-label="Filters" className="flex flex-col gap-4">
      <ChipRow label="Craving">
        <ToggleGroup
          type="single"
          variant="chip"
          value={activeCraving}
          onValueChange={(v) => set({ craving: v || "any" })}
          aria-label="Craving"
          className="gap-2 desk:w-auto desk:flex-wrap"
        >
          {cravings.map((c) => (
            <ToggleGroupItem key={c.value} value={c.value}>
              {c.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ChipRow>

      <ChipRow label="Budget">
        <ToggleGroup
          type="single"
          variant="chip"
          value={filters.budget === null ? "" : String(filters.budget)}
          onValueChange={(v) => set({ budget: v === "" ? null : (Number(v) as PriceTier) })}
          aria-label="Budget"
          className="gap-2 desk:w-auto desk:flex-wrap"
        >
          {BUDGET_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={String(o.value)}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </ChipRow>

      <ChipRow label="Time you have" hint={rideMin === null ? "from the station" : `from you · ${rideMin} min ride`}>
        <ToggleGroup
          type="single"
          variant="chip"
          value={filters.minutes === null ? "" : String(filters.minutes)}
          onValueChange={(v) => set({ minutes: v === "" ? null : Number(v) })}
          aria-label="Time you have"
          className="gap-2 desk:w-auto desk:flex-wrap"
        >
          {TIME_OPTIONS.map((o) => (
            <ToggleGroupItem key={o.value} value={String(o.value)} className="tabular-nums">
              {o.label}
            </ToggleGroupItem>
          ))}
          {/* A searched time that isn't a preset ("45 min") still shows as selected. */}
          {filters.minutes !== null && !TIME_OPTIONS.some((o) => o.value === filters.minutes) && (
            <ToggleGroupItem value={String(filters.minutes)} className="tabular-nums">
              {minutesLabel(filters.minutes)}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </ChipRow>

      <div className="flex min-h-9 items-center justify-between gap-3">
        <label htmlFor={openId} className="flex items-center gap-2.5 text-sm font-semibold">
          <Switch id={openId} checked={filters.openNow} onCheckedChange={(openNow) => set({ openNow })} />
          Open now
        </label>
        <div className="flex items-center gap-1">
          <p className="text-sm font-bold tabular-nums" aria-live="polite">
            {resultLabel(resultCount)}
          </p>
          {activeCount(filters) > 0 && (
            <Button variant="link" onClick={() => onChange(EMPTY_FILTERS)} className="h-9 px-1 font-bold text-maroon underline">
              Clear
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
