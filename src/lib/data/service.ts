// The one data interface every screen talks to. Mock and Supabase implementations both
// satisfy it; components import the active one from "@/lib/data", never from mock/ or
// supabase/ directly. Each method maps to a table, view, or RPC in
// backend/supabase/schema.sql; the frontend never computes XP, tiers, or scores itself.

import type {
  AuthResult,
  CheckInOutcome,
  HostedEvent,
  NewHostedEvent,
  PlaceCheckInOutcome,
  Deal,
  Filters,
  GameProgress,
  LeaderboardRow,
  PassportNeighborhood,
  Privacy,
  PlayerLeaderboardRow,
  Friendship,
  CommentWithAuthor,
  ImportedReview,
  MyPlaceState,
  Profile,
  ProfileBoard,
  ProfileExtras,
  Review,
  ReviewWithMeta,
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

  // rpc('check_in_place') (009_place_points.sql): points for any restaurant or place on the map.
  // Needs your location within 75 m of the place; XP is computed by the database.
  checkInPlace(
    place: { key: string; name: string; category: string; lat: number; lon: number; minutes: number },
    location: { lat: number; lon: number } | null,
  ): Promise<PlaceCheckInOutcome>;

  // Host (010_hosted_events.sql): events students publish; everyone sees them on the map.
  getHostedEvents(): Promise<HostedEvent[]>;
  createHostedEvent(e: NewHostedEvent): Promise<HostedEvent>; // signed in only
  deleteHostedEvent(id: string): Promise<void>; // your own only

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
  /** Every friendship row you're part of (pending both ways, and accepted), for Add / Requested / Accept buttons. */
  getFriendships(): Promise<Friendship[]>;
  /** Profiles of people who sent you a request you haven't accepted yet. */
  getFriendRequests(): Promise<Profile[]>;
  acceptFriendRequest(userId: string): Promise<void>;
  /** Unfriend, cancel your request, or decline theirs. */
  removeFriend(userId: string): Promise<void>;

  // social profiles (Beli-style): reviews, want-to-visit list, likes, comments
  /** Null if there's no such player. Privacy decides `visible`. */
  getProfileBoard(userId: string): Promise<ProfileBoard | null>;
  getMyPlaceState(questId: string): Promise<MyPlaceState>;
  /** Visible reviews of one quest (yours, friends', public players'). */
  getQuestReviews(questId: string): Promise<ReviewWithMeta[]>;
  /** Recent reviews from your friends. */
  getFriendFeed(): Promise<ReviewWithMeta[]>;
  /** Rate a quest you've checked in at (creates or updates your review). */
  saveReview(questId: string, rating: number, note: string): Promise<Review>;
  deleteReview(reviewId: string): Promise<void>;
  setSaved(questId: string, saved: boolean): Promise<void>;
  setLiked(reviewId: string, liked: boolean): Promise<void>;
  getComments(reviewId: string): Promise<CommentWithAuthor[]>;
  addComment(reviewId: string, text: string): Promise<CommentWithAuthor>;
  deleteComment(commentId: string): Promise<void>;
  /** Bring in reviews from a Google Takeout file. Skips ones already imported. */
  importReviews(items: ImportedReview[]): Promise<{ imported: number; skipped: number }>;

  // profile and privacy
  updatePrivacy(privacy: Privacy): Promise<Profile>;
  updateDisplayName(name: string): Promise<Profile>;
  /** Grad year, bio, banner, name. */
  updateProfileExtras(extras: ProfileExtras): Promise<Profile>;
  /** Uploads a profile photo (already resized, image/webp or jpeg) and sets avatar_url. */
  uploadAvatar(image: Blob): Promise<Profile>;
  removeAvatar(): Promise<Profile>;
  /** Your private note about another player (Discord-style). Only you can read it. */
  getNote(subjectId: string): Promise<string>;
  setNote(subjectId: string, text: string): Promise<void>;
  /** Google sign-in limited to school accounts (Supabase only). Redirects the page. */
  signInWithGoogle?(): Promise<void>; // profiles.display_name (onboarding)
}
