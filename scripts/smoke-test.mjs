#!/usr/bin/env node
// Backend smoke test: checks every backend piece the app uses, without changing any data.
//
//   1. Start the app in another terminal:   npm run dev
//   2. Run:                                  node scripts/smoke-test.mjs
//      (or against the live site:            node scripts/smoke-test.mjs https://outbound-red.vercel.app)
//
// Reads .env.local for NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, DEMO_PASSWORD,
// TIGER_DATA_URL and NEXT_PUBLIC_OUT_MINT. Signs in as the BU demo player. Nothing is written:
// the XP check updates xp to the value it already has and expects the database to refuse.
// Prints PASS / WARN / FAIL per check and never prints a key or password.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const env = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const get = (k) => process.env[k] ?? env[k] ?? "";

const results = [];
function report(status, name, detail = "") {
  results.push(status);
  const tag = { PASS: "\x1b[32mPASS\x1b[0m", WARN: "\x1b[33mWARN\x1b[0m", FAIL: "\x1b[31mFAIL\x1b[0m" }[status];
  console.log(`${tag}  ${name}${detail ? `  ->  ${detail}` : ""}`);
}
async function check(name, fn) {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "warn" in r) report("WARN", name, r.warn);
    else report("PASS", name, r ?? "");
  } catch (e) {
    report("FAIL", name, e.message);
  }
}
async function json(path, init) {
  const res = await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${body?.error ?? ""}`.trim());
  return body;
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log(`\nOutbound backend smoke test against ${BASE}\n`);

// ---------- Live trains (MBTA) ----------
console.log("Live trains (MBTA, via /api/trains)");
await check("all trains", async () => {
  const j = await json("/api/trains");
  assert(j.trains?.length > 0, "no trains returned");
  const lines = [...new Set(j.trains.map((t) => t.line))].sort().join(", ");
  return `${j.trains.length} trains on ${lines}`;
});
await check("Kenmore next trains", async () => {
  const j = await json("/api/trains?stop=place-kencl");
  assert(Array.isArray(j.arrivals), "no arrivals list");
  if (!j.arrivals.length) return { warn: "0 arrivals (normal late at night)" };
  return `${j.arrivals.length} arrivals, next in ${j.arrivals[0].minutes} min`;
});

// ---------- Tiger Data ----------
console.log("\nTiger Data (tracker on Vultr -> Tiger Cloud -> /api/lateness)");
await check("lateness per line", async () => {
  const j = await json("/api/lateness");
  assert(j.lines?.length, "no lines");
  return j.lines.map((l) => `${l.badge} [${l.method}]`).join(" | ");
});
const tigerUrl = get("TIGER_DATA_URL");
if (!tigerUrl) report("WARN", "tracker freshness", "TIGER_DATA_URL not in .env.local, skipped");
else
  await check("tracker is writing (Vultr alive)", async () => {
    const { default: pg } = await import("pg");
    const caFile = readFileSync("src/lib/tiger-ca.ts", "utf8");
    const ca = caFile.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
    const conn = new URL(tigerUrl.replace(/^postgres(ql)?:/, "http:"));
    const client = new pg.Client({
      host: conn.hostname, port: Number(conn.port), user: decodeURIComponent(conn.username),
      password: decodeURIComponent(conn.password), database: conn.pathname.slice(1),
      ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true },
    });
    await client.connect();
    try {
      const { rows } = await client.query(`
        select extract(epoch from now() - max(time))::int as pos_age,
               (select extract(epoch from now() - max(time))::int from arrival_predictions) as pred_age,
               (select count(*) from train_positions where time > now() - interval '1 hour')::int as last_hour
        from train_positions`);
      const r = rows[0];
      assert(r.pos_age !== null, "no rows in train_positions");
      assert(r.pos_age < 180, `last train position is ${r.pos_age}s old: check Vultr (journalctl -u tracker -f)`);
      return `last position ${r.pos_age}s ago, last prediction ${r.pred_age}s ago, ${r.last_hour.toLocaleString()} rows in the last hour`;
    } finally {
      await client.end();
    }
  });

// ---------- AI ----------
console.log("\nAI (Gemini search, Grok guide)");
await check("Gemini search", async () => {
  const j = await json("/api/search?q=" + encodeURIComponent("cheap pizza under 10 dollars, 1 hour"));
  const f = j.filters ?? {};
  const summary = `craving=${f.craving} budget=${f.budget} minutes=${f.minutes} keywords=${(j.keywords ?? []).join("/")}`;
  if (j.source !== "gemini") return { warn: `used the keyword fallback, not Gemini (check GEMINI_API_KEY). ${summary}` };
  return `source=gemini ${summary}`;
});
await check("Guide: Grok + Report tool (text)", async () => {
  const j = await json("/api/guide?q=" + encodeURIComponent("cheap food near Kenmore, about an hour"));
  const r = j.report;
  assert(r?.title, "no structured report");
  const grok = (j.stages ?? []).find((s) => s.stage === "grok");
  const picks = (r.picks ?? []).map((q) => q.title).join(", ") || "none";
  if (j.source !== "pipeline" || grok?.status !== "done") return { warn: `used the fallback, not Grok (check XAI_API_KEY). picks: ${picks}` };
  const rep = (j.stages ?? []).find((s) => s.stage === "report");
  return `"${r.title}", picks: ${picks}, report tool: ${rep?.status ?? "?"}`;
});

await check("Mastra trip planner (/api/agent)", async () => {
  const res = await fetch(BASE + "/api/agent?q=" + encodeURIComponent("cheap food near Kenmore, I have an hour"), {
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 404) return { warn: "not on this branch yet" };
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${j?.error ?? ""}`);
  assert(j.reply, "no reply");
  return `tools used: ${(j.tools ?? []).join(", ") || "none"}; picks: ${(j.quests ?? []).map((q) => q.title).join(", ") || "none"}`;
});

