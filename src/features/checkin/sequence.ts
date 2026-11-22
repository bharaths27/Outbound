// The check-in celebration as a pure timeline (DESIGN.md "Motion"): given the time since
// the result arrived, what the screen shows. The component only advances the clock, so
// skipping is "jump to the end" and reduced motion is "start at the end".
//
//   0–400 ms     stamp drops in with a slight overshoot and lands at its rotation
//   450–1250 ms  XP counts up; breakdown lines appear one by one
//   1300–1800 ms neighborhood ring fills (and changes color on a tier upgrade)
//
// XP, tiers, and progress all come from check_in()'s result. Nothing is computed here
// beyond animating between the values the backend returned.

import type { CheckInResult, Tier, XpReason } from "@/lib/data/types";

export const STAMP = { start: 0, end: 400 };
export const XP = { start: 450, end: 1250 };
export const RING = { start: 1300, end: 1800 };
export const TOTAL_MS = RING.end;

export const REASON_LABEL: Record<XpReason, string> = {
  base: "Quest",
  first_visit: "First visit",
  new_neighborhood: "New neighborhood",
  squad: "Squad bonus",
  cross_school: "Cross-school bonus",
  quest_of_the_week: "Quest of the Week",
};

export const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const progress = (t: number, span: { start: number; end: number }) => clamp01((t - span.start) / (span.end - span.start));
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
/** Ease-out with a small overshoot past 1 before settling (the stamp "lands"). */
export const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/** Share of the way to the next tier, from the backend's counts. 1 at gold. */
export function tierProgress(r: Pick<CheckInResult, "neighborhood_quests" | "quests_to_next_tier" | "next_tier">): number {
  if (r.next_tier === null) return 1;
  const total = r.neighborhood_quests + r.quests_to_next_tier;
  return total > 0 ? r.neighborhood_quests / total : 0;
}

export interface Frame {
  /** 0 → 1 with overshoot: scale and fall of the stamp. */
  stamp: number;
  stampOpacity: number;
  xp: number;
  /** How many breakdown lines are visible. */
  lines: number;
  /** Ring fill, 0 → 1. */
  ring: number;
  /** Ring color: the previous tier until the fill completes on an upgrade. */
  ringTier: Tier;
  tierUp: boolean;
  done: boolean;
}

/**
 * @param prevTier the player's tier in this neighborhood before checking in (null if new).
 */
export function frameAt(t: number, r: CheckInResult, prevTier: Tier | null): Frame {
  const tierUp = prevTier !== null && prevTier !== r.tier;
  const s = progress(t, STAMP);
  const x = progress(t, XP);
  const g = progress(t, RING);
  const lines = r.xp_breakdown.length;

  // Ring: without an upgrade it moves from the previous share to the new one. On an
  // upgrade (or a brand-new neighborhood) it fills from empty in the new tier's color.
  const after = tierProgress(r);
  const before =
    tierUp || prevTier === null
      ? 0
      : Math.max(0, (r.neighborhood_quests - 1) / (r.neighborhood_quests + r.quests_to_next_tier));
  const ring = before + (after - before) * easeOutCubic(g);

  return {
    stamp: s === 0 ? 0 : easeOutBack(s),
    stampOpacity: clamp01(s * 3),
    xp: Math.round(r.xp_awarded * easeOutCubic(x)),
    lines: x === 0 ? 0 : Math.min(lines, Math.floor(x * lines) + 1),
    ring,
    ringTier: tierUp && g < 1 ? prevTier! : r.tier,
    tierUp,
    done: t >= TOTAL_MS,
  };
}

/** One sentence for screen readers and the skip state. */
export function summary(r: CheckInResult, prevTier: Tier | null): string {
  const parts = [`Checked in. Plus ${r.xp_awarded} XP.`];
  if (prevTier === null) parts.push(`First stamp in ${r.neighborhood}.`);
  else if (prevTier !== r.tier) parts.push(`${TIER_LABEL[r.tier]} in ${r.neighborhood}.`);
  parts.push(`Level ${r.level}.`);
  return parts.join(" ");
}

/** "2 more quests for Silver", "Gold. Every stamp here counts.", from the backend's counts. */
export function nextTierLine(r: CheckInResult): string {
  if (r.next_tier === null) return "Gold. You've collected this neighborhood.";
  const n = r.quests_to_next_tier;
  return `${n} more ${n === 1 ? "quest" : "quests"} here for ${TIER_LABEL[r.next_tier]}`;
}
