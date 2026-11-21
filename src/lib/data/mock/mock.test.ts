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
  it("gates sign-up by school email domain, including subdomains", async () => {
    expect(await data.signInWithEmail("x@husky.northeastern.edu")).toEqual({ ok: true });
    expect(await data.signInWithEmail("x@gmail.com")).toEqual({ ok: false, error: "unsupported_school" });
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
    expect(passport.find((n) => n.neighborhood === "Fenway-Kenmore")).toMatchObject({ tier: "gold", has_cross_school_stamp: true });
    expect(passport.find((n) => n.neighborhood === "Chinatown")?.tier).toBe("silver");
  });

  it("starts Sam empty and runs every check-in path", async () => {
    await data.signInDemo("demo-sam");
    expect(await data.getPassport("demo-sam")).toEqual([]);
    expect(await data.getMySquads()).toEqual([]);

    const ok = await data.checkIn("harsq-yard-scenic", null);
    expect(ok).toMatchObject({ ok: true, result: { first_visit: true, new_neighborhood: true, tier: "bronze", neighborhood: "Harvard Square" } });

    const again = await data.checkIn("harsq-yard-scenic", null);
    expect(again).toMatchObject({ ok: false, error: { code: "already_today" } });

    const far = await data.checkIn(seed.TOO_FAR_QUEST_ID, null);
    expect(far).toMatchObject({ ok: false, error: { code: "too_far", distanceM: 320, radiusM: 75 } });

    expect(await data.checkIn("nope", null)).toMatchObject({ ok: false, error: { code: "quest_not_found" } });
    expect(await data.checkIn("harsq-books-event", null, { squadId: "sq-grazers" })).toMatchObject({
      ok: false,
      error: { code: "not_in_squad" },
    });
  });

  it("creates and joins squads by code, case-insensitively", async () => {
    await data.signInDemo("demo-jordan");
    const grazers = (await data.getMySquads()).find((s) => s.id === "sq-grazers")!;
    expect(new Set(grazers.members.map((m) => m.school_id)).size).toBe(3);

    const created = await data.createSquad("Test squad");
    expect(created.code).toHaveLength(6);
    await data.signInDemo("demo-sam");
    expect((await data.joinSquad(created.code.toLowerCase())).members).toHaveLength(2);
  });

  it("searches within a station using the fallback parser", async () => {
    const { filters, quests } = await data.searchQuests("cheap spicy food", "place-chncl");
    expect(filters).toEqual({ craving: "spicy", budget: 1, minutes: null });
    expect(quests.map((q) => q.id)).toEqual(["chncl-noodle-food"]);
  });

  it("rejects check-ins after sign-out", async () => {
    await data.signOut();
    expect(await data.getCurrentUser()).toBeNull();
    expect(await data.checkIn("harsq-books-event", null)).toMatchObject({ ok: false, error: { code: "not_signed_in" } });
  });
});
