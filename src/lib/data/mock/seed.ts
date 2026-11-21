// Mock seed data, shaped exactly like backend/supabase/schema.sql rows.
// PLACEHOLDER CONTENT: stations use real MBTA parent stop IDs, but quest details (prices,
// hours, XP) are unverified stand-ins until Person 4's content JSON arrives.

import type {
  Deal,
  Friendship,
  Profile,
  Quest,
  School,
  Squad,
  Station,
  Visit,
} from "../types";

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

// ---------- stations ----------

export const stations: Station[] = [
  {
    id: "place-kencl", name: "Kenmore", lines: ["Green-B", "Green-C", "Green-D"],
    lat: 42.3489, lon: -71.0950, neighborhood: "Fenway-Kenmore",
    story: "The Citgo sign has watched over Kenmore Square since 1965. On game nights the square fills with fans heading to Fenway Park, a short walk away.",
  },
  {
    id: "place-pktrm", name: "Park Street", lines: ["Red", "Green-B", "Green-C", "Green-D", "Green-E"],
    lat: 42.3564, lon: -71.0624, neighborhood: "Downtown",
    story: "Park Street opened in 1897 as part of the first subway in America. It sits on the edge of the Boston Common, where the Freedom Trail begins.",
  },
  {
    id: "place-harsq", name: "Harvard", lines: ["Red"],
    lat: 42.3734, lon: -71.1189, neighborhood: "Harvard Square",
    story: "Harvard Square mixes bookstores, street performers, and late-night food around the gates of Harvard Yard.",
  },
  {
    id: "place-cntsq", name: "Central", lines: ["Red"],
    lat: 42.3655, lon: -71.1038, neighborhood: "Central Square",
    story: "Central Square is Cambridge's music and food hub, with live shows most nights and a painted alley that changes every week.",
  },
  {
    id: "place-chncl", name: "Chinatown", lines: ["Orange"],
    lat: 42.3525, lon: -71.0628, neighborhood: "Chinatown",
    story: "Boston's Chinatown is packed into a few dense blocks of bakeries, noodle shops, and hot pot spots, marked by the gate on Beach Street.",
  },
  {
    id: "place-haecl", name: "Haymarket", lines: ["Orange", "Green-D", "Green-E"],
    lat: 42.3630, lon: -71.0583, neighborhood: "North End",
    story: "Haymarket's open-air produce market runs on Fridays and Saturdays. Cross the Greenway and you're in the North End.",
  },
  {
    id: "place-coecl", name: "Copley", lines: ["Green-B", "Green-C", "Green-D", "Green-E"],
    lat: 42.3500, lon: -71.0775, neighborhood: "Back Bay",
    story: "Copley Square puts the Boston Public Library and Trinity Church face to face, a block from the shops on Newbury Street.",
  },
];

// ---------- quests ----------

type QuestSeed = Omit<Quest, "description" | "photo_url"> & { description: string };

const quest = (q: QuestSeed): Quest => ({ ...q, photo_url: null });

