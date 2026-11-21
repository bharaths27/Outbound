// Shared data shapes. Change only with both frontend and backend in the loop.

export type Line = "Red" | "Orange" | "Green";

export interface Train {
  id: string;
  line: Line;
  route: string; // Red, Orange, Green-B, Green-C, Green-D, Green-E
  lat: number;
  lon: number;
  bearing: number | null;
  status: string | null;
  stopId: string | null;
  directionId: number | null;
  occupancy: string | null;
}

export interface Arrival {
  route: string;
  line: Line;
  directionId: number;
  arrivalTime: string;
  minutes: number;
  status: string | null;
}

export interface LineLateness {
  line: Line;
  nowDelayMin: number | null;
  normalDelayMin: number | null;
  vsNormalMin: number | null;
  method: "schedule" | "drift" | "none";
  samples: number;
  color: "green" | "yellow" | "orange" | "red" | "gray";
  badge: string;
}

export interface Station {
  id: string; // MBTA parent stop id, e.g. place-kencl
  name: string;
  lines: string[];
  lat: number;
  lon: number;
  neighborhood: string;
  story: string | null;
}

export type QuestType = "food" | "event" | "scenic";

export interface Quest {
  id: string;
  station_id: string;
  type: QuestType;
  title: string;
  description: string | null;
  lat: number;
  lon: number;
  price_tier: 0 | 1 | 2 | 3; // free, cheap, mid, splurge
  vibe_tags: string[];
  hours: string | null;
  photo_url: string | null;
  xp: number;
}

export interface CheckInResult {
  xp_awarded: number;
  first_visit: boolean;
  new_neighborhood: boolean;
  cross_school: boolean;
  neighborhood: string;
  neighborhood_quests: number;
  tier: "bronze" | "silver" | "gold";
  total_xp: number;
}

export interface Filters {
  craving: QuestType | "any" | string;
  budget: 0 | 1 | 2 | 3 | null; // max price tier
  minutes: number | null; // time available
}
