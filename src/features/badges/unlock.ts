// Which badges are new since the player last looked. The last-seen set lives in localStorage per
// player; the first time we see a player we only remember their badges (no popup for old ones).

import type { BadgeId } from "@/lib/data/types";

export const BADGES_SEEN_KEY = (userId: string) => `outbound.badges.seen.${userId}`;

/** New badges in `next` that weren't in `prev`. `prev === null` means we've never looked: nothing is new. */
export function newlyEarned(prev: readonly string[] | null, next: readonly BadgeId[]): BadgeId[] {
  if (prev === null) return [];
  const seen = new Set(prev);
  return next.filter((b) => !seen.has(b));
}

export function readSeen(userId: string, storage: Pick<Storage, "getItem"> | null = safeStorage()): string[] | null {
  try {
    const raw = storage?.getItem(BADGES_SEEN_KEY(userId));
    if (raw == null) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export function writeSeen(userId: string, badges: readonly string[], storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try {
    storage?.setItem(BADGES_SEEN_KEY(userId), JSON.stringify([...badges]));
  } catch {
    // storage blocked: the popup may show again next time, which is fine
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Fired after anything that can earn a badge (a check-in). The unlock watcher listens. */
export const PROGRESS_CHANGED = "outbound:progress-changed";
/** Fired to replay one badge's unlock animation (tapping an earned badge on the passport). */
export const SHOW_BADGE = "outbound:show-badge";

export function progressChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROGRESS_CHANGED));
}
export function showBadge(id: BadgeId) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<BadgeId>(SHOW_BADGE, { detail: id }));
}

const DATES_KEY = (userId: string) => `outbound.badges.dates.${userId}`;

/** Remember when badges were unlocked on this device (the backend doesn't store a date). */
export function recordUnlocks(userId: string, ids: readonly string[], when = new Date()) {
  try {
    const all = JSON.parse(localStorage.getItem(DATES_KEY(userId)) ?? "{}") as Record<string, string>;
    for (const id of ids) all[id] ??= when.toISOString();
    localStorage.setItem(DATES_KEY(userId), JSON.stringify(all));
  } catch {}
}

export function unlockDates(userId: string | null): Record<string, string> {
  if (!userId) return {};
  try {
    return JSON.parse(localStorage.getItem(DATES_KEY(userId)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
