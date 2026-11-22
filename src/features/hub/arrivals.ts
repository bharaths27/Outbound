// Next-train logic for the hub header, fed by GET /api/trains?stop=<id> (MBTA predictions).
// Pure functions so they can be tested without the network.

import type { Arrival } from "@/lib/types";

/** Where each route's trains end up, by MBTA direction_id (0 and 1). */
const DESTINATIONS: Record<string, [string, string]> = {
  Red: ["Ashmont/Braintree", "Alewife"],
  Orange: ["Forest Hills", "Oak Grove"],
  Blue: ["Bowdoin", "Wonderland"],
  "Green-B": ["Boston College", "Government Center"],
  "Green-C": ["Cleveland Circle", "Government Center"],
  "Green-D": ["Riverside", "Union Square"],
  "Green-E": ["Heath Street", "Medford/Tufts"],
  Mattapan: ["Mattapan", "Ashmont"],
};

export function destination(route: string, directionId: number): string {
  return DESTINATIONS[route]?.[directionId] ?? (directionId === 0 ? "Outbound" : "Inbound");
}

export interface NextTrain {
  key: string; // route + direction
  route: string;
  destination: string;
  minutes: number;
}

/**
 * The soonest train for each route and direction, soonest first, recomputed against `now`
 * so the countdown stays fresh between fetches. Trains that already left are dropped.
 */
export function nextTrains(arrivals: Arrival[], now: Date, limit = 2): NextTrain[] {
  const best = new Map<string, NextTrain>();
  for (const a of arrivals) {
    const ms = new Date(a.arrivalTime).getTime() - now.getTime();
    if (Number.isNaN(ms) || ms < -30_000) continue;
    const minutes = Math.max(0, Math.round(ms / 60_000));
    const key = `${a.route}:${a.directionId}`;
    const current = best.get(key);
    if (!current || minutes < current.minutes) {
      best.set(key, { key, route: a.route, destination: destination(a.route, a.directionId), minutes });
    }
  }
  return [...best.values()].sort((a, b) => a.minutes - b.minutes).slice(0, limit);
}

/** "Now", "1 min", "12 min". */
export function formatMinutes(minutes: number): string {
  return minutes <= 0 ? "Now" : `${minutes} min`;
}
