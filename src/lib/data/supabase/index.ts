// Real backend implementation. Stubbed until the halfway integration, when it is filled in
// against backend/supabase/schema.sql (tables, views, and the check_in() RPC).
// Use parseCheckInError() on check_in() exceptions.

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
};
