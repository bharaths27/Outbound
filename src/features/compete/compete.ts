// Pure helpers for the Compete tab. Scores and eligibility come from the backend's
// leaderboard_weekly view as-is; these only rank for display and format squad details.

import type { LeaderboardRow, SquadWithMembers } from "@/lib/data/types";
import { bostonWeekStart } from "@/features/quests/daily";

export interface RankedRow extends LeaderboardRow {
  /** 1-based rank among eligible schools; null when the school needs more players. */
  rank: number | null;
  mine: boolean;
}

/** The view is ordered eligible first, then by weekly XP. Ranks count eligible schools only. */
export function rankSchools(rows: LeaderboardRow[], mySchoolId: number | null): { rows: RankedRow[]; mine: RankedRow | null } {
  let rank = 0;
  const ranked = rows.map((r) => ({ ...r, rank: r.eligible ? ++rank : null, mine: r.school_id === mySchoolId }));
  return { rows: ranked, mine: ranked.find((r) => r.mine) ?? null };
}

/** The view's eligibility threshold, for "3 of 5 players". Display only. */
export const MIN_PLAYERS = 5;

export function isCrossSchool(squad: SquadWithMembers): boolean {
  return new Set(squad.members.map((m) => m.school_id)).size > 1;
}

/** Invite codes are 6 letters or digits; accept pasted links, spaces, and lowercase. */
export function normalizeCode(input: string): string {
  const fromLink = input.match(/\/squad\/join\/([A-Za-z0-9]+)/)?.[1];
  return (fromLink ?? input).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/squad/join/${encodeURIComponent(code)}`;
}

/** "Maya Chen" → "MC", "maya" → "M", null → "?". */
export function initials(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function squadName(squad: Pick<SquadWithMembers, "name" | "code">): string {
  return squad.name?.trim() || `Squad ${squad.code}`;
}

const ABBR: Record<string, string> = {
  "Boston University": "BU",
  Northeastern: "NEU",
  "Northeastern University": "NEU",
  "Harvard University": "HU",
  Harvard: "HU",
  "Tufts University": "TU",
  Tufts: "TU",
  "Boston College": "BC",
  "UMass Boston": "UMB",
};

/** Short school mark for avatars: "Boston University" → "BU", "MIT" → "MIT", "Emerson" → "EM". */
export function schoolAbbr(name: string): string {
  if (ABBR[name]) return ABBR[name];
  if (/^[A-Z]{2,4}$/.test(name)) return name;
  const words = name.split(/\s+/).filter((w) => w && !/^(of|the|and|at)$/i.test(w));
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
  return name.slice(0, 2).toUpperCase();
}

/**
 * Monday (YYYY-MM-DD) of the week containing a Boston date key, matching the weekly reset.
 * visit_date is the Boston date of checked_in_at, so "visit_date >= Monday" selects the same
 * check-ins as leaderboard_weekly's "checked_in_at >= Monday 00:00 Boston".
 */
export const weekStart = bostonWeekStart;

/** The player's XP from check-ins this week (Monday on), for "Your school contribution". */
export function weeklyXp(visits: { visit_date: string; xp_awarded: number }[], dateKey: string): number {
  const from = weekStart(dateKey);
  return visits.filter((v) => v.visit_date >= from && v.visit_date <= dateKey).reduce((s, v) => s + v.xp_awarded, 0);
}
