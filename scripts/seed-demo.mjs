// Creates demo players so the leaderboard, passports and squads have data for judging.
//
//   node scripts/seed-demo.mjs           create / refresh demo players (safe to re-run)
//   node scripts/seed-demo.mjs --delete  remove every demo player and their visits
//
// Reads from .env.local (never commit these):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SECRET_KEY   Supabase > Project Settings > API Keys > secret key. Server-only.
//   DEMO_PASSWORD         password for the 4 team demo logins (8+ characters)
//
// Makes:
//   - 4 team logins you can sign in with during the demo (no visits yet, so you can show progress live):
//       outbound-demo1@bu.edu, outbound-demo2@northeastern.edu, outbound-demo3@mit.edu, outbound-demo4@harvard.edu
//     They're marked is_demo, so they can check in without being at the spot.
//   - 27 "players" across 6 schools with check-ins spread over this week, so 4 schools reach the
//     5-player minimum and the leaderboard has a real race. They can't log in (random passwords).
// All demo emails start with "outbound-", which is how --delete finds them.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const TEAM = [
  ["outbound-demo1@bu.edu", "Demo BU"],
  ["outbound-demo2@northeastern.edu", "Demo NEU"],
  ["outbound-demo3@mit.edu", "Demo MIT"],
  ["outbound-demo4@harvard.edu", "Demo Harvard"],
];
const PLAYERS = {
  "bu.edu": ["Maya", "Jordan", "Priya", "Leo", "Ava", "Sam"],
  "northeastern.edu": ["Nina", "Omar", "Chloe", "Ethan", "Grace", "Ravi"],
  "mit.edu": ["Kai", "Lena", "Arjun", "Zoe", "Felix"],
  "harvard.edu": ["Isla", "Marcus", "Sofia", "Theo", "Hana"],
  "tufts.edu": ["Ben", "Ruby", "Yusuf"],
  "emerson.edu": ["Ivy", "Dante"],
};

// Seeded random so re-runs give the same data.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n);

async function allDemoUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    out.push(...data.users.filter((u) => u.email?.startsWith("outbound-")));
    if (data.users.length < 200) return out;
  }
}

async function ensureUser(email, password) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (!error) return data.user;
  if (!/already|registered|exists/i.test(error.message)) throw new Error(`${email}: ${error.message}`);
  const found = (await allDemoUsers()).find((u) => u.email === email);
  if (!found) throw new Error(`${email}: exists but not found`);
  if (password) await db.auth.admin.updateUserById(found.id, { password });
  return found;
}

const nyDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

async function main() {
  if (process.argv.includes("--delete")) {
    const users = await allDemoUsers();
    for (const u of users) await db.auth.admin.deleteUser(u.id);
    console.log(`Deleted ${users.length} demo users (their profiles and visits go with them).`);
    return;
  }
  const pw = process.env.DEMO_PASSWORD;
  if (!pw || pw.length < 8) throw new Error("Set DEMO_PASSWORD (8+ characters) in .env.local");

  const { data: quests, error: qe } = await db.from("quests").select("id, xp");
  if (qe) throw qe;
  if (!quests.length) throw new Error("No quests yet. Run seed_quests_starter.sql first.");

  for (const [email, name] of TEAM) {
    const u = await ensureUser(email, pw);
    const { error } = await db.from("profiles").update({ display_name: name, is_demo: true, privacy: "public" }).eq("id", u.id);
    if (error) throw error;
  }
  console.log(`Team logins ready: ${TEAM.map((t) => t[0]).join(", ")}`);

  // Spread visits from Monday 00:00 (Boston) until now.
  const now = Date.now();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const daysSinceMonday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const spanMs = Math.max(1, daysSinceMonday) * 24 * 3600 * 1000;

  let players = 0, visits = 0;
  for (const [domain, names] of Object.entries(PLAYERS)) {
    for (const name of names) {
      const email = `outbound-${name.toLowerCase()}@${domain}`;
      const u = await ensureUser(email, randomBytes(24).toString("base64url"));
      const rows = pick(quests, 2 + Math.floor(rand() * 7)).map((q) => {
        const at = new Date(now - Math.floor(rand() * spanMs));
        return {
          user_id: u.id, quest_id: q.id, checked_in_at: at.toISOString(), visit_date: nyDate(at),
          xp_awarded: q.xp + 25, cross_school: rand() < 0.15,
        };
      });
      const { error: ve } = await db.from("visits").upsert(rows, { onConflict: "user_id,quest_id,visit_date", ignoreDuplicates: true });
      if (ve) throw ve;
      const { data: mine, error: se } = await db.from("visits").select("xp_awarded").eq("user_id", u.id);
      if (se) throw se;
      const xp = mine.reduce((s, v) => s + v.xp_awarded, 0);
      const { error: pe } = await db.from("profiles").update({ display_name: name, is_demo: true, privacy: "public", xp }).eq("id", u.id);
      if (pe) throw pe;
      players++; visits += mine.length;
    }
  }
  console.log(`${players} demo players with ${visits} check-ins this week.`);
  const { data: lb } = await db.from("leaderboard_weekly").select("name, weekly_xp, players, eligible").limit(6);
  console.table(lb);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
