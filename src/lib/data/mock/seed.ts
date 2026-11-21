// Mock seed data, shaped exactly like backend/supabase/schema.sql rows.
// Mirrors backend/supabase/schema.sql plus migration 002.
// Stations and quests are Suki's content (content/*.csv). Schools match the schema's starter
// rows; people, squads, visits, and deals are made up for the demo.

import type {
  Deal,
  DemoAccount,
  Friendship,
  Profile,
  Quest,
  School,
  Squad,
  Visit,
} from "../types";
import { quests as contentQuests, stations } from "./content";

// ---------- schools (same ids and order as the schema's starter inserts) ----------

export const schools: School[] = [
  { id: 1, name: "Boston University", email_domain: "bu.edu", color: "#CC0000" },
  { id: 2, name: "Northeastern", email_domain: "northeastern.edu", color: "#D41B2C" },
  { id: 3, name: "MIT", email_domain: "mit.edu", color: "#A31F34" },
  { id: 4, name: "Harvard", email_domain: "harvard.edu", color: "#A51C30" },
  { id: 5, name: "Tufts", email_domain: "tufts.edu", color: "#3E8EDE" },
  { id: 6, name: "Emerson", email_domain: "emerson.edu", color: "#6C2C91" },
  { id: 7, name: "Suffolk", email_domain: "suffolk.edu", color: "#1D4F91" },
  { id: 8, name: "Boston College", email_domain: "bc.edu", color: "#8A100B" },
  { id: 9, name: "UMass Boston", email_domain: "umb.edu", color: "#005A8B" },
  { id: 10, name: "Berklee", email_domain: "berklee.edu", color: "#000000" },
  { id: 11, name: "Wentworth", email_domain: "wit.edu", color: "#A6192E" },
  { id: 12, name: "Simmons", email_domain: "simmons.edu", color: "#003F6F" },
  { id: 13, name: "Mass College of Art", email_domain: "massart.edu", color: "#E4002B" },
];

// ---------- stations and quests ----------
// Real content from Suki, generated from content/*.csv (npm run content).

// Mock only: Bharath's expo quest from seed_quests_starter.sql, so QR check-in can be
// built and tested. Code "OUTBOUND-EXPO".
const EXPO_QUEST: Quest = {
  id: "bu-gsu-expo",
  station_id: "place-bucen",
  type: "event",
  title: "Find Outbound at the BostonHacks expo",
  description: "Scan the QR code at our table in the GSU Metcalf Ballroom.",
  lat: 42.3509,
  lon: -71.1089,
  price_tier: 0,
  vibe_tags: ["hackathon", "campus"],
  hours: "always",
  photo_url: null,
  xp: 100,
  checkin_radius_m: 150,
  qr_code: "OUTBOUND-EXPO",
  duration_min: 10,
  walk_min: 2,
};

export const quests: Quest[] = [...contentQuests, EXPO_QUEST];
export { stations };

/** Mock only: checking in here always fails as too far, so the error screen can be built. */
export const TOO_FAR_QUEST_ID = "frog-pond-lookout";

export const deals: Deal[] = [
  { id: 1, quest_id: "pavement-bu-bagel", text: "SAMPLE: 10% off with student ID", is_sample: true },
  { id: 2, quest_id: "chinatown-winsor-dim-sum", text: "SAMPLE: Free tea with any two plates", is_sample: true },
  { id: 3, quest_id: "thinking-cup-newbury", text: "SAMPLE: $1 off any drink before 10 am", is_sample: true },
];

// ---------- people ----------

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: "demo-maya", label: "Maya, Northeastern", blurb: "Full passport with a Gold neighborhood" },
  { id: "demo-sam", label: "Sam, BU", blurb: "Brand new, nothing collected yet" },
  { id: "demo-jordan", label: "Jordan, MIT", blurb: "In a cross-school squad" },
];

const CREATED = "2026-09-02T14:00:00.000Z";

const person = (
  id: string,
  displayName: string,
  handle: string,
  schoolId: number,
  privacy: Profile["privacy"] = "friends",
): Profile => ({
  id,
  email: `${handle}@${schools.find((s) => s.id === schoolId)!.email_domain}`,
  school_id: schoolId,
  display_name: displayName,
  avatar_url: null,
  xp: 0, // recomputed from visits in the mock service, with level and xp_to_next_level
  level: 1,
  xp_to_next_level: 250,
  privacy,
  is_demo: id.startsWith("demo-"),
  created_at: CREATED,
});

