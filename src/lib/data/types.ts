// Frontend data types. The backend is the source of truth: every shape that matches the
// database lives in `src/lib/types.ts` and is re-exported here unchanged. This file adds
// only frontend shapes derived from that data.

import type { BadgeId, CheckInErrorHint, CheckInResult, Profile, Review, ReviewComment, SavedPlace, SquadMemberProfile, Squad, Visit } from "@/lib/types";

export type {
  BadgeId,
  CheckInErrorHint,
  CheckInResult,
  Deal,
  Filters,
  Friendship,
  GameProgress,
  LeaderboardRow,
  Line,
  PassportNeighborhood,
  PassportStamp,
  PlayerLeaderboardRow,
  Privacy,
  Profile,
  Quest,
  QuestOfTheWeek,
  QuestType,
  Review,
  ReviewComment,
  SavedPlace,
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

/** Why sign-in or sign-up failed, for the login screen's copy. */
export type AuthError = "unsupported_school" | "invalid_credentials" | "already_registered" | "weak_password" | "check_email" | "failed";

export type AuthResult = { ok: true; profile: Profile } | { ok: false; error: AuthError };

/** A demo login shown on the login screen. `id` is a mock user id or a real demo email. */
export interface DemoAccount {
  id: string;
  label: string;
  blurb: string;
}

/** A student-hosted event (010_hosted_events.sql), shown on the map and the Host page. */
export type HostedEventKind = "party" | "social" | "food" | "study" | "sports" | "music" | "workshop" | "other";
export type HostedFood = "free" | "cheap" | "paid" | "none";
export interface HostedEvent {
  id: string;
  host_id: string | null;
  host_name: string;
  title: string;
  kind: HostedEventKind;
  description: string;
  food: HostedFood;
  prizes: string | null;
  starts_at: string;
  ends_at: string;
  place_name: string;
  lat: number;
  lon: number;
  station_id: string | null;
  created_at: string;
}
export type NewHostedEvent = Omit<HostedEvent, "id" | "host_id" | "created_at">;

export interface PlaceCheckInResult {
  xp_awarded: number;
  base: number;
  distance_xp: number;
  budget_xp: number;
  total_xp: number;
}
export type PlaceCheckInOutcome = { ok: true; result: PlaceCheckInResult } | { ok: false; error: CheckInError };
export type CheckInOutcome = { ok: true; result: CheckInResult } | { ok: false; error: CheckInError };

/** A review with its like and comment counts, and the author for feeds. */
export interface ReviewWithMeta extends Review {
  likes: number;
  liked_by_me: boolean;
  comments: number;
  author: { id: string; display_name: string; school_id: number };
}

export interface CommentWithAuthor extends ReviewComment {
  author: { id: string; display_name: string };
}

/** Everything the profile board shows. `visible` is false when privacy hides the rest. */
export interface ProfileBoard {
  profile: Profile;
  visible: boolean;
  is_me: boolean;
  visits: Visit[]; // not hidden ones, unless it's you
  reviews: ReviewWithMeta[];
  saved: SavedPlace[];
  /** Badges this player has earned (shown on their profile card). */
  badges: BadgeId[];
}

export interface ProfileExtras {
  display_name?: string;
  grad_year?: number | null;
  bio?: string | null;
  banner?: string | null;
}

/** One place from a Google Takeout "Reviews.json", already parsed. */
export interface ImportedReview {
  name: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  stars: number; // Google's 1–5
  text: string;
  date: string; // YYYY-MM-DD
}

export interface MyPlaceState {
  visited: boolean;
  saved: boolean;
  review: Review | null;
}
