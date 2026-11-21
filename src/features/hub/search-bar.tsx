"use client";

// Free-text search for the hub. The query goes to /api/search (Gemini, with keyword
// fallbacks on the server and here); what it understood replaces the active filters, so
// the chips below show it. Active filters and search terms show as removable pills.

import { Loader2, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { budgetLabel, cravingLabel, minutesLabel, type HubFilters } from "./filter-state";
import { searchHub, type HubSearch } from "./search-api";

export interface SearchBarProps {
  stationName: string;
  /** Vibe tags at this station, for the local fallback parser. */
  knownTags: string[];
  filters: HubFilters;
  onSearch: (result: HubSearch) => void;
  onChange: (next: HubFilters) => void;
}

export function SearchBar({ stationName, knownTags, filters, onSearch, onChange }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = query.trim();
    if (!text) return;
    setSearching(true);
    try {
      onSearch(await searchHub(text, knownTags)); // never throws: falls back to local parsing
    } finally {
      setSearching(false);
    }
  }

  const removable: { key: string; label: string; clear: Partial<HubFilters> }[] = [];
  if (filters.craving !== "any") removable.push({ key: "craving", label: cravingLabel(filters.craving), clear: { craving: "any" } });
  if (filters.budget !== null) removable.push({ key: "budget", label: budgetLabel(filters.budget), clear: { budget: null } });
  if (filters.minutes !== null) removable.push({ key: "minutes", label: minutesLabel(filters.minutes), clear: { minutes: null } });
  if (filters.openNow) removable.push({ key: "open", label: "Open now", clear: { openNow: false } });
  for (const term of filters.terms) {
    removable.push({ key: `term:${term}`, label: cravingLabel(term), clear: { terms: filters.terms.filter((t) => t !== term) } });
  }

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