export const profiles: Profile[] = [
  // demo accounts
  person("demo-maya", "Maya", "maya.r", 2, "public"),
  person("demo-sam", "Sam", "samk", 1),
  person("demo-jordan", "Jordan", "jordanl", 3, "public"),
  // Boston University (6 with Sam)
  person("u-bu-1", "Priya", "priyas", 1, "public"),
  person("u-bu-2", "Marcus", "marcusb", 1),
  person("u-bu-3", "Elena", "elenav", 1, "public"),
  person("u-bu-4", "Theo", "theow", 1),
  person("u-bu-5", "Hana", "hanak", 1, "ghost"),
  // Northeastern (6 with Maya)
  person("u-neu-1", "Diego", "diego.m", 2, "public"),
  person("u-neu-2", "Aisha", "aisha.o", 2),
  person("u-neu-3", "Ben", "ben.c", 2, "public"),
  person("u-neu-4", "Lucy", "lucy.t", 2),
  person("u-neu-5", "Omar", "omar.h", 2),
  // MIT (5 with Jordan)
  person("u-mit-1", "Wen", "wenz", 3, "public"),
  person("u-mit-2", "Kofi", "kofia", 3),
  person("u-mit-3", "Sofia", "sofiag", 3, "public"),
  person("u-mit-4", "Raj", "rajp", 3),
  // Harvard (5)
  person("u-hvd-1", "Claire", "claire_d", 4, "public"),
  person("u-hvd-2", "Mateo", "mateo_r", 4),
  person("u-hvd-3", "Grace", "grace_l", 4),
  person("u-hvd-4", "Ivan", "ivan_p", 4, "public"),
  person("u-hvd-5", "Nia", "nia_j", 4),
  // Emerson (3: below the 5-player minimum)
  person("u-emr-1", "Jules", "jules.f", 6, "public"),
  person("u-emr-2", "Ruby", "ruby.s", 6),
  person("u-emr-3", "Felix", "felix.n", 6),
];

// ---------- squads ----------

export const squads: Squad[] = [
  { id: "sq-grazers", code: "A3F9C1", name: "Green Line Grazers", created_by: "demo-jordan", created_at: CREATED },
  { id: "sq-redline", code: "7B20E4", name: "Red Line Regulars", created_by: "u-mit-1", created_at: CREATED },
  { id: "sq-huskies", code: "D41C88", name: "Husky Hunters", created_by: "u-neu-1", created_at: CREATED },
  { id: "sq-terriers", code: "0E6A5F", name: "Terrier Treks", created_by: "u-bu-1", created_at: CREATED },
  { id: "sq-owls", code: "9C3D27", name: "Night Owls", created_by: "u-emr-1", created_at: CREATED },
];

export const squadMembers: { squad_id: string; user_id: string }[] = [
  // cross-school: MIT + NEU + BU
  ...["demo-jordan", "u-neu-3", "u-bu-3"].map((user_id) => ({ squad_id: "sq-grazers", user_id })),
  // cross-school: MIT + Harvard
  ...["u-mit-1", "u-mit-3", "u-hvd-1", "u-hvd-4"].map((user_id) => ({ squad_id: "sq-redline", user_id })),
  // single school: NEU
  ...["u-neu-1", "u-neu-2", "u-neu-4", "demo-maya"].map((user_id) => ({ squad_id: "sq-huskies", user_id })),
  // single school: BU
  ...["u-bu-1", "u-bu-2", "u-bu-4"].map((user_id) => ({ squad_id: "sq-terriers", user_id })),
  // cross-school: Emerson + BU + NEU
  ...["u-emr-1", "u-emr-2", "u-bu-5", "demo-maya"].map((user_id) => ({ squad_id: "sq-owls", user_id })),
];

export const friendships: Friendship[] = [
  { user_id: "demo-maya", friend_id: "u-neu-1", status: "accepted", created_at: CREATED },
  { user_id: "demo-maya", friend_id: "u-emr-1", status: "accepted", created_at: CREATED },
  { user_id: "u-bu-3", friend_id: "demo-maya", status: "accepted", created_at: CREATED },
  { user_id: "demo-jordan", friend_id: "u-neu-3", status: "accepted", created_at: CREATED },
  { user_id: "demo-jordan", friend_id: "u-hvd-1", status: "pending", created_at: CREATED },
];

