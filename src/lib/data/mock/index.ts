// In-memory mock of the backend, used when NEXT_PUBLIC_DATA_SOURCE is not "supabase".
// Where it has to produce results (XP, tiers, leaderboard), it copies the rules written in
// backend/supabase/schema.sql (check_in(), the passport and leaderboard_weekly views) so
// demos behave like the real thing. The backend stays the source of truth: if the schema
// changes, update this file, and never import these rules into UI code.

import { parseCheckInError } from "../checkInErrors";
import type { DataService } from "../service";
import type {
  LeaderboardRow,
  PassportNeighborhood,
  Profile,
  Quest,
  Squad,
  SquadWithMembers,
  Tier,
  Visit,
} from "../types";
import { matchesFilters } from "@/lib/search/matchFilters";
import { parseQuery } from "@/lib/search/fallbackParser";
import * as seed from "./seed";

const DELAY_MS = 250;
const CHECK_IN_DELAY_MS = 600;
const STORAGE_KEY = "outbound.mockUserId";
const DEMO_IDS = new Set<string>(seed.DEMO_ACCOUNTS.map((a) => a.userId));

const wait = (ms = DELAY_MS) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);

// ---------- clock (Monday 00:00 America/New_York, like date_trunc('week', ...)) ----------

function nyWeekStart(now: Date): Date {
  const nyNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offsetMs = now.getTime() - nyNow.getTime();
  const monday = new Date(nyNow);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return new Date(monday.getTime() + offsetMs);
}

// ---------- state (fresh copy of the seed per page load) ----------

const state = (() => {
  const now = new Date();
  const visits = seed.buildVisits(now, nyWeekStart(now));
  const profiles = clone(seed.profiles).map((p) => ({
    ...p,
    xp: visits.filter((v) => v.user_id === p.id).reduce((sum, v) => sum + v.xp_awarded, 0),
  }));
  return {
    profiles,
    visits,
    squads: clone(seed.squads),
    squadMembers: clone(seed.squadMembers),
    friendships: clone(seed.friendships),
    currentUserId: null as string | null,
  };
})();

function readStoredUser(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeUser(id: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked (private window); stay signed in for this page load only
  }
}

function me(): Profile | null {
  state.currentUserId ??= readStoredUser();
  return state.profiles.find((p) => p.id === state.currentUserId) ?? null;
}

function requireMe(): Profile {
  const user = me();
  if (!user) throw new Error("not signed in");
  return user;
}

const questById = (id: string) => seed.quests.find((q) => q.id === id);
const stationById = (id: string) => seed.stations.find((s) => s.id === id);
const neighborhoodOf = (q: Quest) => stationById(q.station_id)!.neighborhood;

function schoolForEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return seed.schools
    .filter((s) => domain === s.email_domain || domain.endsWith(`.${s.email_domain}`))
    .sort((a, b) => b.email_domain.length - a.email_domain.length)[0];
}

function withMembers(squad: Squad): SquadWithMembers {
  const members = state.squadMembers
    .filter((m) => m.squad_id === squad.id)
    .map((m) => state.profiles.find((p) => p.id === m.user_id)!)
    .map(({ id, display_name, avatar_url, school_id }) => ({ id, display_name, avatar_url, school_id }));
  return { ...clone(squad), members };
}

// passport view: tiers bronze 1-2, silver 3-4, gold 5+
const tierFor = (count: number): Tier => (count >= 5 ? "gold" : count >= 3 ? "silver" : "bronze");

// ---------- the service ----------

