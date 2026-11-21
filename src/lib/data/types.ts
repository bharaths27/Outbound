// Frontend data types. The backend is the source of truth: every shape that matches the
// database lives in `src/lib/types.ts` and is re-exported here unchanged. This file adds
// only frontend shapes derived from that data.

import type { CheckInErrorHint, CheckInResult, SquadMemberProfile, Squad } from "@/lib/types";

export type {
  CheckInErrorHint,
  CheckInResult,
  Deal,
  Filters,
  Friendship,
  LeaderboardRow,
  Line,
  PassportNeighborhood,
  PassportStamp,
  Privacy,
  Profile,
  Quest,
  QuestType,
  School,
  Squad,
  SquadMemberProfile,
  Station,
  Tier,
  Visit,
  XpReason,
} from "@/lib/types";

export type PriceTier = 0 | 1 | 2 | 3; // 0 free, 1 cheap, 2 mid, 3 splurge

/** A squad with its members (view squad_member_profiles). */
export interface SquadWithMembers extends Squad {
  members: SquadMemberProfile[];
}

/** A failed check_in(), sorted by its stable hint code. See checkInErrors.ts. */
export interface CheckInError {
  code: CheckInErrorHint | "UNKNOWN";
  message: string; // the backend's message, for logs; UI copy is written per code
  distanceM?: number; // TOO_FAR only
  radiusM?: number; // TOO_FAR only
}

export type CheckInOutcome = { ok: true; result: CheckInResult } | { ok: false; error: CheckInError };
