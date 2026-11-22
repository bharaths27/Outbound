// Every station on the map opens a hub, even one the data source has no row for. The mock
// data only has the 9 stations with Suki's content, and Supabase's stations seed skips the
// Blue Line and the Mattapan trolley. For those, the hub builds the station from the map's
// own list (public/data/mbta-stations.json): name, lines and location, no story, no quests.

import type { Station } from "@/lib/data/types";

interface MapStation {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lon: number;
}

let mapStations: Promise<MapStation[]> | null = null;

function loadMapStations(): Promise<MapStation[]> {
  mapStations ??= fetch("/data/mbta-stations.json")
    .then((r) => {
      if (!r.ok) throw new Error(`mbta-stations.json ${r.status}`);
      return r.json() as Promise<MapStation[]>;
    })
    .catch((e) => {
      mapStations = null; // let the next try fetch again
      throw e;
    });
  return mapStations;
}

/** The station as the map knows it, or null if the map doesn't have it either. */
export function fromMapStation(s: MapStation | undefined): Station | null {
  if (!s) return null;
  // No neighborhood is known, so no passport tier shows; there are no quests to stamp anyway.
  return {
    id: s.id,
    name: s.name,
    lines: s.lines,
    lat: s.lat,
    lon: s.lon,
    neighborhood: "",
    story: null,
  };
}

export async function mapStation(id: string): Promise<Station | null> {
  return fromMapStation((await loadMapStations()).find((s) => s.id === id));
}