export const quests: Quest[] = [
  // Kenmore: 7 quests, so a Gold neighborhood (5+) is reachable
  quest({ id: "kenmore-citgo-scenic", station_id: "place-kencl", type: "scenic", title: "See the Citgo sign light up", description: "Stand in Kenmore Square after dark and catch the sign at full glow.", lat: 42.3487, lon: -71.0955, price_tier: 0, vibe_tags: ["photo-spot", "iconic", "night"], hours: "always", xp: 40 }),
  quest({ id: "kenmore-fens-scenic", station_id: "place-kencl", type: "scenic", title: "Walk the Fens rose garden", description: "A quiet loop through the Back Bay Fens and its rose garden.", lat: 42.3418, lon: -71.0937, price_tier: 0, vibe_tags: ["garden", "quiet", "outdoors"], hours: "06:00-22:00", xp: 50 }),
  quest({ id: "kenmore-ballpark-event", station_id: "place-kencl", type: "event", title: "Take the Fenway Park tour", description: "Walk the oldest ballpark in the majors, from the stands to the Green Monster.", lat: 42.3467, lon: -71.0972, price_tier: 3, vibe_tags: ["baseball", "history"], hours: "10:00-17:00", xp: 80 }),
  quest({ id: "kenmore-slice-food", station_id: "place-kencl", type: "food", title: "Grab a late-night slice", description: "A cheap slice in Kenmore Square, open well past the last train.", lat: 42.3490, lon: -71.0960, price_tier: 1, vibe_tags: ["pizza", "late-night", "cheap", "quick"], hours: "11:00-02:00", xp: 40 }),
  quest({ id: "kenmore-noodle-food", station_id: "place-kencl", type: "food", title: "Spicy noodle bowl near Kenmore", description: "A big bowl of chili-oil noodles for under ten dollars.", lat: 42.3495, lon: -71.0990, price_tier: 1, vibe_tags: ["spicy", "noodles", "cheap"], hours: "11:30-22:00", xp: 50 }),
  quest({ id: "kenmore-coffee-food", station_id: "place-kencl", type: "food", title: "Study break coffee on Comm Ave", description: "A cozy cafe with long tables and outlets along Commonwealth Avenue.", lat: 42.3501, lon: -71.1010, price_tier: 1, vibe_tags: ["coffee", "cozy", "study-spot"], hours: "07:00-21:00", xp: 40 }),
  quest({ id: "kenmore-gardner-scenic", station_id: "place-kencl", type: "scenic", title: "See the Gardner Museum courtyard", description: "The glass-roofed courtyard blooms year-round. Student tickets are discounted.", lat: 42.3382, lon: -71.0991, price_tier: 2, vibe_tags: ["art", "quiet", "rainy-day"], hours: "11:00-17:00", xp: 70 }),

  // Park Street
  quest({ id: "pktrm-common-scenic", station_id: "place-pktrm", type: "scenic", title: "Loop the Common and Public Garden", description: "Cross the Common, then circle the lagoon in the Public Garden.", lat: 42.3550, lon: -71.0656, price_tier: 0, vibe_tags: ["outdoors", "iconic", "photo-spot"], hours: "always", xp: 50 }),
  quest({ id: "pktrm-freedom-event", station_id: "place-pktrm", type: "event", title: "Walk the first stretch of the Freedom Trail", description: "Follow the red brick line from the Common past the State House.", lat: 42.3554, lon: -71.0637, price_tier: 0, vibe_tags: ["history", "walk"], hours: "always", xp: 60 }),
  quest({ id: "pktrm-dumplings-food", station_id: "place-pktrm", type: "food", title: "Dumplings in Downtown Crossing", description: "Pan-fried dumplings, fast, a block from the station.", lat: 42.3555, lon: -71.0605, price_tier: 1, vibe_tags: ["dumplings", "cheap", "quick"], hours: "11:00-21:00", xp: 40 }),

  // Harvard
  quest({ id: "harsq-yard-scenic", station_id: "place-harsq", type: "scenic", title: "Wander Harvard Yard", description: "Walk through the gates and across the oldest part of campus.", lat: 42.3744, lon: -71.1169, price_tier: 0, vibe_tags: ["history", "quiet", "photo-spot"], hours: "always", xp: 40 }),
  quest({ id: "harsq-books-event", station_id: "place-harsq", type: "event", title: "Browse a Harvard Square bookstore", description: "Lose an hour in the stacks of an independent bookstore.", lat: 42.3727, lon: -71.1190, price_tier: 0, vibe_tags: ["books", "cozy", "rainy-day"], hours: "09:00-22:00", xp: 50 }),
  quest({ id: "harsq-burger-food", station_id: "place-harsq", type: "food", title: "Late-night burger in the Square", description: "A diner burger and fries after the library closes.", lat: 42.3730, lon: -71.1205, price_tier: 2, vibe_tags: ["burgers", "late-night"], hours: "11:00-01:00", xp: 50 }),

  // Central
  quest({ id: "cntsq-alley-scenic", station_id: "place-cntsq", type: "scenic", title: "Walk Graffiti Alley", description: "A legal graffiti alley that gets repainted constantly. Every visit looks different.", lat: 42.3632, lon: -71.1010, price_tier: 0, vibe_tags: ["street-art", "photo-spot"], hours: "always", xp: 50 }),
  quest({ id: "cntsq-music-event", station_id: "place-cntsq", type: "event", title: "Catch a live set in Central", description: "Local bands most nights at a small club near the station.", lat: 42.3650, lon: -71.1025, price_tier: 2, vibe_tags: ["live-music", "late-night"], hours: "19:00-01:00", xp: 70 }),
  quest({ id: "cntsq-curry-food", station_id: "place-cntsq", type: "food", title: "Curry lunch in Central", description: "A spicy lunch special with plenty of vegetarian picks.", lat: 42.3660, lon: -71.1045, price_tier: 1, vibe_tags: ["spicy", "vegetarian", "cheap"], hours: "11:00-22:00", xp: 40 }),

  // Chinatown
  quest({ id: "chncl-gate-scenic", station_id: "place-chncl", type: "scenic", title: "Find the Chinatown Gate", description: "Start your loop at the gate on Beach Street.", lat: 42.3512, lon: -71.0605, price_tier: 0, vibe_tags: ["iconic", "photo-spot"], hours: "always", xp: 40 }),
  quest({ id: "chncl-bakery-food", station_id: "place-chncl", type: "food", title: "Bakery run in Chinatown", description: "Egg tarts and buns, a few dollars each.", lat: 42.3515, lon: -71.0613, price_tier: 1, vibe_tags: ["sweet", "cheap", "quick"], hours: "07:00-19:00", xp: 40 }),
  quest({ id: "chncl-hotpot-food", station_id: "place-chncl", type: "food", title: "Hot pot dinner with friends", description: "A bubbling pot for the table. Best with a squad.", lat: 42.3508, lon: -71.0620, price_tier: 2, vibe_tags: ["spicy", "group", "cozy"], hours: "11:30-23:00", xp: 60 }),
  quest({ id: "chncl-noodle-food", station_id: "place-chncl", type: "food", title: "Hand-pulled noodles", description: "Watch the noodles get pulled, then eat them with chili oil.", lat: 42.3519, lon: -71.0610, price_tier: 1, vibe_tags: ["noodles", "spicy", "cheap"], hours: "11:00-22:00", xp: 50 }),

  // Haymarket / North End
  quest({ id: "haecl-market-event", station_id: "place-haecl", type: "event", title: "Shop the Haymarket stalls", description: "Fruit and vegetables at market prices, Fridays and Saturdays.", lat: 42.3618, lon: -71.0570, price_tier: 0, vibe_tags: ["market", "cheap"], hours: "07:00-17:00", xp: 50 }),
  quest({ id: "haecl-cannoli-food", station_id: "place-haecl", type: "food", title: "Cannoli in the North End", description: "Pick a side in the North End's friendliest pastry rivalry.", lat: 42.3637, lon: -71.0545, price_tier: 1, vibe_tags: ["sweet", "iconic"], hours: "08:00-22:00", xp: 40 }),
  quest({ id: "haecl-harbor-scenic", station_id: "place-haecl", type: "scenic", title: "Sunset on the Harborwalk", description: "Follow the water's edge around the North End at golden hour.", lat: 42.3660, lon: -71.0510, price_tier: 0, vibe_tags: ["waterfront", "sunset", "outdoors"], hours: "always", xp: 50 }),

  // Copley / Back Bay
  quest({ id: "coecl-library-scenic", station_id: "place-coecl", type: "scenic", title: "Read in the Boston Public Library courtyard", description: "A quiet arcade courtyard inside the McKim building. Free and open to everyone.", lat: 42.3493, lon: -71.0782, price_tier: 0, vibe_tags: ["quiet", "study-spot", "architecture"], hours: "09:00-20:00", xp: 50 }),
  quest({ id: "coecl-brunch-food", station_id: "place-coecl", type: "food", title: "Brunch on Newbury Street", description: "A sit-down weekend brunch worth the splurge.", lat: 42.3505, lon: -71.0800, price_tier: 3, vibe_tags: ["brunch", "splurge"], hours: "09:00-15:00", xp: 60 }),
];

