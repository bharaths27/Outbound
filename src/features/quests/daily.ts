// Today's quests (DESIGN.md §2.3): a daily pick of quests across stations, the same for
// everyone on a given Boston date. The backend has no daily list yet, so the pick is a
// stable hash of the date and quest id. It takes one quest per category first, then fills
// the rest from stations not used yet, so the list spreads across the T. It skips quests
// that need a code (requires_qr: you can't do them without being at the event) and places
// with no hours on that day.

import type { Quest, QuestType, Visit } from "@/lib/data/types";
import { opensOnDay } from "@/features/hub/hours";

export const DAILY_COUNT = 5;

/** YYYY-MM-DD in America/New_York, the same key as visits.visit_date. */
export function bostonDateKey(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// FNV-1a, 32-bit: small, fast, and stable across runtimes.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Quests a player can do on the day of `now`: no code needed, and open at some point that day. */
export function dailyEligible(quests: Quest[], now: Date): Quest[] {
  return quests.filter((q) => !q.requires_qr && opensOnDay(q.hours, now));
}

/** Pass quests through dailyEligible first. */
export function pickDailyQuests(quests: Quest[], dateKey: string, count = DAILY_COUNT): Quest[] {
  const shuffled = [...quests].sort((a, b) => hash(`${dateKey}:${a.id}`) - hash(`${dateKey}:${b.id}`) || a.id.localeCompare(b.id));
  const picked: Quest[] = [];
  const usedStations = new Set<string>();
  const take = (q: Quest) => {
    picked.push(q);
    usedStations.add(q.station_id);
  };

  // One of each category first.
  const types: QuestType[] = ["food", "event", "scenic"];
  for (const type of types) {
    if (picked.length >= count) break;
    const q = shuffled.find((x) => x.type === type && !usedStations.has(x.station_id));
    if (q) take(q);
  }
  // Then new stations, then anything left.
  for (const q of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(q) && !usedStations.has(q.station_id)) take(q);
  }
  for (const q of shuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(q)) take(q);
  }
  return picked;
}

/** Puts this week's featured quest (quest_of_the_week()) first when it's in today's list. */
export function featuredFirst(daily: Quest[], featuredId: string | null): Quest[] {
  const i = featuredId ? daily.findIndex((q) => q.id === featuredId) : -1;
  return i <= 0 ? daily : [daily[i], ...daily.slice(0, i), ...daily.slice(i + 1)];
}

/**
 * XP the player earned on this Boston date (what check_in awarded, bonuses included).
 * Pass `questIds` to count only those quests (today's list), so "+XP" agrees with "N of 5 done".
 */
export function xpToday(visits: Visit[], dateKey: string, questIds?: ReadonlySet<string>): number {
  return visits
    .filter((v) => v.visit_date === dateKey && (!questIds || questIds.has(v.quest_id)))
    .reduce((sum, v) => sum + (v.xp_awarded ?? 0), 0);
}

/** Quest ids the player checked in to on this Boston date. */
export function doneToday(visits: Visit[], dateKey: string): Set<string> {
  return new Set(visits.filter((v) => v.visit_date === dateKey).map((v) => v.quest_id));
}

/** The Monday (YYYY-MM-DD) of a Boston date's week, like date_trunc('week', …) in the backend. */
export function bostonWeekStart(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
