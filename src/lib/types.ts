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
  checkin_radius_m: number; // how close a check-in must be (default 75)
  // The DB column quests.qr_code is a secret only check_in() should read, so the app never
  // fetches it. requires_qr says whether a quest is checked in by code (event quests).
  requires_qr: boolean;
  duration_min: number; // time spent at the spot (migration 002)
  walk_min: number; // walk from the station, one way (migration 002)
}

export type Tier = "bronze" | "silver" | "gold";

/** Reasons in check_in()'s xp_breakdown, in the order they are applied. */
export type XpReason = "base" | "first_visit" | "new_neighborhood" | "squad" | "cross_school";

/** check_in() return value (migration 002). xp_breakdown adds up to xp_awarded. */
export interface CheckInResult {
  xp_awarded: number;
  xp_breakdown: { reason: XpReason; xp: number }[];
  first_visit: boolean;
  new_neighborhood: boolean;
  cross_school: boolean;
  neighborhood: string;
  neighborhood_quests: number;
  tier: Tier;
  next_tier: Exclude<Tier, "bronze"> | null; // null at gold
  quests_to_next_tier: number;
  total_xp: number;
  level: number;
  xp_to_next_level: number;
}

/** Stable check_in() error codes, read from error.hint (messages may change). */
export type CheckInErrorHint =
  | "NOT_SIGNED_IN"
  | "QUEST_NOT_FOUND"
  | "QR_MISMATCH"
  | "LOCATION_REQUIRED"
  | "TOO_FAR"
  | "NOT_IN_SQUAD"
  | "ALREADY_CHECKED_IN_TODAY";

export interface Filters {
  craving: QuestType | "any" | string;
  budget: 0 | 1 | 2 | 3 | null; // max price tier
  minutes: number | null; // time available
}

// ---------- tables and views (backend/supabase/schema.sql + 002_frontend_requests.sql) ----------

export type Privacy = "public" | "friends" | "ghost";

/** public.schools */
export interface School {
  id: number;
  name: string;
  email_domain: string;
  color: string | null;
}

/** public.deals */
export interface Deal {
  id: number;
  quest_id: string;
  text: string; // e.g. "SAMPLE: 10% off with student ID"
  is_sample: boolean;
}

/** public.profiles. level and xp_to_next_level are generated columns (250 XP per level). */
export interface Profile {
  id: string; // uuid
  email: string;
  school_id: number;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  xp_to_next_level: number;
  privacy: Privacy;
  is_demo: boolean; // demo accounts can check in without a location
  created_at: string;
}

/** public.squads */
export interface Squad {
  id: string; // uuid
  code: string; // 6-char invite code
  name: string | null;
  created_by: string;
  created_at: string;
}

/** View public.squad_member_profiles: everyone in squads you belong to. */
export interface SquadMemberProfile {
  squad_id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  school_id: number;
  school_name: string;
  school_color: string | null;
  joined_at: string;
}

/** public.visits */
export interface Visit {
  id: number;
  user_id: string;
  quest_id: string;
  squad_id: string | null;
  checked_in_at: string;
  visit_date: string; // YYYY-MM-DD, America/New_York
  xp_awarded: number;
  cross_school: boolean;
  hidden: boolean;
}

/** public.friends */
export interface Friendship {
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted";
  created_at: string;
}

/** One stamp inside a public.passport row. */
export interface PassportStamp {
  quest_id: string;
  at: string;
  cross_school: boolean;
}

/** View public.passport: one row per user per neighborhood visited. */
export interface PassportNeighborhood {
  user_id: string;
  neighborhood: string;
  quests_done: number;
  tier: Tier;
  has_cross_school_stamp: boolean;
  stamps: PassportStamp[];
  next_tier: Exclude<Tier, "bronze"> | null; // null at gold
  quests_to_next_tier: number;
}

/** View public.leaderboard_weekly, ordered by eligible desc, weekly_xp desc. */
export interface LeaderboardRow {
  school_id: number;
  name: string;
  color: string | null;
  weekly_xp: number;
  players: number;
  eligible: boolean; // needs 5+ active players this week
}
