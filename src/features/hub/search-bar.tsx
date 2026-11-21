"use client";

// Free-text search for the hub. The query goes to searchQuests (keyword parser now,
// Gemini later); its parsed filters replace the active ones, so the chips below show
// exactly what the search understood. Active filters show as removable badges.

import { Loader2, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { data } from "@/lib/data";
import type { Filters } from "@/lib/data/types";
import { budgetLabel, cravingLabel, minutesLabel, type HubFilters } from "./filter-state";

export interface SearchBarProps {
  stationId: string;
  stationName: string;
  filters: HubFilters;
  onParsed: (parsed: Filters) => void;
  onChange: (next: HubFilters) => void;
}

export function SearchBar({ stationId, stationName, filters, onParsed, onChange }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    try {
      const { filters: parsed } = await data.searchQuests(text, stationId);
      onParsed(parsed);
    } catch {
      toast.error("Search didn't work. Use the filters below instead.");
    } finally {
      setSearching(false);
    }
  }

  const removable: { key: string; label: string; clear: Partial<HubFilters> }[] = [];
  if (filters.craving !== "any") removable.push({ key: "craving", label: cravingLabel(filters.craving), clear: { craving: "any" } });
  if (filters.budget !== null) removable.push({ key: "budget", label: budgetLabel(filters.budget), clear: { budget: null } });
  if (filters.minutes !== null) removable.push({ key: "minutes", label: minutesLabel(filters.minutes), clear: { minutes: null } });
  if (filters.openNow) removable.push({ key: "open", label: "Open now", clear: { openNow: false } });

  return (
    <div className="flex flex-col gap-2">
      <form role="search" onSubmit={submit} className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Cheap spicy noodles, 30 min…`}
          aria-label={`Search quests near ${stationName}`}
          enterKeyHint="search"
          className="h-11 pr-10 pl-10"
        />
        {searching && (
          <Loader2
            className="absolute top-1/2 right-3 size-5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-label="Searching"
          />
        )}
      </form>

      {removable.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
          {removable.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => onChange({ ...filters, ...r.clear })}
                aria-label={`Remove ${r.label}`}
                className="type-tiny relative inline-flex h-6 items-center gap-1 rounded-full bg-secondary pr-1.5 pl-2.5 text-secondary-foreground dark:bg-primary dark:text-primary-foreground outline-none after:absolute after:-inset-y-2.5 after:inset-x-0 hover:opacity-85 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {r.label}
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
