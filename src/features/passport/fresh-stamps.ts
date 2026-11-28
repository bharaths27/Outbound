"use client";

// Stamps earned since the player last opened their passport, so those can be pressed onto the
// page with a dated ink stamp. First visit: nothing is "fresh" (no replay of old stamps).

import { useEffect, useState } from "react";

const KEY = (uid: string) => `outbound.stamps.seen.${uid}`;

export function freshStamps(prev: readonly string[] | null, now: readonly string[]): Set<string> {
  if (prev === null) return new Set();
  const seen = new Set(prev);
  return new Set(now.filter((q) => !seen.has(q)));
}

export function useFreshStamps(userId: string | null, questIds: string[]): Set<string> {
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const sig = questIds.join("|");
  useEffect(() => {
    if (!userId) return;
    let prev: string[] | null = null;
    try {
      const raw = localStorage.getItem(KEY(userId));
      prev = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {}
    setFresh(freshStamps(prev, questIds));
    try {
      localStorage.setItem(KEY(userId), JSON.stringify(questIds));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sig]);
  return fresh;
}

const STAMP_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/** "NOV 26 2026" for the ink date stamp. */
export function inkDate(at: string | Date): string {
  return STAMP_DATE.format(new Date(at)).replace(",", "").toUpperCase();
}
