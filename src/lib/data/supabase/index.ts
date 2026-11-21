// Real backend implementation of DataService, against backend/supabase/schema.sql plus
// migrations 002–004 and Bharath's backend guide. Row-level security decides what each
// user sees: an empty result can mean "not allowed", not an error.
//
// createSupabaseService takes the client as a function so integration tests can pass a
// plain supabase-js client; the app uses the browser client (src/lib/supabase/client.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { matchesFilters } from "@/lib/search/matchFilters";
import { parseQuery } from "@/lib/search/fallbackParser";
import { parseCheckInError } from "../checkInErrors";
import type { DataService } from "../service";
import type {
  AuthError,
  AuthResult,
  CheckInResult,
  LeaderboardRow,
  PassportNeighborhood,
  Profile,
  Quest,
  School,
  Squad,
  SquadMemberProfile,
  SquadWithMembers,
  Station,
  Visit,
} from "../types";

type Fail = { message: string; code?: string; hint?: string | null } | null;

/** Throws a readable error for failed queries; screens show their own copy. */
function must<T>(res: { data: T | null; error: Fail }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Maps Supabase Auth messages to the login screen's error codes. */
export function authError(message: string | undefined, hint?: string | null): AuthError {
  const m = (message ?? "").toLowerCase();
  if (hint === "SCHOOL_NOT_SUPPORTED" || m.includes("database error saving new user") || m.includes("school")) {
    return "unsupported_school";
  }
  if (m.includes("invalid login credentials") || m.includes("invalid credentials")) return "invalid_credentials";
  if (m.includes("already registered") || m.includes("already exists")) return "already_registered";
  if (m.includes("password")) return "weak_password";
  return "failed";
}

export function createSupabaseService(client: () => SupabaseClient): DataService {
  const db = () => client();

  async function myId(): Promise<string | null> {
    const { data } = await db().auth.getUser();
    return data.user?.id ?? null;
  }

  async function requireId(): Promise<string> {
    const id = await myId();
    if (!id) throw new Error("not signed in");
    return id;
  }

  async function profileById(id: string): Promise<Profile | null> {
    return must(await db().from("profiles").select("*").eq("id", id).maybeSingle(), "profile") as Profile | null;
  }

  async function membersOf(squadIds: string[]): Promise<Map<string, SquadMemberProfile[]>> {
    const byId = new Map<string, SquadMemberProfile[]>(squadIds.map((id) => [id, []]));
    if (squadIds.length === 0) return byId;
    const rows = must(
      await db().from("squad_member_profiles").select("*").in("squad_id", squadIds),
      "squad members",
    ) as SquadMemberProfile[];
    for (const r of rows) byId.get(r.squad_id)?.push(r);
    return byId;
  }

  async function withMembers(squads: Squad[]): Promise<SquadWithMembers[]> {
    const members = await membersOf(squads.map((s) => s.id));
    return squads.map((s) => ({ ...s, members: members.get(s.id) ?? [] }));
  }

  async function signedInResult(): Promise<AuthResult> {
    const id = await myId();
    const profile = id ? await profileById(id) : null;
    return profile ? { ok: true, profile } : { ok: false, error: "failed" };
  }

  return {
    // ---------- auth ----------
    async getCurrentUser() {
      const id = await myId();
      return id ? profileById(id) : null;
    },

    async signIn(email, password) {
      const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: authError(error.message) };
      return signedInResult();
    },

    async signUp(email, password) {
      const { data, error } = await db().auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, error: authError(error.message, (error as { hint?: string }).hint) };
      // Supabase hides "already registered" by returning a user with no identities.
      if (data.user && data.user.identities?.length === 0) return { ok: false, error: "already_registered" };
      if (!data.session) {
        // Email confirmation is off, so this shouldn't happen; sign in to get a session.
        const signedIn = await db().auth.signInWithPassword({ email: email.trim(), password });
        if (signedIn.error) return { ok: false, error: authError(signedIn.error.message) };
      }
      return signedInResult();
    },

    async signInDemo(accountId) {
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: accountId }),
      });
      if (!res.ok) throw new Error(`demo login ${res.status}`);
      // The route set the session cookie; the browser client picks it up on refresh.
      await db().auth.refreshSession().catch(() => {});
      const profile = await this.getCurrentUser();
      if (!profile) throw new Error("demo login: no session");
      return profile;
    },

    async signOut() {
      await db().auth.signOut();
    },

    // ---------- content ----------
    async getSchools() {
      return must(await db().from("schools").select("*").order("id"), "schools") as School[];
    },

    async getStations() {
      return must(await db().from("stations").select("*"), "stations") as Station[];
    },

    async getStation(id) {
      return must(await db().from("stations").select("*").eq("id", id).maybeSingle(), "station") as Station | null;
    },

    async getQuests(stationId, filters) {
      const quests = must(await db().from("quests").select("*").eq("station_id", stationId), "quests") as Quest[];
      return quests.filter((q) => matchesFilters(q, filters));
    },

    async getQuest(id) {
      return must(await db().from("quests").select("*").eq("id", id).maybeSingle(), "quest") as Quest | null;
    },

    async getAllQuests() {
      return must(await db().from("quests").select("*"), "quests") as Quest[];
    },

    async getDeals(questIds) {
      if (questIds.length === 0) return [];
      return must(await db().from("deals").select("*").in("quest_id", questIds), "deals");
    },

    async searchQuests(query, stationId) {
      // The hub calls /api/search directly; this keyword version stays for other callers.
      const pool = stationId ? await this.getQuests(stationId) : await this.getAllQuests();
      const filters = parseQuery(query, [...new Set(pool.flatMap((q) => q.vibe_tags))]);
      return { filters, quests: pool.filter((q) => matchesFilters(q, filters)) };
    },

    // ---------- check-in ----------
    async checkIn(questId, location, opts) {
      const { data, error } = await db().rpc("check_in", {
        p_quest_id: questId,
        p_lat: location?.lat ?? null,
        p_lon: location?.lon ?? null,
        p_qr: opts?.qr ?? null,
        p_squad_id: opts?.squadId ?? null,
      });
      if (error) return { ok: false, error: parseCheckInError(error) };
      return { ok: true, result: data as CheckInResult };
    },

    // ---------- passport and visits ----------
    async getPassport(userId) {
      return must(await db().from("passport").select("*").eq("user_id", userId), "passport") as PassportNeighborhood[];
    },

    async getVisits(userId) {
      return must(
        await db().from("visits").select("*").eq("user_id", userId).order("checked_in_at", { ascending: false }),
        "visits",
      ) as Visit[];
    },

    async setVisitHidden(visitId, hidden) {
      must(await db().from("visits").update({ hidden }).eq("id", visitId), "hide visit");
    },

    // ---------- leaderboard ----------
    async getSchoolLeaderboard() {
      return must(await db().from("leaderboard_weekly").select("*"), "leaderboard") as LeaderboardRow[];
    },

    // ---------- squads ----------
    async getMySquads() {
      const me = await requireId();
      const rows = must(
        await db().from("squad_members").select("squad_id, squads(*)").eq("user_id", me),
        "my squads",
      ) as unknown as { squad_id: string; squads: Squad | Squad[] | null }[];
      const squads = rows.flatMap((r) => (Array.isArray(r.squads) ? r.squads : r.squads ? [r.squads] : []));
      return withMembers(squads);
    },

    async getSquadByCode(code) {
      const squad = must(
        await db().from("squads").select("*").eq("code", code.trim().toUpperCase()).maybeSingle(),
        "squad",
      ) as Squad | null;
      // Members of squads you're not in are hidden by RLS, so a preview may have none.
      return squad ? (await withMembers([squad]))[0] : null;
    },

    async createSquad(name) {
      const me = await requireId();
      const squad = must(
        await db().from("squads").insert({ name: name.trim() || null, created_by: me }).select().single(),
        "create squad",
      ) as Squad;
      must(await db().from("squad_members").insert({ squad_id: squad.id, user_id: me }), "join new squad");
      return (await withMembers([squad]))[0];
    },

    async joinSquad(code) {
      const me = await requireId();
      const squad = await this.getSquadByCode(code);
      if (!squad) throw new Error("squad not found");
      const { error } = await db().from("squad_members").insert({ squad_id: squad.id, user_id: me });
      if (error && error.code !== "23505") throw new Error(`join squad: ${error.message}`); // 23505: already a member
      return (await withMembers([squad]))[0];
    },

    async leaveSquad(squadId) {
      const me = await requireId();
      must(await db().from("squad_members").delete().eq("squad_id", squadId).eq("user_id", me), "leave squad");
    },

    // ---------- friends ----------
    async getFriends() {
      const me = await requireId();
      const rows = must(
        await db().from("friends").select("user_id, friend_id").eq("status", "accepted").or(`user_id.eq.${me},friend_id.eq.${me}`),
        "friends",
      ) as { user_id: string; friend_id: string }[];
      const ids = [...new Set(rows.map((r) => (r.user_id === me ? r.friend_id : r.user_id)))];
      if (ids.length === 0) return [];
      return must(await db().from("profiles").select("*").in("id", ids), "friend profiles") as Profile[];
    },

    async sendFriendRequest(userId) {
      const me = await requireId();
      must(await db().from("friends").insert({ user_id: me, friend_id: userId }), "friend request");
    },

    // ---------- profile and privacy ----------
    async updatePrivacy(privacy) {
      const me = await requireId();
      return must(await db().from("profiles").update({ privacy }).eq("id", me).select().single(), "privacy") as Profile;
    },

    async updateDisplayName(name) {
      const me = await requireId();
      const display_name = name.trim().slice(0, 40) || null;
      return must(await db().from("profiles").update({ display_name }).eq("id", me).select().single(), "name") as Profile;
    },
  };
}

let browserClient: SupabaseClient | null = null;

/** The app's service: one browser client, created on first use (never during build). */
export const supabaseService: DataService = createSupabaseService(() => (browserClient ??= createClient()));
