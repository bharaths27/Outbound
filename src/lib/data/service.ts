// The one data interface every screen talks to. Mock and Supabase implementations both
// satisfy it; components import the active one from "@/lib/data", never from mock/ or
// supabase/ directly. Each method maps to a table, view, or RPC in
// backend/supabase/schema.sql; the frontend never computes XP, tiers, or scores itself.

import type {
  CheckInOutcome,
  Deal,
  Filters,
  LeaderboardRow,
  PassportNeighborhood,
  Privacy,
  Profile,
  Quest,
  School,
  SquadWithMembers,
  Station,
  Visit,
} from "./types";

export interface DataService {
  // auth (sign-up is gated by school email domain in handle_new_user())
  getCurrentUser(): Promise<Profile | null>;
  signInWithEmail(email: string): Promise<{ ok: boolean; error?: "unsupported_school" | "send_failed" }>;
  signInDemo(userId: string): Promise<Profile>; // preloaded demo accounts for judges
  signOut(): Promise<void>;

  // content
  getSchools(): Promise<School[]>;
  getStations(): Promise<Station[]>;
  getStation(id: string): Promise<Station | null>;
  getQuests(stationId: string, filters?: Filters): Promise<Quest[]>;
  getQuest(id: string): Promise<Quest | null>;
  getDeals(questIds: string[]): Promise<Deal[]>;
  searchQuests(query: string, stationId?: string): Promise<{ filters: Filters; quests: Quest[] }>;

  // check-in: rpc('check_in'). Location or QR proof (demo accounts may skip both);
  // failures come back as a CheckInError keyed by error.hint.
  checkIn(
    questId: string,
    location: { lat: number; lon: number } | null,
    opts?: { qr?: string; squadId?: string },
  ): Promise<CheckInOutcome>;

  // passport and visits
  getPassport(userId: string): Promise<PassportNeighborhood[]>;
  getVisits(userId: string): Promise<Visit[]>;
  setVisitHidden(visitId: number, hidden: boolean): Promise<void>;

  // school leaderboard: view leaderboard_weekly
  getSchoolLeaderboard(): Promise<LeaderboardRow[]>;

  // squads (members from the squad_member_profiles view)
  getMySquads(): Promise<SquadWithMembers[]>;
  getSquadByCode(code: string): Promise<SquadWithMembers | null>;
  createSquad(name: string): Promise<SquadWithMembers>;
  joinSquad(code: string): Promise<SquadWithMembers>;
  leaveSquad(squadId: string): Promise<void>;

  // friends (accepted friendships only)
  getFriends(): Promise<Profile[]>;
  sendFriendRequest(userId: string): Promise<void>;

  // privacy
  updatePrivacy(privacy: Privacy): Promise<Profile>;
}