// ---------- visits ----------
// Timestamps are relative to "now" so the weekly leaderboard always has data.

type VisitSeed = Pick<Visit, "user_id" | "quest_id"> &
  Partial<Pick<Visit, "squad_id" | "cross_school" | "hidden">> & { daysAgo: number };

const visitSeeds: VisitSeed[] = [
  // Maya: Gold in Fenway–Kenmore (6), Silver in Chinatown (3), Bronze in Harvard Square
  { user_id: "demo-maya", quest_id: "kenmore-citgo-angle", daysAgo: 30 },
  { user_id: "demo-maya", quest_id: "marsh-plaza-details", daysAgo: 26 },
  { user_id: "demo-maya", quest_id: "pavement-bu-bagel", daysAgo: 21 },
  { user_id: "demo-maya", quest_id: "bu-beach-river-view", daysAgo: 15 },
  { user_id: "demo-maya", quest_id: "tatte-fenway-pastry", daysAgo: 9 },
  { user_id: "demo-maya", quest_id: "fenway-scoreboard-street", daysAgo: 0, squad_id: "sq-owls", cross_school: true },
  { user_id: "demo-maya", quest_id: "chinatown-gate-details", daysAgo: 12 },
  { user_id: "demo-maya", quest_id: "chinatown-chin-park", daysAgo: 12 },
  { user_id: "demo-maya", quest_id: "chinatown-winsor-dim-sum", daysAgo: 0, hidden: true },
  { user_id: "demo-maya", quest_id: "harvard-art-courtyard", daysAgo: 5 },
  { user_id: "u-emr-1", quest_id: "fenway-scoreboard-street", daysAgo: 0, squad_id: "sq-owls", cross_school: true },

  // Jordan: cross-school squad visits with the Grazers
  { user_id: "demo-jordan", quest_id: "copley-courtyard", daysAgo: 0, squad_id: "sq-grazers", cross_school: true },
  { user_id: "u-neu-3", quest_id: "copley-courtyard", daysAgo: 0, squad_id: "sq-grazers", cross_school: true },
  { user_id: "demo-jordan", quest_id: "central-graffiti-alley", daysAgo: 4 },
  { user_id: "demo-jordan", quest_id: "kenmore-citgo-angle", daysAgo: 0 },
];

// Everyone else: one or two visits this week, picked deterministically.
const fillers = profiles.filter(
  (p) => !p.id.startsWith("demo-") && !visitSeeds.some((v) => v.user_id === p.id && v.daysAgo === 0),
);
fillers.forEach((p, i) => {
  visitSeeds.push({ user_id: p.id, quest_id: quests[(i * 7) % quests.length].id, daysAgo: 0 });
  if (i % 2 === 0) visitSeeds.push({ user_id: p.id, quest_id: quests[(i * 7 + 3) % quests.length].id, daysAgo: 0 });
});

/** Builds visit rows. `now` and `weekStart` come from the mock service clock. */
export function buildVisits(now: Date, weekStart: Date): Visit[] {
  const questById = new Map(quests.map((q) => [q.id, q]));
  return visitSeeds.map((v, i) => {
    // "This week" visits stay after weekStart even if the app loads early on a Monday.
    const offsetMs = v.daysAgo === 0 ? (i % 12) * 20 * 60_000 : v.daysAgo * 86_400_000;
    const at = new Date(Math.max(now.getTime() - offsetMs, v.daysAgo === 0 ? weekStart.getTime() + 60_000 : 0));
    return {
      id: i + 1,
      user_id: v.user_id,
      quest_id: v.quest_id,
      squad_id: v.squad_id ?? null,
      checked_in_at: at.toISOString(),
      visit_date: nyDate(at),
      xp_awarded: questById.get(v.quest_id)!.xp + 25, // placeholder; real XP comes from check_in()
      cross_school: v.cross_school ?? false,
      hidden: v.hidden ?? false,
    };
  });
}

/** YYYY-MM-DD in America/New_York, matching visits.visit_date. */
export function nyDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}
