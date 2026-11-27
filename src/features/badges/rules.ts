// Who earns which badge. One pure function, used by the sample backend and on top of the
// live backend, so the rules live in one place. Three badges need data the app doesn't record
// yet (who checked in at a hosted event, snow at check-in time); they stay "coming soon".

import type { BadgeId } from "@/lib/data/types";

export interface BadgeVisit {
  quest_id: string;
  station_lines: string[]; // e.g. ["Green-B", "Green-C"]
  neighborhood: string;
  checked_in_at: string; // ISO
  visit_date: string; // YYYY-MM-DD, Boston
  squad_id: string | null;
  cross_school: boolean;
}

export interface BadgeInput {
  visits: BadgeVisit[];
  /** Neighborhoods that have quests, with how many. */
  questsPerNeighborhood: Record<string, number>;
  reviews: { note: string; likes: number }[];
  longestStreak: number;
  /** Week starts (YYYY-MM-DD) in which the player finished that week's Quest of the Week. */
  questOfWeekWeeks?: string[];
}

/** Not tracked yet: shown locked with "Coming soon". */
export const COMING_SOON: ReadonlySet<BadgeId> = new Set(["free_food_finder", "host_with_the_most", "snow_day"]);

const hourInBoston = (iso: string) =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));

const lineColor = (l: string) => l.split("-")[0]; // "Green-B" → "Green"

/** Neighborhood tier counts, same thresholds as check_in(): 1 Bronze, 3 Silver, 5 Gold distinct quests. */
export function tiersByNeighborhood(visits: BadgeVisit[]): Map<string, "bronze" | "silver" | "gold"> {
  const quests = new Map<string, Set<string>>();
  for (const v of visits) quests.set(v.neighborhood, (quests.get(v.neighborhood) ?? new Set()).add(v.quest_id));
  const out = new Map<string, "bronze" | "silver" | "gold">();
  for (const [h, q] of quests) out.set(h, q.size >= 5 ? "gold" : q.size >= 3 ? "silver" : "bronze");
  return out;
}

function consecutiveWeeks(weeks: string[]): number {
  const days = [...new Set(weeks)].map((w) => Date.parse(`${w}T12:00:00Z`) / 86_400_000).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && Math.round(days[i] - days[i - 1]) === 7 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export function earnedBadges(input: BadgeInput): BadgeId[] {
  const { visits, reviews } = input;
  const out: BadgeId[] = [];
  const nightDays = new Set(visits.filter((v) => hourInBoston(v.checked_in_at) >= 22).map((v) => v.visit_date));
  const earlyDays = new Set(visits.filter((v) => hourInBoston(v.checked_in_at) < 8).map((v) => v.visit_date));
  const colors = new Set(visits.flatMap((v) => v.station_lines.map(lineColor)));
  const tiers = tiersByNeighborhood(visits);
  const hoods = Object.keys(input.questsPerNeighborhood).filter((h) => input.questsPerNeighborhood[h] > 0);

  // Cross-Town: 4 neighborhoods in one Boston week (weeks start Monday).
  const weekOf = (d: string) => {
    const t = new Date(`${d}T12:00:00Z`);
    const dow = (t.getUTCDay() + 6) % 7;
    return new Date(t.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
  };
  const hoodsByWeek = new Map<string, Set<string>>();
  for (const v of visits) hoodsByWeek.set(weekOf(v.visit_date), (hoodsByWeek.get(weekOf(v.visit_date)) ?? new Set()).add(v.neighborhood));

  // Green Line Veteran: a quest at a station only one branch serves, on each of B, C, D and E.
  const soloBranches = new Set(
    visits.flatMap((v) => {
      const greens = v.station_lines.filter((l) => l.startsWith("Green-"));
      return greens.length === 1 ? [greens[0].slice(6)] : [];
    }),
  );

  if (visits.length >= 1) out.push("first_stop");
  if (["Red", "Orange", "Green", "Blue"].every((c) => colors.has(c))) out.push("line_collector");
  if (nightDays.size >= 3) out.push("night_owl");
  if (earlyDays.size >= 3) out.push("early_bird");
  if ([...hoodsByWeek.values()].some((h) => h.size >= 4)) out.push("cross_town");
  if (new Set(visits.filter((v) => v.squad_id).map((v) => v.quest_id)).size >= 3) out.push("squad_goals");
  if (reviews.filter((r) => r.note.trim().length > 0).length >= 10) out.push("critic");
  if (input.longestStreak >= 7) out.push("week_on_the_t");
  if (["B", "C", "D", "E"].every((b) => soloBranches.has(b))) out.push("green_line_veteran");
  if (visits.filter((v) => v.cross_school).length >= 5) out.push("bridge_builder");
  if (consecutiveWeeks(input.questOfWeekWeeks ?? []) >= 4) out.push("weekly_regular");
  if (reviews.some((r) => r.likes >= 10)) out.push("taste_maker");
  if (hoods.length > 0 && hoods.every((h) => tiers.has(h))) out.push("passport_complete");
  if ([...tiers.values()].filter((t) => t === "gold").length >= 3) out.push("boston_local");
  if (input.longestStreak >= 30) out.push("month_on_the_t");
  return out;
}
