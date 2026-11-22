// The one data interface every screen talks to. Mock and Supabase implementations both
// satisfy it; components import the active one from "@/lib/data", never from mock/ or
// supabase/ directly. Each method maps to a table, view, or RPC in
// backend/supabase/schema.sql; the frontend never computes XP, tiers, or scores itself.

import type {
  AuthResult,
  CheckInOutcome,
  Deal,
  Filters,
  GameProgress,
  LeaderboardRow,
  PassportNeighborhood,
  Privacy,
  PlayerLeaderboardRow,
  Profile,
  Quest,
  QuestOfTheWeek,
  School,
  SquadWithMembers,
  Station,
  Visit,
} from "./types";

export interface DataService {
  // auth: email + password (Supabase Auth). Sign-up is gated by school email domain in
  // handle_new_user(), which also creates the profile row.
  getCurrentUser(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  // DemoAccount.id; one tap for judges. Callers reload the page afterward: on Supabase the
  // session arrives as a server-set cookie, which a running browser client doesn't see.
  signInDemo(accountId: string): Promise<void>;
  signOut(): Promise<void>;

  // content
  getSchools(): Promise<School[]>;
  getStations(): Promise<Station[]>;
  getStation(id: string): Promise<Station | null>;
  getQuests(stationId: string, filters?: Filters): Promise<Quest[]>;
  getQuest(id: string): Promise<Quest | null>;
  getAllQuests(): Promise<Quest[]>; // every quest, for the passport's locked stamps
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
  // player leaderboard: view leaderboard_players_weekly (public players only)
  getPlayerLeaderboard(): Promise<PlayerLeaderboardRow[]>;

  // weekly game (migration 005_gamification)
  getQuestOfTheWeek(): Promise<QuestOfTheWeek | null>; // rpc('quest_of_the_week')
  // rpc('recommend_quest'): a vote for next week's pick. Needs a check-in there this week.
  recommendQuest(questId: string): Promise<void>;
  getGameProgress(): Promise<GameProgress | null>; // rpc('my_game_progress'); null signed out

  // squads (members from the squad_member_profiles view)
  getMySquads(): Promise<SquadWithMembers[]>;
  getSquadByCode(code: string): Promise<SquadWithMembers | null>;
  createSquad(name: string): Promise<SquadWithMembers>;
  joinSquad(code: string): Promise<SquadWithMembers>;
  leaveSquad(squadId: string): Promise<void>;

  // friends (accepted friendships only)
  getFriends(): Promise<Profile[]>;
  sendFriendRequest(userId: string): Promise<void>;

  // profile and privacy
  updatePrivacy(privacy: Privacy): Promise<Profile>;
  updateDisplayName(name: string): Promise<Profile>; // profiles.display_name (onboarding)
}
