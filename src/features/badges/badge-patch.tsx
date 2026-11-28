// Badge art: Verna's embroidered patches (public/badges/<id>.webp), with names and how to earn
// them. Locked badges show greyed out; "coming soon" ones can't be earned yet.

import type { BadgeId } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const BADGE_ART: Record<BadgeId, { name: string; how: string }> = {
  first_stop: { name: "First Stop", how: "Check in for the first time" },
  line_collector: { name: "Line Collector", how: "Check in on the Red, Orange, Green and Blue lines" },
  night_owl: { name: "Night Owl", how: "Check in after 10 PM on 3 different nights" },
  early_bird: { name: "Early Bird", how: "Check in before 8 AM on 3 different days" },
  cross_town: { name: "Cross-Town", how: "Visit 4 neighborhoods in one week" },
  squad_goals: { name: "Squad Goals", how: "Finish 3 quests with your squad" },
  critic: { name: "Critic", how: "Write 10 rated reviews with notes" },
  free_food_finder: { name: "Free Food Finder", how: "Check in at 5 free-food student events" },
  week_on_the_t: { name: "Week on the T", how: "Keep a 7-day check-in streak" },
  green_line_veteran: { name: "Green Line Veteran", how: "Do quests past the split on the B, C, D and E branches" },
  bridge_builder: { name: "Bridge Builder", how: "Check in 5 times with a squad-mate from another school" },
  weekly_regular: { name: "Weekly Regular", how: "Finish the Quest of the Week 4 weeks in a row" },
  taste_maker: { name: "Taste Maker", how: "Get 10 likes on one of your reviews" },
  snow_day: { name: "Snow Day", how: "Check in while it's snowing in Boston" },
  passport_complete: { name: "Passport Complete", how: "Earn a stamp in every neighborhood" },
  host_with_the_most: { name: "Host with the Most", how: "Host an event that 10 people check in to" },
  boston_local: { name: "Boston Local", how: "Reach Gold in 3 neighborhoods" },
  month_on_the_t: { name: "Month on the T", how: "Keep a 30-day check-in streak" },
};

export const BADGE_ORDER = Object.keys(BADGE_ART) as BadgeId[];

export function BadgePatch({ id, locked = false, size = 56, className }: { id: BadgeId; locked?: boolean; size?: number; className?: string }) {
  const art = BADGE_ART[id];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static badge art
    <img
      src={`/badges/${id}.webp`}
      alt={`${art.name} badge${locked ? ", locked" : ""}`}
      draggable={false}
      style={{ height: size, width: "auto" }}
      className={cn(
        "shrink-0 object-contain select-none",
        locked ? "opacity-40 grayscale" : "drop-shadow-[0_3px_4px_rgb(43_26_31/0.3)]",
        className,
      )}
    />
  );
}