/** Always returns a too_far error in mock mode, so the error state can be built. */
export const TOO_FAR_QUEST_ID = "pktrm-common-scenic";

export const deals: Deal[] = [
  { id: 1, quest_id: "kenmore-noodle-food", text: "SAMPLE: 10% off with student ID", is_sample: true },
  { id: 2, quest_id: "chncl-bakery-food", text: "SAMPLE: Free egg tart with any two items", is_sample: true },
  { id: 3, quest_id: "harsq-burger-food", text: "SAMPLE: Free fries after 10 pm", is_sample: true },
];

// ---------- people ----------

export const DEMO_ACCOUNTS = [
  { userId: "demo-maya", label: "Maya, Northeastern", blurb: "Full passport with a Gold neighborhood" },
  { userId: "demo-sam", label: "Sam, BU", blurb: "Brand new, nothing collected yet" },
  { userId: "demo-jordan", label: "Jordan, MIT", blurb: "In a cross-school squad" },
] as const;

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
  xp: 0, // recomputed from visits in the mock service
  privacy,
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
  // Maya: Gold in Fenway-Kenmore (6), Silver in Chinatown (3), Bronze in Harvard Square
  { user_id: "demo-maya", quest_id: "kenmore-citgo-scenic", daysAgo: 30 },
  { user_id: "demo-maya", quest_id: "kenmore-fens-scenic", daysAgo: 26 },
  { user_id: "demo-maya", quest_id: "kenmore-slice-food", daysAgo: 21 },
  { user_id: "demo-maya", quest_id: "kenmore-noodle-food", daysAgo: 15 },
  { user_id: "demo-maya", quest_id: "kenmore-coffee-food", daysAgo: 9 },
  { user_id: "demo-maya", quest_id: "kenmore-gardner-scenic", daysAgo: 0, squad_id: "sq-owls", cross_school: true },
  { user_id: "demo-maya", quest_id: "chncl-gate-scenic", daysAgo: 12 },
  { user_id: "demo-maya", quest_id: "chncl-bakery-food", daysAgo: 12 },
  { user_id: "demo-maya", quest_id: "chncl-noodle-food", daysAgo: 0, hidden: true },
  { user_id: "demo-maya", quest_id: "harsq-books-event", daysAgo: 5 },
  { user_id: "u-emr-1", quest_id: "kenmore-gardner-scenic", daysAgo: 0, squad_id: "sq-owls", cross_school: true },

  // Jordan: cross-school squad visits with the Grazers
  { user_id: "demo-jordan", quest_id: "coecl-library-scenic", daysAgo: 0, squad_id: "sq-grazers", cross_school: true },
  { user_id: "u-neu-3", quest_id: "coecl-library-scenic", daysAgo: 0, squad_id: "sq-grazers", cross_school: true },
  { user_id: "demo-jordan", quest_id: "cntsq-alley-scenic", daysAgo: 4 },
  { user_id: "demo-jordan", quest_id: "kenmore-slice-food", daysAgo: 0 },
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
