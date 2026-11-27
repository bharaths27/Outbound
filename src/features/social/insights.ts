// Numbers for the profile board: places this month and overall, neighborhoods, ratings,
// visits by month, and a calendar grid. Pure functions so they're easy to test.

import type { Review, Visit } from "@/lib/data/types";

export const ym = (date: string) => date.slice(0, 7); // "2026-11"

export function monthLabel(key: string, style: "short" | "long" = "short"): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: style, timeZone: "UTC" });
}

export function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface Insights {
  placesThisMonth: number;
  placesAllTime: number;
  neighborhoods: number;
  neighborhoodsThisMonth: number;
  checkIns: number;
  reviews: number;
  avgRating: number | null;
  topRated: Review[];
  topNeighborhood: { name: string; count: number } | null;
}

/**
 * @param hoodOf neighborhood for a quest id (from its station)
 * @param month "YYYY-MM" to count as "this month"
 */
export function insights(visits: Visit[], reviews: Review[], hoodOf: (questId: string) => string | null, month: string): Insights {
  const places = new Set(visits.map((v) => v.quest_id));
  // Imported Google places count as places you've been too.
  for (const r of reviews) if (!r.quest_id) places.add(`g:${r.place_name}`);
  const thisMonth = visits.filter((v) => ym(v.visit_date) === month);
  const hoods = new Map<string, number>();
  for (const v of visits) {
    const h = hoodOf(v.quest_id);
    if (h) hoods.set(h, (hoods.get(h) ?? 0) + 1);
  }
  const top = [...hoods.entries()].sort((a, b) => b[1] - a[1])[0];
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null;
  return {
    placesThisMonth: new Set(thisMonth.map((v) => v.quest_id)).size + reviews.filter((r) => !r.quest_id && ym(r.visited_on) === month).length,
    placesAllTime: places.size,
    neighborhoods: hoods.size,
    neighborhoodsThisMonth: new Set(thisMonth.map((v) => hoodOf(v.quest_id)).filter(Boolean)).size,
    checkIns: visits.length,
    reviews: reviews.length,
    avgRating: avg,
    topRated: [...reviews].sort((a, b) => b.rating - a.rating || b.created_at.localeCompare(a.created_at)).slice(0, 5),
    topNeighborhood: top ? { name: top[0], count: top[1] } : null,
  };
}

/** Distinct places per month for the last `n` months ending at `month`. */
export function monthCounts(visits: Visit[], reviews: Review[], month: string, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const key = shiftMonth(month, i - (n - 1));
    const q = new Set(visits.filter((v) => ym(v.visit_date) === key).map((v) => v.quest_id));
    const g = reviews.filter((r) => !r.quest_id && ym(r.visited_on) === key).length;
    return { key, label: monthLabel(key), count: q.size + g };
  });
}

/** A Sunday-first month grid: nulls before the 1st, then each day with its visits. */
export function calendar(visits: Visit[], month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map<string, Visit[]>();
  for (const v of visits) if (ym(v.visit_date) === month) byDay.set(v.visit_date, [...(byDay.get(v.visit_date) ?? []), v]);
  const cells: ({ date: string; day: number; visits: Visit[] } | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    cells.push({ date, day: d, visits: byDay.get(date) ?? [] });
  }
  return cells;
}

/** Beli-style score color: green 8+, gold 6–8, red under 6. */
export function scoreTone(rating: number): "high" | "mid" | "low" {
  return rating >= 8 ? "high" : rating >= 6 ? "mid" : "low";
}
