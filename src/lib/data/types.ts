// Frontend data types. The backend is the source of truth:
// - Shapes already in `src/lib/types.ts` are re-exported from there, unchanged.
// - Everything else mirrors `backend/supabase/schema.sql` column-for-column (snake_case),
//   so Supabase rows can be used as-is. Proposed for a move into `src/lib/types.ts`
//   (see docs/requests-for-others.md); until then, keep these in sync with the schema.

import type { CheckInResult } from "@/lib/types";

export type {
  CheckInResult,
  Filters,
  Line,
  Quest,
  QuestType,
  Station,
} from "@/lib/types";

export type PriceTier = 0 | 1 | 2 | 3; // 0 free, 1 cheap, 2 mid, 3 splurge
export type Tier = "bronze" | "silver" | "gold";
export type Privacy = "public" | "friends" | "ghost";

// ---------- tables ----------

/** public.schools */
export interface School {
  id: number;
  name: string;
  email_domain: string;
  color: string | null; // small marks only (avatar ring, dot, thin bar)
}

/** public.deals */
export interface Deal {
  id: number;
  quest_id: string;
  text: string; // e.g. "SAMPLE: 10% off with student ID"
  is_sample: boolean;
}

/** public.profiles */
export interface Profile {
  id: string; // uuid
  email: string;
  school_id: number;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  privacy: Privacy;
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

// ---------- views ----------

/** One stamp inside a public.passport row. */
export interface PassportStamp {
  quest_id: string;
  at: string;
  cross_school: boolean;
}

/** public.passport: one row per user per neighborhood they have visited. */
export interface PassportNeighborhood {
  user_id: string;
  neighborhood: string;
  quests_done: number;
  tier: Tier;
  has_cross_school_stamp: boolean;
  stamps: PassportStamp[];
}

/** public.leaderboard_weekly, already ordered by eligible desc, weekly_xp desc. */
export interface LeaderboardRow {
  school_id: number;
  name: string;
  color: string | null;
  weekly_xp: number;
  players: number;
  eligible: boolean; // needs 5+ active players this week
}

// ---------- frontend-only shapes (derived from backend data, no new fields) ----------

/** A squad joined with its member profiles (from public.squad_members). */
export interface SquadWithMembers extends Squad {
  members: Pick<Profile, "id" | "display_name" | "avatar_url" | "school_id">[];
}

/**
 * check_in() raises an exception on failure. The frontend sorts the message into a
 * code so each error screen can offer a next step. See checkInErrors.ts.
 */
export type CheckInErrorCode =
  | "too_far"
  | "already_today"
  | "location_required"
  | "qr_mismatch"
  | "not_in_squad"
  | "quest_not_found"
  | "not_signed_in"
  | "unknown";

export interface CheckInError {
  code: CheckInErrorCode;
  message: string; // the backend's original message
  distanceM?: number; // too_far only
  radiusM?: number; // too_far only
}

export type CheckInOutcome =
  | { ok: true; result: CheckInResult }
  | { ok: false; error: CheckInError };
