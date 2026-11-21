// Real backend implementation. Stubbed until the halfway integration, when it is filled in
// against backend/supabase/schema.sql and 002_frontend_requests.sql. Notes for later:
// - checkIn: supabase.rpc("check_in", { p_quest_id, p_lat, p_lon, p_qr, p_squad_id }); on error,
//   return { ok: false, error: parseCheckInError(error) } (it switches on error.hint).
// - getMySquads / getSquadByCode: members come from the squad_member_profiles view.
// - signInWithEmail: check the domain against schools first; Supabase may only report
//   "Database error saving new user" (hint SCHOOL_NOT_SUPPORTED).

import type { DataService } from "../service";

const notImplemented = (method: keyof DataService) => (): Promise<never> =>
  Promise.reject(new Error(`supabase DataService.${method} is not implemented yet`));

export const supabaseService: DataService = {
  getCurrentUser: notImplemented("getCurrentUser"),
  signInWithEmail: notImplemented("signInWithEmail"),
  signInDemo: notImplemented("signInDemo"),
  signOut: notImplemented("signOut"),
  getSchools: notImplemented("getSchools"),
  getStations: notImplemented("getStations"),
  getStation: notImplemented("getStation"),
  getQuests: notImplemented("getQuests"),
  getQuest: notImplemented("getQuest"),
  getAllQuests: notImplemented("getAllQuests"),
  getDeals: notImplemented("getDeals"),
  searchQuests: notImplemented("searchQuests"),
  checkIn: notImplemented("checkIn"),
  getPassport: notImplemented("getPassport"),
  getVisits: notImplemented("getVisits"),
  setVisitHidden: notImplemented("setVisitHidden"),
  getSchoolLeaderboard: notImplemented("getSchoolLeaderboard"),
  getMySquads: notImplemented("getMySquads"),
  getSquadByCode: notImplemented("getSquadByCode"),
  createSquad: notImplemented("createSquad"),
  joinSquad: notImplemented("joinSquad"),
  leaveSquad: notImplemented("leaveSquad"),
  getFriends: notImplemented("getFriends"),
  sendFriendRequest: notImplemented("sendFriendRequest"),
  updatePrivacy: notImplemented("updatePrivacy"),
  updateDisplayName: notImplemented("updateDisplayName"),
};
