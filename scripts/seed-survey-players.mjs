// Creates 60 SIMULATED players modeled on our "How do you explore Boston?" survey (25 students,
// Nov 21 2026), so the leaderboard, passports and map have realistic activity for judging.
// These are not real users. Say "simulated players based on our survey" in the pitch.
//
//   node scripts/seed-survey-players.mjs             create / refresh the 60 players (safe to re-run)
//   node scripts/seed-survey-players.mjs --dry-run   print the simulated players and stats, touch nothing
//   node scripts/seed-survey-players.mjs --delete    remove only these simulated players
//
// Reads from .env.local (never commit these): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.
// Emails look like outbound-sim-07@bu.edu, so `node scripts/seed-demo.mjs --delete` removes them too.
//
// How each survey answer drives a player:
//   "How often do you take the T (not class/work)?"  -> check-ins this week
//   "How many neighborhoods have you spent time in?" -> how many neighborhoods their check-ins cover
//   "Hung out with students from another school?"    -> chance a check-in earns the cross-school bonus
//   "Would you use the app? (1-5)"                   -> chance they're active at all this week
//   "Would a school leaderboard make you go out more?" -> Yes adds an extra check-in
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// The 25 anonymous responses: [school, T frequency, neighborhoods, cross-school, app interest 1-5, leaderboard]
const SURVEY = [
  ["Northeastern", "Almost every day", "3-5", "Once or twice", 5, "Yes"],
  ["BU", "Almost every day", "0-2", "Once or twice", 5, "Yes"],
  ["BU", "Almost every day", "3-5", "Sometimes", 5, "Maybe"],
  ["BU", "Every week", "3-5", "Once or twice", 4, "No"],
  ["BU", "Every week", "6-10", "Sometimes", 3, "Yes"],
  ["BU", "Every week", "3-5", "Sometimes", 4, "No"],
  ["BU", "Almost every day", "0-2", "Often", 5, "Yes"],
  ["BU", "A few times a month", "3-5", "Often", 3, "Yes"],
  ["BU", "Every week", "0-2", "Never", 2, "No"],
  ["BU", "Once a month", "3-5", "Once or twice", 2, "Maybe"],
  ["BU", "Every week", "6-10", "Once or twice", 4, "Maybe"],
  ["BU", "Every week", "10+", "Sometimes", 4, "Yes"],
  ["BU", "Once a month", "3-5", "Often", 4, "Yes"],
  ["BU", "Every week", "3-5", "Sometimes", 4, "Maybe"],
  ["BU", "Almost every day", "3-5", "Once or twice", 3, "No"],
  ["Northeastern", "Every week", "3-5", "Sometimes", 1, "No"],
  ["BC", "A few times a month", "3-5", "Often", 3, "Yes"],
  ["BU", "Every week", "0-2", "Once or twice", 3, "Maybe"],
  ["BU", "Almost every day", "3-5", "Never", 1, "Yes"],
  ["BU", "A few times a month", "10+", "Sometimes", 3, "Maybe"],
  ["BU", "A few times a month", "6-10", "Sometimes", 4, "Yes"],
  ["Northeastern", "Almost every day", "3-5", "Sometimes", 4, "Maybe"],
  ["Northeastern", "Every week", "6-10", "Once or twice", 3, "Yes"],
  ["BU", "Every week", "3-5", "Once or twice", 3, "Maybe"],
  ["BU", "Almost every day", "3-5", "Sometimes", 5, "Yes"],
];
const DOMAIN = { BU: "bu.edu", Northeastern: "northeastern.edu", BC: "bc.edu" };
const CHECKINS = { "Almost every day": [4, 7], "Every week": [2, 4], "A few times a month": [1, 2], "Once a month": [0, 1] };
const HOODS = { "0-2": [1, 2], "3-5": [2, 4], "6-10": [3, 6], "10+": [5, 8] };
const CROSS = { Never: 0, "Once or twice": 0.08, Sometimes: 0.18, Often: 0.35 };
const NAMES = [
  "Alex", "Bri", "Cam", "Dani", "Eli", "Fern", "Gabe", "Hailey", "Ian", "Jules", "Kira", "Luis", "Mina", "Noah",
  "Olive", "Pablo", "Quinn", "Rosa", "Sean", "Tara", "Uma", "Vik", "Wes", "Xena", "Yara", "Zack", "Amir", "Bea",
  "Cole", "Dev", "Emma", "Finn", "Gia", "Hugo", "Iris", "Jay", "Kofi", "Lily", "Max", "Nadia", "Owen", "Pia",
  "Raj", "Sara", "Tom", "Val", "Will", "Yuki", "Zara", "Ana", "Ben", "Cleo", "Drew", "Esme", "Femi", "Gwen",
  "Hank", "Ines", "Jon", "Kat",
];
const COUNT = 60;

// Seeded random so re-runs give the same players.
let seed = 2026;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const between = ([lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));
const shuffle = (arr) => [...arr].sort(() => rand() - 0.5);

