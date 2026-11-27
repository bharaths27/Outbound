// Sample reviews, likes and comments for the social profile demo. Built from each player's
// seeded visits, so every review is for a place they really checked in at. All labeled sample.

import type { Review, ReviewComment, SavedPlace, Visit } from "@/lib/types";

const NOTES = [
  "Went right before close and had it almost to myself. Worth the walk from the T.",
  "Smaller than I expected but the vibe is so good. Bringing friends next time.",
  "Honestly a hidden gem. Got there on the Green Line in like 15 minutes.",
  "Super cute spot for a study break. Lines get long on weekends though.",
  "Not my favorite, but the view alone makes it worth one visit.",
  "Came for the quest, stayed for two hours. 10/10 would ride the T again.",
  "Cheap, fast, and actually good. Perfect after a long lab.",
  "Golden hour here is unreal. Take the photo from the left side.",
];
// Each reviewer reviews their first N visits, with ratings that look like a real person's.
const REVIEWERS: Record<string, number[]> = {
  "demo-maya": [9.2, 8.4, 7.1, 9.6, 6.3, 8.8, 7.9],
  "u-neu-1": [8.1, 9.4, 6.8, 7.5],
  "u-bu-3": [9.0, 7.7, 8.6],
  "u-mit-1": [7.2, 8.9, 9.3],
  "u-neu-3": [6.9, 8.2],
  "u-emr-1": [9.8, 7.4, 8.0],
  "u-hvd-1": [8.7, 6.5],
  "demo-jordan": [8.3, 9.1],
};

export function buildSocial(visits: Visit[], titleOf: (questId: string) => string) {
  const reviews: Review[] = [];
  for (const [user, scores] of Object.entries(REVIEWERS)) {
    const mine = visits
      .filter((v) => v.user_id === user)
      .sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at));
    const seenQuest = new Set<string>();
    let i = 0;
    for (const v of mine) {
      if (i >= scores.length) break;
      if (seenQuest.has(v.quest_id)) continue;
      seenQuest.add(v.quest_id);
      reviews.push({
        id: `rv-${user}-${i}`,
        user_id: user,
        quest_id: v.quest_id,
        place_name: titleOf(v.quest_id),
        place_address: null,
        lat: null,
        lon: null,
        rating: scores[i],
        note: NOTES[(i * 3 + user.length) % NOTES.length],
        visited_on: v.visit_date,
        source: "outbound",
        created_at: v.checked_in_at,
      });
      i++;
    }
  }
  const likes: { review_id: string; user_id: string }[] = [];
  const likers = ["u-neu-1", "u-bu-3", "demo-maya", "u-mit-1", "u-emr-1", "demo-jordan", "u-neu-3"];
  reviews.forEach((r, i) => {
    for (let k = 0; k < (i * 7) % 5; k++) {
      const u = likers[(i + k) % likers.length];
      if (u !== r.user_id) likes.push({ review_id: r.id, user_id: u });
    }
  });
  const comments: ReviewComment[] = [];
  const LINES = ["Adding this to my list!", "Wait this is so close to my dorm", "Going this weekend, who's in?", "The photo spot tip is elite", "Agree, slept on"];
  reviews.forEach((r, i) => {
    if (i % 3 !== 0) return;
    const u = likers[(i + 2) % likers.length];
    if (u === r.user_id) return;
    comments.push({ id: `cm-${i}`, review_id: r.id, user_id: u, text: LINES[i % LINES.length], created_at: r.created_at });
  });
  const saved: SavedPlace[] = [];
  return { reviews, likes, comments, saved };
}

/** Want-to-visit lists for a few players (quests they haven't been to). */
export const SAVED_SEED: Record<string, number> = { "demo-maya": 4, "u-neu-1": 3, "u-bu-3": 2, "demo-sam": 2 };
