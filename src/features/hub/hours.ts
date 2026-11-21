// Opening hours for quests. Quest.hours is "HH:MM-HH:MM", "always", or null (unknown).
// An end time at or before the start closes the next day ("11:00-02:00"). Times are
// compared in Boston time, whatever the device's time zone.

export type OpenState = { open: boolean; label: string };

const BOSTON = "America/New_York";

/** Minutes since midnight in Boston for the given instant. */
export function bostonMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOSTON,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Parses "HH:MM-HH:MM" into minutes since midnight, or "always". Null if unreadable. */
export function parseHours(hours: string | null): { start: number; end: number } | "always" | null {
  if (!hours) return null;
  const text = hours.trim().toLowerCase();
  if (text === "always") return "always";
  const m = text.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  return { start: (h1 * 60 + m1) % 1440, end: (h2 * 60 + m2) % 1440 };
}

/** True or false when the hours are known, null when they aren't. */
export function isOpenAt(hours: string | null, now: Date): boolean | null {
  const parsed = parseHours(hours);
  if (parsed === null) return null;
  if (parsed === "always") return true;
  const { start, end } = parsed;
  if (start === end) return true; // a full 24 hours
  const t = bostonMinutes(now);
  return start < end ? t >= start && t < end : t >= start || t < end;
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

/** "Open until 10 PM", "Closed · opens 11 AM", "Open 24 hours". Null when hours are unknown. */
export function openState(hours: string | null, now: Date): OpenState | null {
  const parsed = parseHours(hours);
  const open = isOpenAt(hours, now);
  if (parsed === null || open === null) return null;
  if (parsed === "always" || parsed.start === parsed.end) return { open: true, label: "Open 24 hours" };
  return open
    ? { open: true, label: `Open until ${formatClock(parsed.end)}` }
    : { open: false, label: `Closed · opens ${formatClock(parsed.start)}` };
}

/** "11 AM – 2 AM", "Open 24 hours", or null. */
export function formatHours(hours: string | null): string | null {
  const parsed = parseHours(hours);
  if (parsed === null) return null;
  if (parsed === "always" || parsed.start === parsed.end) return "Open 24 hours";
  const range = `${formatClock(parsed.start)} – ${formatClock(parsed.end)}`;
  return range.charAt(0).toUpperCase() + range.slice(1);
}