// Bootstrap: each simulated player copies one real response, with a little noise in the numbers.
export function simulatePlayers() {
  return Array.from({ length: COUNT }, (_, i) => {
    const [school, freq, hoods, cross, interest, leaderboard] = SURVEY[Math.floor(rand() * SURVEY.length)];
    const active = rand() < interest / 5;
    const checkins = active ? Math.max(1, between(CHECKINS[freq]) + (leaderboard === "Yes" ? 1 : 0)) : 0;
    const r = rand();
    return {
      n: i + 1,
      name: NAMES[i % NAMES.length],
      school, domain: DOMAIN[school],
      email: `outbound-sim-${String(i + 1).padStart(2, "0")}@${DOMAIN[school]}`,
      checkins, hoods: between(HOODS[hoods]), crossRate: CROSS[cross],
      privacy: r < 0.7 ? "public" : r < 0.95 ? "friends" : "ghost",
      basedOn: `${freq} / ${hoods} hoods / interest ${interest}`,
    };
  });
}

function summary(players) {
  const bySchool = {};
  for (const p of players) {
    const s = (bySchool[p.school] ??= { school: p.school, players: 0, active: 0, checkins: 0 });
    s.players++; if (p.checkins) s.active++; s.checkins += p.checkins;
  }
  console.table(Object.values(bySchool));
  const active = players.filter((p) => p.checkins);
  console.log(`${active.length}/${players.length} active this week, ${active.reduce((s, p) => s + p.checkins, 0)} check-ins total.`);
}

// ---------- database part ----------
function loadEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const players = simulatePlayers();
  if (process.argv.includes("--dry-run")) {
    console.table(players.map(({ email, name, checkins, hoods, privacy, basedOn }) => ({ email, name, checkins, hoods, privacy, basedOn })));
    summary(players);
    return;
  }

  loadEnv();
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SECRET_KEY;
  if (!URL || !KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const simUsers = async () => {
    const out = [];
    for (let page = 1; ; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      out.push(...data.users.filter((u) => u.email?.startsWith("outbound-sim-")));
      if (data.users.length < 200) return out;
    }
  };

  if (process.argv.includes("--delete")) {
    const users = await simUsers();
    for (const u of users) await db.auth.admin.deleteUser(u.id);
    console.log(`Deleted ${users.length} simulated players (their profiles and visits go with them).`);
    return;
  }

  const { data: quests, error: qe } = await db.from("quests").select("id, xp, stations(neighborhood)");
  if (qe) throw qe;
  if (!quests.length) throw new Error("No quests yet. Run seed_quests_starter.sql first.");
  const byHood = {};
  for (const q of quests) (byHood[q.stations?.neighborhood ?? "Boston"] ??= []).push(q);
  const hoodNames = Object.keys(byHood);

  const existing = new Map((await simUsers()).map((u) => [u.email, u]));
  const now = Date.now();
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  const days = Math.max(1, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday));
  const nyDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);

  let visits = 0;
  for (const p of players) {
    let u = existing.get(p.email);
    if (!u) {
      const { data, error } = await db.auth.admin.createUser({
        email: p.email, password: randomBytes(24).toString("base64url"), email_confirm: true,
      });
      if (error) throw new Error(`${p.email}: ${error.message}`);
      u = data.user;
    }
    // Their check-ins stay inside a few "home" neighborhoods, like the survey says.
    const home = shuffle(hoodNames).slice(0, p.hoods);
    const pool = home.flatMap((h) => byHood[h]);
    const rows = shuffle(pool).slice(0, p.checkins).map((q, i) => {
      // Mostly afternoons and evenings, spread over this week.
      const day = Math.floor(rand() * days);
      const at = new Date(now - day * 864e5 - (i === 0 && day === 0 ? 0 : between([1, 9]) * 36e5));
      const cross = rand() < p.crossRate;
      return {
        user_id: u.id, quest_id: q.id, checked_in_at: at.toISOString(), visit_date: nyDate(at),
        xp_awarded: (q.xp + 25) * (cross ? 2 : 1), cross_school: cross, hidden: false,
      };
    });
    if (rows.length) {
      const { error: ve } = await db.from("visits").upsert(rows, { onConflict: "user_id,quest_id,visit_date", ignoreDuplicates: true });
      if (ve) throw ve;
    }
    const { data: mine, error: se } = await db.from("visits").select("xp_awarded").eq("user_id", u.id);
    if (se) throw se;
    const xp = mine.reduce((s, v) => s + v.xp_awarded, 0);
    const { error: pe } = await db.from("profiles")
      .update({ display_name: `${p.name} (sim)`, is_demo: true, privacy: p.privacy, xp })
      .eq("id", u.id);
    if (pe) throw pe;
    visits += mine.length;
  }
  summary(players);
  console.log(`Saved ${players.length} simulated players with ${visits} check-ins.`);
  const { data: lb } = await db.from("leaderboard_weekly").select("name, weekly_xp, players, eligible").limit(8);
  console.table(lb);
}

if (process.argv[1]?.endsWith("seed-survey-players.mjs")) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
