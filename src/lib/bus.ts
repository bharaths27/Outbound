// MBTA buses (route_type 3): shared types and helpers for /api/buses, /api/bus-route and the map.

export interface Bus {
  id: string;
  /** MBTA route id, e.g. "57" or "749". */
  route: string;
  /** What riders call it, e.g. "57" or "SL5". */
  number: string;
  silver: boolean;
  lat: number;
  lon: number;
  /** Degrees clockwise from north, as the MBTA reports it. */
  bearing: number;
  headsign: string | null;
  status: string | null;
  stopName: string | null;
  directionId: number | null;
}

/** Silver Line route ids. Every other bus route id is already its number. */
export const SILVER: Record<string, string> = { "741": "SL1", "742": "SL2", "743": "SL3", "746": "SLW", "749": "SL5", "751": "SL4" };

export function busNumber(routeId: string): string {
  return SILVER[routeId] ?? routeId;
}

export const BUS_YELLOW = "#FFC72C";
export const SILVER_GRAY = "#8E979D";
export const busColor = (silver: boolean) => (silver ? SILVER_GRAY : BUS_YELLOW);

/** "STOPPED_AT" -> "At", "IN_TRANSIT_TO" -> "On the way to", "INCOMING_AT" -> "Arriving at". */
export function busStatus(status: string | null): string {
  if (status === "STOPPED_AT") return "At";
  if (status === "INCOMING_AT") return "Arriving at";
  return "On the way to";
}

/** Meters between two lng/lat points (good enough for city distances). */
export function meters(a: [number, number], b: [number, number]): number {
  const dx = (a[0] - b[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 110_570;
  return Math.hypot(dx, dy);
}
