// Seasonal stamps. Each one only shows up during its window, and you need check-ins on
// at least 3 different days inside that window (same season) to earn it, so one lucky
// visit is not enough. Dates are Boston dates (visit.visit_date, YYYY-MM-DD).

export type SeasonalId =
  | "move_in_week"
  | "head_of_the_charles"
  | "fall_foliage"
  | "winter_lights"
  | "marathon_monday"
  | "spring_blossoms";

export const DAYS_NEEDED = 3;

export interface Season {
  id: SeasonalId;
  name: string;
  /** Short label for when it runs, shown on locked stamps. */
  when: string;
  /** The window for the season that starts in `year`, as inclusive YYYY-MM-DD dates. */
  window: (year: number) => [string, string];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** The nth weekday (0 = Sunday) of a month, as a day number. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function shift(date: string, days: number): string {
  const t = new Date(`${date}T12:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export const SEASONS: Season[] = [
  { id: "move_in_week", name: "Move-in Week", when: "Late Aug to early Sep", window: (y) => [ymd(y, 8, 25), ymd(y, 9, 7)] },
  {
    id: "head_of_the_charles",
    name: "Head of the Charles",
    when: "Mid October",
    // The regatta is the third weekend of October. Window: the week before through the Monday after.
    window: (y) => {
      const sat = ymd(y, 10, nthWeekday(y, 10, 6, 3));
      return [shift(sat, -7), shift(sat, 2)];
    },
  },
  { id: "fall_foliage", name: "Fall Foliage", when: "Oct to mid Nov", window: (y) => [ymd(y, 10, 1), ymd(y, 11, 15)] },
  { id: "winter_lights", name: "Winter Lights", when: "Dec to mid Jan", window: (y) => [ymd(y, 12, 1), ymd(y + 1, 1, 15)] },
  {
    id: "marathon_monday",
    name: "Marathon Monday",
    when: "April, race week",
    // Patriots' Day is the third Monday of April. Window: the Thursday before through Sunday after.
    window: (y) => {
      const mon = ymd(y, 4, nthWeekday(y, 4, 1, 3));
      return [shift(mon, -4), shift(mon, 6)];
    },
  },
  { id: "spring_blossoms", name: "Spring Blossoms", when: "Mid Apr to May", window: (y) => [ymd(y, 4, 15), ymd(y, 5, 31)] },
];

export interface SeasonView {
  season: Season;
  earned: boolean;
  /** Date the stamp was earned (the 3rd day), when earned. */
  earnedOn: string | null;
  /** True when today is inside this season's window. */
  live: boolean;
  /** Distinct days checked in during the current window (0 when not live). */
  daysThisWindow: number;
}

/** Windows that could contain `date`: the one starting this year and last year (winter wraps). */
function windowsAround(s: Season, date: string): [string, string][] {
  const y = Number(date.slice(0, 4));
  return [s.window(y - 1), s.window(y)];
}

export function seasonalStamps(visitDates: string[], today: string): SeasonView[] {
  const days = [...new Set(visitDates)].sort();
  return SEASONS.map((season) => {
    let earnedOn: string | null = null;
    // Check every window any visit falls in; earliest completed window wins.
    const windows = new Map<string, [string, string]>();
    for (const d of days) for (const w of windowsAround(season, d)) if (d >= w[0] && d <= w[1]) windows.set(w[0], w);
    for (const [, [a, b]] of [...windows].sort()) {
      const inside = days.filter((d) => d >= a && d <= b && d <= today);
      if (inside.length >= DAYS_NEEDED) {
        earnedOn = inside[DAYS_NEEDED - 1];
        break;
      }
    }
    const current = windowsAround(season, today).find(([a, b]) => today >= a && today <= b);
    const daysThisWindow = current ? days.filter((d) => d >= current[0] && d <= current[1] && d <= today).length : 0;
    return { season, earned: !!earnedOn, earnedOn, live: !!current, daysThisWindow };
  });
}
