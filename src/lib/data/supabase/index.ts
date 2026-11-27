// Real backend implementation of DataService, against backend/supabase/schema.sql plus
// migrations 002–004 and Bharath's backend guide. Row-level security decides what each
// user sees: an empty result can mean "not allowed", not an error.
//
// createSupabaseService takes the client as a function so integration tests can pass a
// plain supabase-js client. In the browser the app uses @supabase/ssr's cookie-based
// client (same as src/lib/supabase/client.ts); on the server (e.g. /q/[questId]'s
// metadata and not-found check) it uses a session-less client, which is enough for public
// content. src/lib/supabase/client.ts is a "use client" module, so it can't be imported
// here: the server would get a client reference instead of the function.

import { createBrowserClient } from "@supabase/ssr";
import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";
import { matchesFilters } from "@/lib/search/matchFilters";
import { parseQuery } from "@/lib/search/fallbackParser";
import { parseCheckInError } from "../checkInErrors";
import { earnedBadges } from "@/features/badges/rules";
import type { DataService } from "../service";
import type {
  AuthError,
  BadgeId,
  AuthResult,
  CheckInResult,
  HostedEvent,
  PlaceCheckInResult,
  GameProgress,
  LeaderboardRow,
  PassportNeighborhood,
  PlayerLeaderboardRow,
  CommentWithAuthor,
  Friendship,
  ImportedReview,
  Profile,
  ProfileBoard,
  Review,
  ReviewWithMeta,
  Quest,
  QuestOfTheWeek,
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

/**
 * Quest columns the app reads, named one by one: never qr_code (the secret check_in() compares
 * against) and never "*", which fails once migration 007 revokes qr_code. Which quests need a
 * code comes from qrQuestIds() as ids only.
 */
/** Profile columns the app may read: never email, which migration 012 hides from other players. */
const PROFILE_COLUMNS = "id,school_id,display_name,avatar_url,xp,level,xp_to_next_level,privacy,is_demo,created_at,grad_year,bio,banner";

const QUEST_COLUMNS =
  "id,station_id,type,title,description,lat,lon,price_tier,vibe_tags,hours,photo_url,xp,checkin_radius_m,duration_min,walk_min";

type QuestRow = Omit<Quest, "requires_qr">;

export function createSupabaseService(client: () => SupabaseClient): DataService {
  const db = () => client();

  // Ids of quests checked in by code, from quests.has_qr (migration 006), never the code itself.
  // Migration 007 then revokes qr_code. Until 006 has run everywhere, a missing has_qr column
  // falls back to filtering on qr_code (still id-only); once 007 runs, only has_qr works.
  let qrIds: Promise<Set<string>> | null = null;
  function qrQuestIds(): Promise<Set<string>> {
    qrIds ??= (async () => {
      const ids = (rows: { id: string }[] | null) => new Set((rows ?? []).map((r) => r.id));
      const res = await db().from("quests").select("id").eq("has_qr", true);
      if (!res.error) return ids(res.data);
      const legacy = await db().from("quests").select("id").not("qr_code", "is", null);
      return legacy.error ? new Set<string>() : ids(legacy.data);
    })();
    return qrIds;
  }

  async function withQr(rows: QuestRow[]): Promise<Quest[]> {
    const ids = await qrQuestIds();
    return rows.map((q) => ({ ...q, requires_qr: ids.has(q.id) }));
  }

  async function myId(): Promise<string | null> {
    const { data } = await db().auth.getUser();
    return data.user?.id ?? null;
  }

  async function requireId(): Promise<string> {
    const id = await myId();
    if (!id) throw new Error("not signed in");
    return id;
  }


  /**
   * The SQL my_game_progress() only knows the original 4 badges. The rest are worked out here
   * from the player's own visits and reviews with the same rules the mock uses. Quest of the
   * Week history isn't stored on the server yet, so weekly_regular can't unlock on live data.
   */
  async function allBadges(userId: string, base: GameProgress): Promise<BadgeId[]> {
    try {
      const [visits, stations, quests, reviews] = await Promise.all([
        db().from("visits").select("quest_id, squad_id, checked_in_at, visit_date, cross_school").eq("user_id", userId),
        db().from("stations").select("id, lines, neighborhood"),
        db().from("quests").select("id, station_id"),
        db().from("reviews").select("id, note").eq("user_id", userId),
      ]);
      const st = new Map(((stations.data ?? []) as Pick<Station, "id" | "lines" | "neighborhood">[]).map((x) => [x.id, x]));
      const qs = (quests.data ?? []) as { id: string; station_id: string }[];
      const stationOfQuest = new Map(qs.map((q) => [q.id, st.get(q.station_id)]));
      const perHood: Record<string, number> = {};
      for (const q of qs) {
        const h = st.get(q.station_id)?.neighborhood;
        if (h) perHood[h] = (perHood[h] ?? 0) + 1;
      }
      const R = (reviews.data ?? []) as { id: string; note: string | null }[];
      const likes = R.length ? ((await db().from("review_likes").select("review_id").in("review_id", R.map((r) => r.id))).data ?? []) as { review_id: string }[] : [];
      const V = ((visits.data ?? []) as Pick<Visit, "quest_id" | "squad_id" | "checked_in_at" | "visit_date" | "cross_school">[]).flatMap((v) => {
        const s = stationOfQuest.get(v.quest_id);
        return s ? [{ ...v, station_lines: s.lines, neighborhood: s.neighborhood }] : [];
      });
      const extra = earnedBadges({
        visits: V,
        questsPerNeighborhood: perHood,
        reviews: R.map((r) => ({ note: r.note ?? "", likes: likes.filter((l) => l.review_id === r.id).length })),
        longestStreak: base.longest_streak,
      });
      return [...new Set([...base.badges, ...extra])];
    } catch {
      return base.badges;
    }
  }

  async function isFriend(a: string, b: string): Promise<boolean> {
    const { data } = await db().from("friends").select("status").eq("status", "accepted").or(`and(user_id.eq.${a},friend_id.eq.${b}),and(user_id.eq.${b},friend_id.eq.${a})`).limit(1);
    return !!data?.length;
  }

  async function displayNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (!uniq.length) return new Map();
    const { data } = await db().from("profiles").select("id, display_name, school_id").in("id", uniq);
    return new Map((data ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? "Player"]));
  }

  async function withMeta(rows: Review[], viewer: string | null): Promise<ReviewWithMeta[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [likes, comments, authors] = await Promise.all([
      db().from("review_likes").select("review_id, user_id").in("review_id", ids),
      db().from("review_comments").select("review_id").in("review_id", ids),
      db().from("profiles").select("id, display_name, school_id").in("id", [...new Set(rows.map((r) => r.user_id))]),
    ]);
    const L = (likes.data ?? []) as { review_id: string; user_id: string }[];
    const C = (comments.data ?? []) as { review_id: string }[];
    const A = new Map(((authors.data ?? []) as { id: string; display_name: string | null; school_id: number }[]).map((a) => [a.id, a]));
    return rows.map((r) => ({
      ...r,
      rating: Number(r.rating),
      likes: L.filter((l) => l.review_id === r.id).length,
      liked_by_me: !!viewer && L.some((l) => l.review_id === r.id && l.user_id === viewer),
      comments: C.filter((c) => c.review_id === r.id).length,
      author: { id: r.user_id, display_name: A.get(r.user_id)?.display_name ?? "Player", school_id: A.get(r.user_id)?.school_id ?? 0 },
    }));
  }

  async function profileById(id: string): Promise<Profile | null> {
    const row = must(await db().from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle(), "profile") as Omit<Profile, "email"> | null;
    if (!row) return null;
    // Your own email comes from your auth session; nobody else's is readable.
    const { data } = await db().auth.getUser();
    return { ...row, email: data.user?.id === id ? (data.user.email ?? "") : "" } as Profile;
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
      // With email confirmation on (it should be: it's what proves the player owns the school
      // inbox), there's no session until they click the link.
      if (!data.session) return { ok: false, error: "check_email" };
      return signedInResult();
    },

    async signInDemo(accountId) {
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: accountId }),
      });
      if (!res.ok) throw new Error(`demo login ${res.status}`);
      // The route set the session cookie. The running browser client started signed out
      // and won't notice, so the caller reloads the page (see DataService.signInDemo).
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
      const rows = must(await db().from("quests").select(QUEST_COLUMNS).eq("station_id", stationId), "quests") as QuestRow[];
      return (await withQr(rows)).filter((q) => matchesFilters(q, filters));
    },

    async getQuest(id) {
      const row = must(await db().from("quests").select(QUEST_COLUMNS).eq("id", id).maybeSingle(), "quest") as QuestRow | null;
      return row ? (await withQr([row]))[0] : null;
    },

    async getAllQuests() {
      return withQr(must(await db().from("quests").select(QUEST_COLUMNS), "quests") as QuestRow[]);
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

    async checkInPlace(place, location) {
      const { data, error } = await db().rpc("check_in_place", {
        p_key: place.key,
        p_name: place.name,
        p_category: place.category,
        p_place_lat: place.lat,
        p_place_lon: place.lon,
        p_minutes: Math.round(place.minutes),
        p_lat: location?.lat ?? null,
        p_lon: location?.lon ?? null,
      });
      if (error) return { ok: false, error: parseCheckInError(error) };
      return { ok: true, result: data as PlaceCheckInResult };
    },

    // ---------- host ----------
    async getHostedEvents() {
      return must(
        await db().from("hosted_events").select("*").gt("ends_at", new Date().toISOString()).order("starts_at"),
        "hosted events",
      ) as HostedEvent[];
    },

    async createHostedEvent(e) {
      const me = await requireId();
      return must(await db().from("hosted_events").insert({ ...e, host_id: me }).select().single(), "publish event") as HostedEvent;
    },

    async deleteHostedEvent(id) {
      must(await db().from("hosted_events").delete().eq("id", id), "delete event");
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

    async getPlayerLeaderboard() {
      return must(
        await db().from("leaderboard_players_weekly").select("*").order("rank").limit(50),
        "player leaderboard",
      ) as PlayerLeaderboardRow[];
    },

    // ---------- weekly game ----------
    async getQuestOfTheWeek() {
      const rows = must(await db().rpc("quest_of_the_week"), "quest of the week") as QuestOfTheWeek[];
      return rows[0] ?? null;
    },

    async recommendQuest(questId) {
      must(await db().rpc("recommend_quest", { p_quest_id: questId }), "recommend quest");
    },

    async getGameProgress() {
      const me = await myId();
      if (!me) return null;
      const base = must(await db().rpc("my_game_progress"), "game progress") as GameProgress;
      return { ...base, badges: await allBadges(me, base) };
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
      return must(await db().from("profiles").select(PROFILE_COLUMNS).in("id", ids), "friend profiles") as Profile[];
    },

    async sendFriendRequest(userId) {
      const me = await requireId();
      must(await db().from("friends").insert({ user_id: me, friend_id: userId }), "friend request");
    },

    async getFriendships() {
      const me = await requireId();
      return must(
        await db().from("friends").select("user_id, friend_id, status, created_at").or(`user_id.eq.${me},friend_id.eq.${me}`),
        "friendships",
      ) as Friendship[];
    },

    async getFriendRequests() {
      const me = await requireId();
      const rows = must(
        await db().from("friends").select("user_id").eq("friend_id", me).eq("status", "pending"),
        "friend requests",
      ) as { user_id: string }[];
      if (rows.length === 0) return [];
      return must(await db().from("profiles").select(PROFILE_COLUMNS).in("id", rows.map((r) => r.user_id)), "request profiles") as Profile[];
    },

    async acceptFriendRequest(userId) {
      const me = await requireId();
      must(await db().from("friends").update({ status: "accepted" }).eq("user_id", userId).eq("friend_id", me), "accept friend");
    },

    async removeFriend(userId) {
      const me = await requireId();
      must(
        await db().from("friends").delete().or(`and(user_id.eq.${me},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${me})`),
        "remove friend",
      );
    },


    // ---------- social (migration 011) ----------
    async getProfileBoard(userId) {
      const viewer = await myId();
      const profile = await profileById(userId);
      if (!profile) return null;
      const isMe = viewer === userId;
      // RLS hides everything when privacy says no, so an empty result also means "can't see".
      const canSee = isMe || profile.privacy === "public" || (profile.privacy === "friends" && !!viewer && (await isFriend(viewer, userId)));
      if (!canSee) return { profile, visible: false, is_me: false, visits: [], reviews: [], saved: [], badges: [] } satisfies ProfileBoard;
      const [visits, reviews, saved] = await Promise.all([
        db().from("visits").select("*").eq("user_id", userId).order("checked_in_at", { ascending: false }),
        db().from("reviews").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        db().from("saved_places").select("*").eq("user_id", userId),
      ]);
      const progress = isMe ? ((await db().rpc("my_game_progress")).data as GameProgress | null) : null;
      const badges = progress ? await allBadges(userId, progress) : [];
      return {
        profile,
        visible: true,
        is_me: isMe,
        badges,
        visits: (must(visits, "visits") as Visit[]).filter((v) => isMe || !v.hidden),
        reviews: await withMeta(must(reviews, "reviews") as Review[], viewer),
        saved: must(saved, "saved places") as ProfileBoard["saved"],
      };
    },

    async getMyPlaceState(questId) {
      const me = await myId();
      if (!me) return { visited: false, saved: false, review: null };
      const [v, sv, r] = await Promise.all([
        db().from("visits").select("id").eq("user_id", me).eq("quest_id", questId).limit(1),
        db().from("saved_places").select("quest_id").eq("user_id", me).eq("quest_id", questId).limit(1),
        db().from("reviews").select("*").eq("user_id", me).eq("quest_id", questId).maybeSingle(),
      ]);
      return {
        visited: (must(v, "visits") as unknown[]).length > 0,
        saved: (must(sv, "saved") as unknown[]).length > 0,
        review: must(r, "review") as Review | null,
      };
    },

    async getQuestReviews(questId) {
      const rows = must(await db().from("reviews").select("*").eq("quest_id", questId).order("rating", { ascending: false }).limit(30), "reviews") as Review[];
      return withMeta(rows, await myId());
    },

    async getFriendFeed() {
      const me = await requireId();
      const fr = must(
        await db().from("friends").select("user_id, friend_id").eq("status", "accepted").or(`user_id.eq.${me},friend_id.eq.${me}`),
        "friends",
      ) as { user_id: string; friend_id: string }[];
      const ids = [...new Set(fr.map((f) => (f.user_id === me ? f.friend_id : f.user_id)))];
      if (!ids.length) return [];
      const rows = must(await db().from("reviews").select("*").in("user_id", ids).order("created_at", { ascending: false }).limit(20), "feed") as Review[];
      return withMeta(rows, me);
    },

    async saveReview(questId, rating, note) {
      const me = await requireId();
      const quest = must(await db().from("quests").select("title,lat,lon").eq("id", questId).single(), "quest") as { title: string; lat: number; lon: number };
      const row = {
        user_id: me,
        quest_id: questId,
        place_name: quest.title,
        lat: quest.lat,
        lon: quest.lon,
        rating: Math.round(Math.min(10, Math.max(1, rating)) * 10) / 10,
        note: note.trim().slice(0, 600),
        source: "outbound" as const,
      };
      const existing = must(await db().from("reviews").select("id").eq("user_id", me).eq("quest_id", questId).maybeSingle(), "review") as { id: string } | null;
      const res = existing
        ? await db().from("reviews").update({ rating: row.rating, note: row.note }).eq("id", existing.id).select().single()
        : await db().from("reviews").insert(row).select().single();
      return must(res, "save review") as Review;
    },

    async deleteReview(reviewId) {
      must(await db().from("reviews").delete().eq("id", reviewId), "delete review");
    },

    async setSaved(questId, saved) {
      const me = await requireId();
      if (saved) must(await db().from("saved_places").upsert({ user_id: me, quest_id: questId }), "save place");
      else must(await db().from("saved_places").delete().eq("user_id", me).eq("quest_id", questId), "unsave place");
    },

    async setLiked(reviewId, liked) {
      const me = await requireId();
      if (liked) must(await db().from("review_likes").upsert({ review_id: reviewId, user_id: me }), "like");
      else must(await db().from("review_likes").delete().eq("review_id", reviewId).eq("user_id", me), "unlike");
    },

    async getComments(reviewId) {
      const rows = must(await db().from("review_comments").select("*").eq("review_id", reviewId).order("created_at"), "comments") as CommentWithAuthor[];
      const names = await displayNames(rows.map((r) => r.user_id));
      return rows.map((r) => ({ ...r, author: { id: r.user_id, display_name: names.get(r.user_id) ?? "Player" } }));
    },

    async addComment(reviewId, text) {
      const me = await requireId();
      const row = must(await db().from("review_comments").insert({ review_id: reviewId, user_id: me, text: text.trim().slice(0, 300) }).select().single(), "comment") as CommentWithAuthor;
      const names = await displayNames([me]);
      return { ...row, author: { id: me, display_name: names.get(me) ?? "You" } };
    },

    async deleteComment(commentId) {
      must(await db().from("review_comments").delete().eq("id", commentId), "delete comment");
    },

    async importReviews(items: ImportedReview[]) {
      const me = await requireId();
      const have = must(await db().from("reviews").select("place_name, visited_on").eq("user_id", me).eq("source", "google"), "imported") as { place_name: string; visited_on: string }[];
      const key = (n: string, d: string) => `${n}|${d}`;
      const seen = new Set(have.map((h) => key(h.place_name, h.visited_on)));
      const rows = items
        .filter((it) => it.name && !seen.has(key(it.name, it.date)))
        .map((it) => ({
          user_id: me,
          quest_id: null,
          place_name: it.name.slice(0, 200),
          place_address: it.address,
          lat: it.lat,
          lon: it.lon,
          rating: Math.round(Math.min(10, Math.max(1, it.stars * 2)) * 10) / 10,
          note: it.text.slice(0, 600),
          visited_on: it.date,
          source: "google" as const,
        }));
      if (rows.length) must(await db().from("reviews").insert(rows), "import reviews");
      return { imported: rows.length, skipped: items.length - rows.length };
    },

    // ---------- profile and privacy ----------
    async updatePrivacy(privacy) {
      const me = await requireId();
      return must(await db().from("profiles").update({ privacy }).eq("id", me).select(PROFILE_COLUMNS).single(), "privacy") as Profile;
    },

    async updateProfileExtras(extras) {
      const me = await requireId();
      const patch: Record<string, unknown> = {};
      if (extras.display_name !== undefined) patch.display_name = extras.display_name.trim().slice(0, 40) || null;
      if (extras.grad_year !== undefined) patch.grad_year = extras.grad_year;
      if (extras.bio !== undefined) patch.bio = extras.bio?.trim().slice(0, 160) || null;
      if (extras.banner !== undefined) patch.banner = extras.banner;
      return must(await db().from("profiles").update(patch).eq("id", me).select(PROFILE_COLUMNS).single(), "profile") as Profile;
    },

    async uploadAvatar(image) {
      const me = await requireId();
      const ext = image.type === "image/png" ? "png" : image.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${me}/avatar.${ext}`;
      const up = await db().storage.from("avatars").upload(path, image, { upsert: true, contentType: image.type, cacheControl: "3600" });
      if (up.error) throw new Error(up.error.message);
      const url = `${db().storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      return must(await db().from("profiles").update({ avatar_url: url }).eq("id", me).select(PROFILE_COLUMNS).single(), "avatar") as Profile;
    },

    async removeAvatar() {
      const me = await requireId();
      await db().storage.from("avatars").remove([`${me}/avatar.webp`, `${me}/avatar.jpg`, `${me}/avatar.png`]);
      return must(await db().from("profiles").update({ avatar_url: null }).eq("id", me).select(PROFILE_COLUMNS).single(), "avatar") as Profile;
    },

    async getNote(subjectId) {
      const me = await myId();
      if (!me) return "";
      const row = must(await db().from("user_notes").select("text").eq("owner_id", me).eq("subject_id", subjectId).maybeSingle(), "note") as { text: string } | null;
      return row?.text ?? "";
    },

    async setNote(subjectId, text) {
      const me = await requireId();
      const t = text.trim().slice(0, 500);
      if (!t) must(await db().from("user_notes").delete().eq("owner_id", me).eq("subject_id", subjectId), "note");
      else must(await db().from("user_notes").upsert({ owner_id: me, subject_id: subjectId, text: t, updated_at: new Date().toISOString() }), "note");
    },

    async signInWithGoogle() {
      // School-only: the signup trigger (handle_new_user) rejects any non-school email, and
      // `hd` asks Google to show school (Workspace) accounts first.
      const { error } = await db().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback?next=/`, queryParams: { prompt: "select_account" } },
      });
      if (error) throw new Error(error.message);
    },

    async updateDisplayName(name) {
      const me = await requireId();
      const display_name = name.trim().slice(0, 40) || null;
      return must(await db().from("profiles").update({ display_name }).eq("id", me).select(PROFILE_COLUMNS).single(), "name") as Profile;
    },
  };
}

let browserClient: SupabaseClient | null = null;
let serverClient: SupabaseClient | null = null;

function appClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  if (typeof window === "undefined") {
    // Server: public content only, no user session.
    return (serverClient ??= createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  }
  return (browserClient ??= createBrowserClient(url, key));
}

/** The app's service: clients are created on first use (never during build). */
export const supabaseService: DataService = createSupabaseService(appClient);
