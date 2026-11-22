// Live checks of the Supabase DataService against the real project. Skipped unless run
// on purpose, because it needs the project's env vars and signs in a demo account:
//
//   RUN_SUPABASE_TESTS=1 npx vitest run src/lib/data/supabase
//
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or _ANON_KEY), and
// DEMO_PASSWORD from .env.local or .env. Values are never printed. Everything it changes is
// put back (privacy, a hidden visit, squad membership). It does not call check_in, which
// would add a permanent visit.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { SUPABASE_DEMO_ACCOUNTS } from "./demo";
import { createSupabaseService } from "./index";

const RUN = Boolean(process.env.RUN_SUPABASE_TESTS);

function loadEnv(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in vars)) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return vars;
}

describe.skipIf(!RUN)("Supabase DataService (live)", () => {
  let client: SupabaseClient;
  const service = createSupabaseService(() => client);
  let password = "";

  beforeAll(() => {
    const env = loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !key && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      !env.DEMO_PASSWORD && "DEMO_PASSWORD",
    ].filter(Boolean);
    if (missing.length) throw new Error(`Missing in .env.local/.env: ${missing.join(", ")}`);
    password = env.DEMO_PASSWORD;
    client = createClient(url, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  });

  it("reads public content signed out", async () => {
    expect(await service.getCurrentUser()).toBeNull();
    const [schools, stations, quests, board] = await Promise.all([
      service.getSchools(),
      service.getStations(),
      service.getAllQuests(),
      service.getSchoolLeaderboard(),
    ]);
    expect(schools.length).toBeGreaterThan(5);
    expect(stations.length).toBeGreaterThan(5);
    expect(quests.length).toBeGreaterThan(0);
    expect(board.length).toBe(schools.length);
    const q = quests[0];
    expect(q).toHaveProperty("checkin_radius_m");
    expect(q).toHaveProperty("requires_qr");
    expect(q).not.toHaveProperty("qr_code"); // the code itself never reaches the app
    expect(await service.getQuest(q.id)).toMatchObject({ id: q.id });
    expect((await service.getQuests(q.station_id)).some((x) => x.id === q.id)).toBe(true);
    expect(await service.getStation(q.station_id)).toMatchObject({ id: q.station_id });
  });

  it("rejects a wrong password and an unsupported school", async () => {
    expect(await service.signIn(SUPABASE_DEMO_ACCOUNTS[0].id, "definitely-wrong")).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    const res = await service.signUp(`outbound-test-${Date.now()}@gmail.com`, "secret123");
    expect(res).toEqual({ ok: false, error: "unsupported_school" });
  });

  it("signs in a demo account and reads player data", async () => {
    const res = await service.signIn(SUPABASE_DEMO_ACCOUNTS[0].id, password);
    expect(res.ok).toBe(true);
    const me = await service.getCurrentUser();
    expect(me).toMatchObject({ email: SUPABASE_DEMO_ACCOUNTS[0].id, is_demo: true });
    await service.getPassport(me!.id);
    await service.getVisits(me!.id);
    await service.getMySquads();
    await service.getFriends();
  });

  it("updates privacy and puts it back", async () => {
    const me = (await service.getCurrentUser())!;
    const other = me.privacy === "public" ? "friends" : "public";
    expect((await service.updatePrivacy(other)).privacy).toBe(other);
    expect((await service.updatePrivacy(me.privacy)).privacy).toBe(me.privacy);
  });

  it("hides and unhides a visit, if the account has one", async () => {
    const me = (await service.getCurrentUser())!;
    const [visit] = await service.getVisits(me.id);
    if (!visit) return;
    await service.setVisitHidden(visit.id, !visit.hidden);
    await service.setVisitHidden(visit.id, visit.hidden);
    expect((await service.getVisits(me.id)).find((v) => v.id === visit.id)?.hidden).toBe(visit.hidden);
  });

  it("previews, joins, and leaves a squad by code", async () => {
    const { data: squads } = await client.from("squads").select("code").limit(5);
    const mine = new Set((await service.getMySquads()).map((s) => s.code));
    const code = squads?.map((s) => s.code as string).find((c) => !mine.has(c));
    if (!code) return; // nothing to join
    const preview = await service.getSquadByCode(code.toLowerCase());
    expect(preview?.code).toBe(code);
    const joined = await service.joinSquad(code);
    expect((await service.getMySquads()).some((s) => s.id === joined.id)).toBe(true);
    await service.leaveSquad(joined.id);
    expect((await service.getMySquads()).some((s) => s.id === joined.id)).toBe(false);
  });

  it("signs out", async () => {
    await service.signOut();
    expect(await service.getCurrentUser()).toBeNull();
  });
});
