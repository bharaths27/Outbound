// In-memory mock of the backend, used when NEXT_PUBLIC_DATA_SOURCE is not "supabase".
// Where it has to produce results (XP, tiers, leaderboard), it copies the rules written in
// backend/supabase/schema.sql and 002_frontend_requests.sql (check_in(), the passport,
// leaderboard_weekly, and squad_member_profiles views, generated level columns) so
// demos behave like the real thing. The backend stays the source of truth: if the schema
// changes, update this file, and never import these rules into UI code.

import { parseCheckInError } from "../checkInErrors";
import type { DataService } from "../service";
import type {
  CheckInErrorHint,
  CheckInResult,
  LeaderboardRow,
  PassportNeighborhood,
  Profile,
  Quest,
  Squad,
  SquadWithMembers,
  Tier,
  Visit,
  XpReason,
} from "../types";
import { matchesFilters } from "@/lib/search/matchFilters";
import { parseQuery } from "@/lib/search/fallbackParser";
import * as seed from "./seed";

const DELAY_MS = 250;
const CHECK_IN_DELAY_MS = 600;
const STORAGE_KEY = "outbound.mockUserId";
const DEMO_IDS = new Set<string>(seed.DEMO_ACCOUNTS.map((a) => a.id)); // signInDemo only
const MIN_PASSWORD = 6; // Supabase Auth's default minimum

// Simulated network latency, so loading states get built. Skipped under test.
const wait = (ms = DELAY_MS) =>
  process.env.NODE_ENV === "test" ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);

/** Raised like a Postgres exception: supabase-js exposes `hint` on the error. */
class RpcError extends Error {
  constructor(message: string, readonly hint: CheckInErrorHint) {
    super(message);
  }
}

