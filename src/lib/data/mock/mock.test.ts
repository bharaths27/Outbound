// The mock service and seed. Tests in this file share one in-memory state and run in order.
import { describe, expect, it } from "vitest";
import { mockService as data } from ".";
import * as seed from "./seed";

describe("seed", () => {
  it("is internally consistent", () => {
    const stationIds = new Set(seed.stations.map((s) => s.id));
    expect(new Set(seed.quests.map((q) => q.id)).size).toBe(seed.quests.length);
    for (const q of seed.quests) expect(stationIds.has(q.station_id)).toBe(true);
    expect(seed.profiles).toHaveLength(25);
    expect(seed.quests.some((q) => q.id === seed.TOO_FAR_QUEST_ID)).toBe(true);
  });

  it("has at most one visit per user, quest, and day (schema unique constraint)", () => {
    const now = new Date();
    const visits = seed.buildVisits(now, new Date(now.getTime() - 7 * 86_400_000));
    const keys = visits.map((v) => `${v.user_id}|${v.quest_id}|${v.visit_date}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("mock service", () => {
  it("computes levels like the generated columns (250 XP per level)", async () => {
    const maya = await data.signInDemo("demo-maya");
    expect(maya.is_demo).toBe(true);
    expect(maya.level).toBe(Math.floor(maya.xp / 250) + 1);
    expect(maya.xp_to_next_level).toBe(250 - (maya.xp % 250));
  });

  it("filters by time available using walk and visit times", async () => {
    const all = await data.getQuests("place-kencl");
    const quick = await data.getQuests("place-kencl", { craving: "any", budget: null, minutes: 30 });
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.length).toBeLessThan(all.length);
    expect(quick.every((q) => 2 * q.walk_min + q.duration_min <= 30)).toBe(true);
  });

  it("gates sign-up by school email domain, including subdomains", async () => {
    expect(await data.signUp("x@gmail.com", "secret123")).toEqual({ ok: false, error: "unsupported_school" });
    expect(await data.signUp("x@husky.northeastern.edu", "short")).toEqual({ ok: false, error: "weak_password" });
    const made = await data.signUp("X@husky.northeastern.edu", "secret123");
    expect(made).toMatchObject({ ok: true, profile: { email: "x@husky.northeastern.edu", school_id: 2, display_name: null } });
    expect(await data.signUp("x@husky.northeastern.edu", "secret123")).toEqual({ ok: false, error: "already_registered" });
    expect(await data.signIn("nobody@bu.edu", "secret123")).toEqual({ ok: false, error: "invalid_credentials" });
    expect(await data.signIn("x@husky.northeastern.edu", "anything")).toMatchObject({ ok: true });
    expect((await data.getCurrentUser())?.email).toBe("x@husky.northeastern.edu");
  });

  it("ranks only schools with 5+ active players this week", async () => {
    const board = await data.getSchoolLeaderboard();
    const eligible = board.filter((r) => r.eligible).map((r) => r.name);
    expect(new Set(eligible)).toEqual(new Set(["Boston University", "Northeastern", "MIT", "Harvard"]));
    expect(board.find((r) => r.name === "Emerson")).toMatchObject({ players: 3, eligible: false });
  });

  it("gives Maya a Gold and a Silver neighborhood", async () => {
    await data.signInDemo("demo-maya");
    const passport = await data.getPassport("demo-maya");
    expect(passport.find((n) => n.neighborhood === "Fenway–Kenmore")).toMatchObject({
      tier: "gold",
      has_cross_school_stamp: true,
      next_tier: null,
      quests_to_next_tier: 0,
    });
    expect(passport.find((n) => n.neighborhood === "Chinatown")).toMatchObject({
      tier: "silver",
      next_tier: "gold",
      quests_to_next_tier: 2,
    });
  });

  it("starts Sam empty and runs every check-in path", async () => {
    await data.signInDemo("demo-sam");
    expect(await data.getPassport("demo-sam")).toEqual([]);
    expect(await data.getMySquads()).toEqual([]);

    // Demo accounts (is_demo) may check in with no location, as in migration 002.
    const ok = await data.checkIn("harvard-yard-gate", null);
    expect(ok).toMatchObject({
      ok: true,
      result: {
        xp_awarded: 100,
        xp_breakdown: [
          { reason: "base", xp: 50 },
          { reason: "first_visit", xp: 25 },
          { reason: "new_neighborhood", xp: 25 },
        ],
        first_visit: true,
        new_neighborhood: true,
        neighborhood: "Harvard Square",
        tier: "bronze",
        next_tier: "silver",
        quests_to_next_tier: 2,
        total_xp: 100,
        level: 1,
        xp_to_next_level: 150,
      },
    });

    const again = await data.checkIn("harvard-yard-gate", null);
    expect(again).toMatchObject({ ok: false, error: { code: "ALREADY_CHECKED_IN_TODAY" } });

    const far = await data.checkIn(seed.TOO_FAR_QUEST_ID, null);
    expect(far).toMatchObject({ ok: false, error: { code: "TOO_FAR", distanceM: 320, radiusM: 75 } });

    expect(await data.checkIn("nope", null)).toMatchObject({ ok: false, error: { code: "QUEST_NOT_FOUND" } });
    expect(await data.checkIn("harvard-art-courtyard", null, { squadId: "sq-grazers" })).toMatchObject({
      ok: false,
      error: { code: "NOT_IN_SQUAD" },
    });
  });

  it("creates and joins squads by code, case-insensitively", async () => {
    await data.signInDemo("demo-jordan");
    const grazers = (await data.getMySquads()).find((s) => s.id === "sq-grazers")!;
    expect(new Set(grazers.members.map((m) => m.school_id)).size).toBe(3);
    expect(grazers.members.find((m) => m.user_id === "demo-jordan")).toMatchObject({
      squad_id: "sq-grazers",
      school_name: "MIT",
      school_color: "#A31F34",
    });

    const created = await data.createSquad("Test squad");
    expect(created.code).toHaveLength(6);
    await data.signInDemo("demo-sam");
    expect((await data.joinSquad(created.code.toLowerCase())).members).toHaveLength(2);
  });

  it("checks event codes like check_in(): exact match, no location needed", async () => {
    await data.signInDemo("demo-jordan");
    expect(await data.checkIn("bu-gsu-expo", null, { qr: "WRONG" })).toMatchObject({ ok: false, error: { code: "QR_MISMATCH" } });
    expect(await data.checkIn("bu-gsu-expo", null, { qr: "OUTBOUND-EXPO" })).toMatchObject({ ok: true });
  });

  it("searches within a station using the fallback parser", async () => {
    const { filters, quests } = await data.searchQuests("dumplings under $20", "place-chncl");
    expect(filters).toEqual({ craving: "dumplings", budget: 2, minutes: null });
    expect(quests.map((q) => q.id)).toEqual(["chinatown-winsor-dim-sum"]);
  });

  it("rejects check-ins after sign-out", async () => {
    await data.signOut();
    expect(await data.getCurrentUser()).toBeNull();
    expect(await data.checkIn("harvard-art-courtyard", null)).toMatchObject({ ok: false, error: { code: "NOT_SIGNED_IN" } });
  });
});