// ---------- Share card + public quest page ----------
console.log("\nShare card and QR page");
await check("share card PNG", async () => {
  const res = await fetch(BASE + "/api/share-card/kenmore-citgo-angle", { signal: AbortSignal.timeout(30000) });
  assert(res.ok, `HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  assert(type.includes("image/png"), `content-type ${type}`);
  return `${(await res.arrayBuffer()).byteLength.toLocaleString()} bytes`;
});
await check("public quest page /q/<id>", async () => {
  const res = await fetch(BASE + "/q/kenmore-citgo-angle", { signal: AbortSignal.timeout(30000) });
  assert(res.ok, `HTTP ${res.status}`);
  const html = await res.text();
  assert(html.includes("Kenmore Sign Hunt"), "page doesn't show the quest title");
  return "shows Kenmore Sign Hunt";
});

// ---------- Supabase ----------
console.log("\nSupabase (database, sign-in, game logic, security)");
const sbUrl = get("NEXT_PUBLIC_SUPABASE_URL");
const sbKey = get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const demoPw = get("DEMO_PASSWORD");
let db = null;
let token = null;
let userId = null;
if (!sbUrl || !sbKey) report("FAIL", "Supabase config", "NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY missing in .env.local");
else {
  db = createClient(sbUrl, sbKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await check("content loaded", async () => {
    const [{ count: quests, error: e1 }, { count: stations, error: e2 }] = await Promise.all([
      db.from("quests").select("*", { count: "exact", head: true }),
      db.from("stations").select("*", { count: "exact", head: true }),
    ]);
    if (e1 || e2) throw new Error((e1 ?? e2).message);
    assert(quests > 0 && stations > 0, `quests=${quests} stations=${stations}`);
    return `${quests} quests, ${stations} stations`;
  });
  await check("school leaderboard", async () => {
    const { data, error } = await db.from("leaderboard_weekly").select("name, weekly_xp, players").limit(3);
    if (error) throw new Error(error.message);
    return data.map((r) => `${r.name} ${r.weekly_xp} XP`).join(" | ");
  });
  if (!demoPw) report("WARN", "demo sign-in", "DEMO_PASSWORD not in .env.local, signed-in checks skipped");
  else {
    await check("demo sign-in (outbound-demo1@bu.edu)", async () => {
      const { data, error } = await db.auth.signInWithPassword({ email: "outbound-demo1@bu.edu", password: demoPw });
      if (error) throw new Error(error.message);
      token = data.session.access_token;
      userId = data.user.id;
      return "signed in";
    });
  }
  if (userId) {
    await check("my profile", async () => {
      const { data, error } = await db.from("profiles").select("display_name, xp, school_id").eq("id", userId).single();
      if (error) throw new Error(error.message);
      return `${data.display_name}, ${data.xp} XP`;
    });
    await check("Quest of the Week", async () => {
      const { data, error } = await db.rpc("quest_of_the_week");
      if (error) throw new Error(error.message);
      const q = Array.isArray(data) ? data[0] : data;
      assert(q?.quest_id, "no featured quest");
      return `${q.quest_id}, week of ${q.week_start}, ${q.base_xp_multiplier}x XP`;
    });
    await check("badges and streak", async () => {
      const { data, error } = await db.rpc("my_game_progress");
      if (error) throw new Error(error.message);
      const earned = data?.badges ?? [];
      return `streak ${data?.current_streak ?? 0} (best ${data?.longest_streak ?? 0}), badges earned: ${earned.join(", ") || "none yet"}`;
    });
    await check("player leaderboard", async () => {
      const { data, error } = await db.from("leaderboard_players_weekly").select("*").limit(3);
      if (error) throw new Error(error.message);
      return `${data.length} rows, top: ${data.map((r) => r.display_name ?? r.name).join(", ")}`;
    });
    await check("my passport", async () => {
      const { data, error } = await db.from("passport").select("*").eq("user_id", userId);
      if (error) throw new Error(error.message);
      return `${data.length} neighborhood row(s)`;
    });
    await check("SECURITY: players can't set their own XP", async () => {
      const { data: me } = await db.from("profiles").select("xp").eq("id", userId).single();
      // Same value it already has, so nothing changes even if this were allowed.
      const { error } = await db.from("profiles").update({ xp: me.xp }).eq("id", userId);
      assert(error, "the update was allowed: players could mint XP (and OUT tokens). Re-run 005_gamification.sql");
      return "refused, as it should be";
    });
    await check("SECURITY: players can't write the rewards ledger", async () => {
      const { error } = await db.from("reward_events").insert({ user_id: userId, kind: "mint", amount: 1, wallet: "smoke-test", status: "failed" });
      assert(error, "insert into reward_events was allowed");
      return "refused, as it should be";
    });
  }
}

// ---------- Solana rewards ----------
console.log("\nSolana rewards (devnet)");
if (token)
  await check("rewards summary (/api/rewards)", async () => {
    const j = await json("/api/rewards", { headers: { Authorization: `Bearer ${token}` } });
    const s = j.summary ?? {};
    assert(j.mint, "NEXT_PUBLIC_OUT_MINT not set on the server");
    return `earned ${s.earned} OUT, minted ${s.minted}, claimable ${s.claimable}, redeemed ${s.redeemed}`;
  });
const mint = get("NEXT_PUBLIC_OUT_MINT");
if (mint)
  await check("OUT token exists on devnet", async () => {
    const res = await fetch("https://api.devnet.solana.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [mint] }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message);
    return `${j.result.value.uiAmountString} OUT in circulation`;
  });

if (db && userId) await db.auth.signOut().catch(() => {});

const fails = results.filter((r) => r === "FAIL").length;
const warns = results.filter((r) => r === "WARN").length;
console.log(`\n${results.length - fails - warns} passed, ${warns} warnings, ${fails} failed\n`);
process.exit(fails ? 1 : 0);
