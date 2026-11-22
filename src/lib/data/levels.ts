// Level progress for the XP bars. profiles.level and xp_to_next_level come from the backend
// (generated columns); the bars also need the size of one level, which the backend doesn't
// send yet (asked in docs/requests-for-others.md). Until it does, this mirrors the backend's
// 250 XP per level in one place.

import type { Profile } from "./types";

export const XP_PER_LEVEL = 250;

/** XP earned into the current level and the share of the way to the next (0–1). */
export function levelProgress(profile: Pick<Profile, "xp_to_next_level">): { into: number; pct: number } {
  const into = Math.max(0, XP_PER_LEVEL - profile.xp_to_next_level);
  return { into, pct: Math.min(1, into / XP_PER_LEVEL) };
}