export const mockService: DataService = {
  async getCurrentUser() {
    await wait();
    const user = me();
    return user ? clone(user) : null;
  },

  async signInWithEmail(email) {
    await wait();
    return schoolForEmail(email) ? { ok: true } : { ok: false, error: "unsupported_school" };
  },

  async signInDemo(userId) {
    await wait();
    const user = state.profiles.find((p) => p.id === userId);
    if (!user || !DEMO_IDS.has(userId)) throw new Error(`unknown demo account: ${userId}`);
    state.currentUserId = userId;
    storeUser(userId);
    return clone(user);
  },

  async signOut() {
    await wait();
    state.currentUserId = null;
    storeUser(null);
  },

  async getSchools() {
    await wait();
    return clone(seed.schools);
  },

  async getStations() {
    await wait();
    return clone(seed.stations);
  },

  async getStation(id) {
    await wait();
    const station = stationById(id);
    return station ? clone(station) : null;
  },

  async getQuests(stationId, filters) {
    await wait();
    return clone(seed.quests.filter((q) => q.station_id === stationId && matchesFilters(q, filters)));
  },

  async getQuest(id) {
    await wait();
    const q = questById(id);
    return q ? clone(q) : null;
  },

  async getDeals(questIds) {
    await wait();
    return clone(seed.deals.filter((d) => questIds.includes(d.quest_id)));
  },

  async searchQuests(query, stationId) {
    await wait();
    const pool = stationId ? seed.quests.filter((q) => q.station_id === stationId) : seed.quests;
    const filters = parseQuery(query, [...new Set(seed.quests.flatMap((q) => q.vibe_tags))]);
    return { filters, quests: clone(pool.filter((q) => matchesFilters(q, filters))) };
  },

  async checkIn(questId, location, opts) {
    await wait(CHECK_IN_DELAY_MS);
    try {
      // Same order of checks and messages as check_in() in schema.sql.
      const user = requireMe();
      const q = questById(questId);
      if (!q) throw new Error("quest not found");
      const hood = neighborhoodOf(q);
      if (!opts?.qr) {
        // Demo accounts skip location in mock mode (open question for the backend).
        if (!location && !DEMO_IDS.has(user.id)) throw new Error("location required");
        if (questId === seed.TOO_FAR_QUEST_ID) throw new Error("too far: 320 m away (need within 75 m)");
      }
      if (opts?.squadId && !state.squadMembers.some((m) => m.squad_id === opts.squadId && m.user_id === user.id)) {
        throw new Error("you are not in that squad");
      }
      const mine = state.visits.filter((v) => v.user_id === user.id);
      const now = new Date();
      const today = seed.nyDate(now);
      if (mine.some((v) => v.quest_id === q.id && v.visit_date === today)) {
        throw new Error("already checked in to this quest today");
      }

      const firstVisit = !mine.some((v) => v.quest_id === q.id);
      const newNeighborhood = !mine.some((v) => neighborhoodOf(questById(v.quest_id)!) === hood);
      // Cross-school doubling is not simulated; the backend decides it.
      let xp = q.xp + (firstVisit ? 25 : 0) + (newNeighborhood ? 25 : 0);
      if (opts?.squadId) xp = Math.round(xp * 1.2);

      const visit: Visit = {
        id: Math.max(0, ...state.visits.map((v) => v.id)) + 1,
        user_id: user.id,
        quest_id: q.id,
        squad_id: opts?.squadId ?? null,
        checked_in_at: now.toISOString(),
        visit_date: today,
        xp_awarded: xp,
        cross_school: false,
        hidden: false,
      };
      state.visits.push(visit);
      user.xp += xp;

      const count = new Set(
        [...mine, visit].filter((v) => neighborhoodOf(questById(v.quest_id)!) === hood).map((v) => v.quest_id),
      ).size;

      return {
        ok: true as const,
        result: {
          xp_awarded: xp,
          first_visit: firstVisit,
          new_neighborhood: newNeighborhood,
          cross_school: false,
          neighborhood: hood,
          neighborhood_quests: count,
          tier: tierFor(count),
          total_xp: user.xp,
        },
      };
    } catch (e) {
      return { ok: false as const, error: parseCheckInError(e instanceof Error ? e.message : String(e)) };
    }
  },

  async getPassport(userId) {
    await wait();
    const byHood = new Map<string, Visit[]>();
    for (const v of state.visits.filter((v) => v.user_id === userId)) {
      const hood = neighborhoodOf(questById(v.quest_id)!);
      byHood.set(hood, [...(byHood.get(hood) ?? []), v]);
    }
    return [...byHood].map(([neighborhood, vs]): PassportNeighborhood => {
      const sorted = [...vs].sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at));
      const questsDone = new Set(vs.map((v) => v.quest_id)).size;
      return {
        user_id: userId,
        neighborhood,
        quests_done: questsDone,
        tier: tierFor(questsDone),
        has_cross_school_stamp: vs.some((v) => v.cross_school),
        stamps: sorted.map((v) => ({ quest_id: v.quest_id, at: v.checked_in_at, cross_school: v.cross_school })),
      };
    });
  },

  async getVisits(userId) {
    await wait();
    return clone(state.visits.filter((v) => v.user_id === userId));
  },

  async setVisitHidden(visitId, hidden) {
    await wait();
    const user = requireMe();
    const visit = state.visits.find((v) => v.id === visitId && v.user_id === user.id);
    if (visit) visit.hidden = hidden;
  },

  async getSchoolLeaderboard() {
    await wait();
    const weekStart = nyWeekStart(new Date()).toISOString();
    const rows = seed.schools.map((s): LeaderboardRow => {
      const members = new Set(state.profiles.filter((p) => p.school_id === s.id).map((p) => p.id));
      const week = state.visits.filter((v) => members.has(v.user_id) && v.checked_in_at >= weekStart);
      const players = new Set(week.map((v) => v.user_id)).size;
      return {
        school_id: s.id,
        name: s.name,
        color: s.color,
        weekly_xp: week.reduce((sum, v) => sum + v.xp_awarded, 0),
        players,
        eligible: players >= 5,
      };
    });
    return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.weekly_xp - a.weekly_xp);
  },

  async getMySquads() {
    await wait();
    const user = requireMe();
    const ids = new Set(state.squadMembers.filter((m) => m.user_id === user.id).map((m) => m.squad_id));
    return state.squads.filter((s) => ids.has(s.id)).map(withMembers);
  },

  async getSquadByCode(code) {
    await wait();
    const squad = state.squads.find((s) => s.code === code.trim().toUpperCase());
    return squad ? withMembers(squad) : null;
  },

  async createSquad(name) {
    await wait();
    const user = requireMe();
    const squad: Squad = {
      id: `sq-${Date.now().toString(36)}`,
      code: Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, "0"),
      name: name.trim() || null,
      created_by: user.id,
      created_at: new Date().toISOString(),
    };
    state.squads.push(squad);
    state.squadMembers.push({ squad_id: squad.id, user_id: user.id });
    return withMembers(squad);
  },

  async joinSquad(code) {
    await wait();
    const user = requireMe();
    const squad = state.squads.find((s) => s.code === code.trim().toUpperCase());
    if (!squad) throw new Error("squad not found");
    if (!state.squadMembers.some((m) => m.squad_id === squad.id && m.user_id === user.id)) {
      state.squadMembers.push({ squad_id: squad.id, user_id: user.id });
    }
    return withMembers(squad);
  },

  async leaveSquad(squadId) {
    await wait();
    const user = requireMe();
    state.squadMembers = state.squadMembers.filter((m) => !(m.squad_id === squadId && m.user_id === user.id));
  },

  async getFriends() {
    await wait();
    const user = requireMe();
    const ids = state.friendships
      .filter((f) => f.status === "accepted" && (f.user_id === user.id || f.friend_id === user.id))
      .map((f) => (f.user_id === user.id ? f.friend_id : f.user_id));
    return clone(state.profiles.filter((p) => ids.includes(p.id)));
  },

  async sendFriendRequest(userId) {
    await wait();
    const user = requireMe();
    const exists = state.friendships.some(
      (f) => (f.user_id === user.id && f.friend_id === userId) || (f.user_id === userId && f.friend_id === user.id),
    );
    if (!exists && userId !== user.id) {
      state.friendships.push({ user_id: user.id, friend_id: userId, status: "pending", created_at: new Date().toISOString() });
    }
  },

  async updatePrivacy(privacy) {
    await wait();
    const user = requireMe();
    user.privacy = privacy;
    return clone(user);
  },
};
