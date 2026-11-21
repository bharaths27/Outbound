// Pure helpers for the Compete tab. Scores and eligibility come from the backend's
// leaderboard_weekly view as-is; these only rank for display and format squad details.

import type { LeaderboardRow, SquadWithMembers } from "@/lib/data/types";

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