/** profiles.level and xp_to_next_level are generated columns: one level per 250 XP. */
function setXp(p: Profile, xp: number) {
  p.xp = xp;
  p.level = Math.floor(xp / 250) + 1;
  p.xp_to_next_level = 250 - (xp % 250);
}

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
  const profiles = clone(seed.profiles);
  for (const p of profiles) {
    setXp(p, visits.filter((v) => v.user_id === p.id).reduce((sum, v) => sum + v.xp_awarded, 0));
  }
  return {
    profiles,
    visits,
    squads: clone(seed.squads),
    squadMembers: clone(seed.squadMembers) as { squad_id: string; user_id: string; joined_at?: string }[],
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
  if (!user) throw new RpcError("not signed in", "NOT_SIGNED_IN");
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

// squad_member_profiles view
function withMembers(squad: Squad): SquadWithMembers {
  const members = state.squadMembers
    .filter((m) => m.squad_id === squad.id)
    .map((m) => {
      const p = state.profiles.find((x) => x.id === m.user_id)!;
      const school = seed.schools.find((s) => s.id === p.school_id)!;
      return {
        squad_id: squad.id,
        user_id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        school_id: p.school_id,
        school_name: school.name,
        school_color: school.color,
        joined_at: m.joined_at ?? squad.created_at,
      };
    });
  return { ...clone(squad), members };
}

// passport view and check_in(): bronze 1-2, silver 3-4, gold 5+
const tierFor = (count: number): Tier => (count >= 5 ? "gold" : count >= 3 ? "silver" : "bronze");
const nextTier = (count: number) => ({
  next_tier: count >= 5 ? null : count >= 3 ? ("gold" as const) : ("silver" as const),
  quests_to_next_tier: count >= 5 ? 0 : count >= 3 ? 5 - count : 3 - count,
});

// ---------- the service ----------

export const mockService: DataService = {
  async getCurrentUser() {
    await wait();
    const user = me();
    return user ? clone(user) : null;
  },

  // Mock auth: passwords aren't stored or checked (any password of 6+ characters works),
  // so the real flow's screens and errors can be built without Supabase.
  async signIn(email) {
    await wait();
    const user = state.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) return { ok: false, error: "invalid_credentials" };
    state.currentUserId = user.id;
    storeUser(user.id);
    return { ok: true, profile: clone(user) };
  },

  async signUp(email, password) {
    await wait();
    const clean = email.trim().toLowerCase();
    const school = schoolForEmail(clean);
    if (!school) return { ok: false, error: "unsupported_school" };
    if (password.length < MIN_PASSWORD) return { ok: false, error: "weak_password" };
    if (state.profiles.some((p) => p.email.toLowerCase() === clean)) return { ok: false, error: "already_registered" };
    // What handle_new_user() does: a profile at the email's school, no name yet.
    const profile: Profile = {
      id: `u-new-${Date.now().toString(36)}`,
      email: clean,
      school_id: school.id,
      display_name: null,
      avatar_url: null,
      xp: 0,
      level: 1,
      xp_to_next_level: 250,
      privacy: "friends",
      is_demo: false,
      created_at: new Date().toISOString(),
    };
    state.profiles.push(profile);
    state.currentUserId = profile.id;
    storeUser(profile.id);
    return { ok: true, profile: clone(profile) };
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

  async getAllQuests() {
    await wait();
    return clone(seed.quests);
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
      // Same order of checks, messages, and hints as check_in() in migration 002.
      const user = requireMe();
      const q = questById(questId);
      if (!q) throw new RpcError("quest not found", "QUEST_NOT_FOUND");
      const hood = neighborhoodOf(q);
      // Same order as check_in(): a QR code replaces the location check.
      if (opts?.qr) {
        if (q.qr_code !== opts.qr) throw new RpcError("QR code does not match this quest", "QR_MISMATCH");
      } else if (!user.is_demo) {
        if (!location) throw new RpcError("location required", "LOCATION_REQUIRED");
      }
      // Mock only: this quest always fails as too far (even for demo accounts), so the
      // error screen can be built. The real check compares the location to the quest.
      if (!opts?.qr && questId === seed.TOO_FAR_QUEST_ID) {
        throw new RpcError("too far: 320 m away (need within 75 m)", "TOO_FAR");
      }
      if (opts?.squadId && !state.squadMembers.some((m) => m.squad_id === opts.squadId && m.user_id === user.id)) {
        throw new RpcError("you are not in that squad", "NOT_IN_SQUAD");
      }
      const mine = state.visits.filter((v) => v.user_id === user.id);
      const now = new Date();
      const today = seed.nyDate(now);
      if (mine.some((v) => v.quest_id === q.id && v.visit_date === today)) {
        throw new RpcError("already checked in to this quest today", "ALREADY_CHECKED_IN_TODAY");
      }

      const firstVisit = !mine.some((v) => v.quest_id === q.id);
      const newNeighborhood = !mine.some((v) => neighborhoodOf(questById(v.quest_id)!) === hood);
      // Cross-school doubling is not simulated (it needs a squad-mate's live check-in).
      const breakdown: { reason: XpReason; xp: number }[] = [{ reason: "base", xp: q.xp }];
      if (firstVisit) breakdown.push({ reason: "first_visit", xp: 25 });
      if (newNeighborhood) breakdown.push({ reason: "new_neighborhood", xp: 25 });
      let xp = breakdown.reduce((sum, b) => sum + b.xp, 0);
      if (opts?.squadId) {
        const bonus = Math.round(xp * 0.2);
        breakdown.push({ reason: "squad", xp: bonus });
        xp += bonus;
      }

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
      setXp(user, user.xp + xp);

      const count = new Set(
        [...mine, visit].filter((v) => neighborhoodOf(questById(v.quest_id)!) === hood).map((v) => v.quest_id),
      ).size;

      const result: CheckInResult = {
        xp_awarded: xp,
        xp_breakdown: breakdown,
        first_visit: firstVisit,
        new_neighborhood: newNeighborhood,
        cross_school: false,
        neighborhood: hood,
        neighborhood_quests: count,
        tier: tierFor(count),
        ...nextTier(count),
        total_xp: user.xp,
        level: user.level,
        xp_to_next_level: user.xp_to_next_level,
      };
      return { ok: true as const, result };
    } catch (e) {
      const err = e instanceof RpcError ? e : { message: e instanceof Error ? e.message : String(e) };
      return { ok: false as const, error: parseCheckInError(err) };
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
        ...nextTier(questsDone),
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
    state.squadMembers.push({ squad_id: squad.id, user_id: user.id, joined_at: squad.created_at });
    return withMembers(squad);
  },

  async joinSquad(code) {
    await wait();
    const user = requireMe();
    const squad = state.squads.find((s) => s.code === code.trim().toUpperCase());
    if (!squad) throw new Error("squad not found");
    if (!state.squadMembers.some((m) => m.squad_id === squad.id && m.user_id === user.id)) {
      state.squadMembers.push({ squad_id: squad.id, user_id: user.id, joined_at: new Date().toISOString() });
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

  async updateDisplayName(name) {
    await wait();
    const user = requireMe();
    user.display_name = name.trim().slice(0, 40) || null;
    return clone(user);
  },
};
