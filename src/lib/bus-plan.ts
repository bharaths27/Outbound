// Picks a one-bus trip: walk to a stop, ride one bus route, walk to the place.
// Pure logic so it can be tested; /api/bus-route feeds it MBTA stop lists.
import { busColor, busNumber, meters, SILVER } from "./bus";

type LL = [number, number];

export interface RouteStops {
  route: string;
  directionId: number;
  headsign: string;
  /** In riding order. */
  stops: { id: string; name: string; lon: number; lat: number }[];
}

export interface BusOption {
  minutes: number;
  distanceKm: number;
  segments: { mode: string; color: string; path: LL[] }[];
  steps: {
    mode: "walk" | "transit";
    text?: string;
    minutes: number;
    meters?: number;
    line?: string;
    color?: string;
    from?: string;
    to?: string;
    headsign?: string;
    stops?: number;
  }[];
  fare: number;
  label: string;
  transfers: number;
  walkMin: number;
  rideMin: number;
  /** Stop and route to look up the next departure for. */
  board: { stopId: string; route: string; directionId: number };
}

export const BUS_FARE = 1.7;
const WALK_M_PER_MIN = 80; // ~4.8 km/h
const BUS_M_PER_MIN = 200; // ~12 km/h in city traffic, stops included
const MAX_WALK_M = 900;

export function planBus(from: LL, to: LL, routes: RouteStops[], placeName = "your destination"): BusOption[] {
  const out: BusOption[] = [];
  for (const r of routes) {
    if (r.stops.length < 2) continue;
    // Best board/alight pair in riding order: least total walking.
    let best: { i: number; j: number; walk: number } | null = null;
    const dFrom = r.stops.map((s) => meters(from, [s.lon, s.lat]));
    const dTo = r.stops.map((s) => meters(to, [s.lon, s.lat]));
    for (let i = 0; i < r.stops.length; i++) {
      if (dFrom[i] > MAX_WALK_M) continue;
      for (let j = i + 1; j < r.stops.length; j++) {
        if (dTo[j] > MAX_WALK_M) continue;
        const walk = dFrom[i] + dTo[j];
        if (!best || walk < best.walk) best = { i, j, walk };
      }
    }
    if (!best) continue;
    const ride = r.stops.slice(best.i, best.j + 1);
    const ridePath: LL[] = ride.map((s) => [s.lon, s.lat]);
    let rideM = 0;
    for (let k = 1; k < ridePath.length; k++) rideM += meters(ridePath[k - 1], ridePath[k]);
    // Walking the whole way would be faster or nearly the same: not worth a bus.
    if (rideM < 500) continue;
    const walk1 = dFrom[best.i], walk2 = dTo[best.j];
    const w1 = Math.max(1, Math.round(walk1 / WALK_M_PER_MIN)), w2 = Math.max(1, Math.round(walk2 / WALK_M_PER_MIN));
    const rideMin = Math.max(2, Math.round(rideM / BUS_M_PER_MIN));
    const number = busNumber(r.route);
    const color = busColor(r.route in SILVER);
    const board = ride[0], alight = ride.at(-1)!;
    out.push({
      minutes: w1 + rideMin + w2,
      distanceKm: Math.round(((walk1 + rideM + walk2) / 1000) * 10) / 10,
      segments: [
        { mode: "walk", color: "#5b6b7a", path: [from, [board.lon, board.lat]] },
        { mode: "transit", color, path: ridePath },
        { mode: "walk", color: "#5b6b7a", path: [[alight.lon, alight.lat], to] },
      ],
      steps: [
        { mode: "walk", text: `Walk to ${board.name}`, minutes: w1, meters: Math.round(walk1) },
        { mode: "transit", line: number.startsWith("SL") ? number : `Bus ${number}`, color, from: board.name, to: alight.name, headsign: r.headsign, stops: ride.length - 1, minutes: rideMin },
        { mode: "walk", text: `Walk to ${placeName}`, minutes: w2, meters: Math.round(walk2) },
      ],
      fare: BUS_FARE,
      label: number.startsWith("SL") ? `Silver Line ${number.slice(2)}` : `Bus ${number}`,
      transfers: 0,
      walkMin: w1 + w2,
      rideMin,
      board: { stopId: board.id, route: r.route, directionId: r.directionId },
    });
  }
  // One option per route number, fastest first.
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.minutes - b.minutes)
    .filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true)))
    .slice(0, 2);
}
