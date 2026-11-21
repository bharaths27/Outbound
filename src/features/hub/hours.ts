// Opening hours for quests, compared in Boston time whatever the device's time zone.
//
// Quest.hours format (see content/README.md):
//   "always"                                     open 24/7 (outdoor spots)
//   "11:00-22:00"                                every day
//   "Mon-Thu 09:00-20:00; Fri,Sat 09:00-17:00"   per day; days not listed are closed
//   null or ""                                   unknown (never filtered out)
// Days: Mon Tue Wed Thu Fri Sat Sun, "Daily", ranges ("Sun-Tue" wraps the week), and
// comma lists. An end at or before the start closes after midnight ("11:00-02:00"), and
// those after-midnight hours belong to the day the period started.

export type OpenState = { open: boolean; label: string };

/** One opening period. day 0 = Monday … 6 = Sunday. Minutes since midnight. */
export interface Period {
  day: number;
  start: number;
  end: number;
}

export type Schedule = "always" | Period[];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BOSTON = "America/New_York";

/** Boston weekday (0 = Monday) and minutes since midnight for an instant. */
export function bostonTime(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOSTON,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: DAYS.indexOf(get("weekday").toLowerCase()),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Minutes since midnight in Boston for the given instant. */
export function bostonMinutes(now: Date): number {
  return bostonTime(now).minutes;
}

function parseTime(text: string): number | null {
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return (h * 60 + min) % 1440;
}

function parseDays(text: string): number[] | null {
  if (text === "daily") return [0, 1, 2, 3, 4, 5, 6];
  const days = new Set<number>();
  for (const part of text.split(",")) {
    const [a, b, extra] = part.split("-").map((d) => DAYS.indexOf(d));
    if (extra !== undefined || a < 0 || (b !== undefined && b < 0)) return null;
    if (b === undefined) {
      days.add(a);
    } else {
      for (let d = a; ; d = (d + 1) % 7) {
        days.add(d);
        if (d === b) break;
      }
    }
  }
  return [...days].sort();
}

/** Parses Quest.hours. Null when empty or unreadable (treated as unknown). */
export function parseSchedule(hours: string | null): Schedule | null {
  const text = hours?.trim().toLowerCase().replace(/[–—]/g, "-");
  if (!text) return null;
  if (text === "always") return "always";
  const periods: Period[] = [];
  for (const segment of text.split(";").map((s) => s.trim()).filter(Boolean)) {
    const m = segment.match(/^(?:([a-z][a-z,\s-]*?)\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const days = parseDays(m[1] ? m[1].replace(/\s+/g, "") : "daily");
    const start = parseTime(m[2]);
    const end = parseTime(m[3]);
    if (!days || start === null || end === null) return null;
    for (const day of days) periods.push({ day, start, end });
  }
  return periods.length ? periods : null;
}

/** A schedule that is the same every day, as one range; else null. */
export function parseHours(hours: string | null): { start: number; end: number } | "always" | null {
  const s = parseSchedule(hours);
  if (s === null || s === "always") return s;
  const first = s[0];
  const daily = new Set(s.map((p) => p.day)).size === 7 && s.every((p) => p.start === first.start && p.end === first.end);
  return daily ? { start: first.start, end: first.end } : null;
}

const length = (p: Period) => (p.end > p.start ? p.end - p.start : p.end + 1440 - p.start);

/** The period open at this moment, if any (including last night's after-midnight hours). */
function currentPeriod(periods: Period[], day: number, minutes: number): Period | null {
  for (const p of periods) {
    if (p.start === p.end) {
      if (p.day === day) return p; // a full 24 hours
      continue;
    }
    const sinceStart = p.day === day ? minutes - p.start : p.day === (day + 6) % 7 ? minutes + 1440 - p.start : -1;
    if (sinceStart >= 0 && sinceStart < length(p)) return p;
  }
  return null;
}

/** True or false when the hours are known, null when they aren't. */
export function isOpenAt(hours: string | null, now: Date): boolean | null {
  const s = parseSchedule(hours);
  if (s === null) return null;
  if (s === "always") return true;
  const { day, minutes } = bostonTime(now);
  return currentPeriod(s, day, minutes) !== null;
}

/** "9 AM", "11:30 PM", "midnight", "noon". */
export function formatClock(minutes: number): string {
  if (minutes === 0) return "midnight";
  if (minutes === 720) return "noon";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The next opening after now: "11 AM" later today, "tomorrow 7 AM", or "Tue 10 AM". */
function nextOpening(periods: Period[], day: number, minutes: number): string | null {
  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    const starts = periods
      .filter((p) => p.day === d && (offset > 0 || p.start > minutes))
      .map((p) => p.start)
      .sort((a, b) => a - b);
    if (starts.length) {
      const clock = formatClock(starts[0]);
      if (offset === 0) return clock;
      if (offset === 1) return `tomorrow ${clock}`;
      return `${DAY_LABELS[d]} ${clock}`;
    }
  }
  return null;
}

/** "Open until 10 PM", "Closed · opens 11 AM", "Open 24 hours". Null when unknown. */
export function openState(hours: string | null, now: Date): OpenState | null {
  const s = parseSchedule(hours);
  if (s === null) return null;
  if (s === "always") return { open: true, label: "Open 24 hours" };
  const { day, minutes } = bostonTime(now);
  const current = currentPeriod(s, day, minutes);
  if (current) {
    return current.start === current.end
      ? { open: true, label: "Open 24 hours" }
      : { open: true, label: `Open until ${formatClock(current.end)}` };
  }
  const next = nextOpening(s, day, minutes);
  return { open: false, label: next ? `Closed · opens ${next}` : "Closed" };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Where a set of days starts, counting a run that crosses Sunday (Sun–Tue) as first. */
const firstDay = (days: number[]) => (days.includes(6) && days.includes(0) && days.length < 7 ? -1 : days[0]);

/** [0,1,2,3,5] → "Mon–Thu, Sat"; [0,1,6] → "Sun–Tue" (runs wrap the week). */
function dayRanges(days: number[]): string {
  // Weeks start on Monday, unless a run crosses Sunday into Monday (Sun–Tue): then start
  // at the beginning of that run so it stays together.
  let start = 0;
  if (days.length < 7 && days.includes(6) && days.includes(0)) {
    start = 6;
    while (days.includes((start + 6) % 7)) start = (start + 6) % 7;
  }
  const order = [0, 1, 2, 3, 4, 5, 6].map((i) => (start + i) % 7).filter((d) => days.includes(d));
  const out: string[] = [];
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1] === (order[j] + 1) % 7) j++;
    out.push(
      j - i >= 2
        ? `${DAY_LABELS[order[i]]}–${DAY_LABELS[order[j]]}`
        : order.slice(i, j + 1).map((d) => DAY_LABELS[d]).join(", "),
    );
    i = j + 1;
  }
  return out.join(", ");
}

/**
 * Human hours, one line per distinct time range: ["11 AM – 2 AM"] when every day is the
 * same, or ["Mon–Thu 9 AM – 8 PM", "Fri, Sat 9 AM – 5 PM"]. Null when unknown.
 */
export function formatSchedule(hours: string | null): string[] | null {
  const s = parseSchedule(hours);
  if (s === null) return null;
  if (s === "always") return ["Open 24 hours"];
  const byRange = new Map<string, { start: number; end: number; days: number[] }>();
  for (const p of s) {
    const key = `${p.start}-${p.end}`;
    const entry = byRange.get(key) ?? { start: p.start, end: p.end, days: [] };
    if (!entry.days.includes(p.day)) entry.days.push(p.day);
    byRange.set(key, entry);
  }
  return [...byRange.values()]
    .map((r) => ({ ...r, days: [...r.days].sort((a, b) => a - b) }))
    .sort((a, b) => firstDay(a.days) - firstDay(b.days))
    .map(({ start, end, days }) => {
      const range = start === end ? "open 24 hours" : `${formatClock(start)} – ${formatClock(end)}`;
      return days.length === 7 ? capitalize(range) : `${dayRanges(days)} ${range}`;
    });
}

/** All hours on one line ("Mon–Thu 9 AM – 8 PM · Sun 11 AM – 5 PM"), or null. */
export function formatHours(hours: string | null): string | null {
  return formatSchedule(hours)?.join(" · ") ?? null;
}
