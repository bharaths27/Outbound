// Hub search: free text → filters plus search terms. Calls POST /api/search (Gemini, with
// a server-side keyword fallback). If the request itself fails (offline, timeout), it
// parses locally, so the search bar always answers.

import type { Filters, QuestType } from "@/lib/data/types";
import type { SearchResult } from "@/lib/search";
import { parseQuery } from "@/lib/search/fallbackParser";

export interface HubSearch {
  filters: Filters; // craving is a quest type or "any"
  terms: string[]; // tags and keywords, matched against quest tags, titles, descriptions
  source: SearchResult["source"] | "local";
}

const TYPES = new Set<string>(["food", "event", "scenic"]);

/** The local parser may put a vibe tag in craving; move it to the terms. */
export function localSearch(query: string, knownTags: readonly string[]): HubSearch {
  const parsed = parseQuery(query, knownTags);
  const isType = parsed.craving === "any" || TYPES.has(parsed.craving);
  return {
    filters: { ...parsed, craving: isType ? parsed.craving : "any" },
    terms: isType ? [] : [parsed.craving],
    source: "local",
  };
}

export function fromApi(result: SearchResult): HubSearch {
  const craving = TYPES.has(result.filters.craving) ? (result.filters.craving as QuestType) : "any";
  const terms = [...new Set([...result.tags, ...result.keywords].map((t) => t.trim().toLowerCase()).filter(Boolean))];
  return { filters: { ...result.filters, craving }, terms, source: result.source };
}

export async function searchHub(
  query: string,
  knownTags: readonly string[],
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<HubSearch> {
  const { fetchImpl = fetch, timeoutMs = 8000 } = opts;
  try {
    const res = await fetchImpl("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`search ${res.status}`);
    const body = (await res.json()) as SearchResult;
    if (!body?.filters) throw new Error("search: bad response");
    return fromApi(body);
  } catch {
    return localSearch(query, knownTags);
  }
}
