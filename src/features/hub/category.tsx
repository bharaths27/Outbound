// Quest categories: label, tint, ink, and icon (DESIGN.md §3 "Quest categories").
// Icon paths come from the reference designs (24 × 24).

import type { PriceTier, QuestType } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export const CATEGORY: Record<QuestType, { label: string; tint: string; ink: string; d: string }> = {
  food: {
    label: "Food",
    tint: "bg-cat-food",
    ink: "text-cat-food-ink",
    d: "M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-3.5 4-3.5 8h3.5",
  },
  event: { label: "Event", tint: "bg-cat-event", ink: "text-cat-event-ink", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  scenic: { label: "Scenery", tint: "bg-cat-scenery", ink: "text-cat-scenery-ink", d: "M3 19l6-9 4 5 2-3 6 7zM16 7a2 2 0 1 0 0-.01" },
};

export function CategoryIcon({ type, size = 24, className }: { type: QuestType; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(CATEGORY[type].ink, className)}
    >
      <path d={CATEGORY[type].d} />
    </svg>
  );
}

/** Tinted placeholder with the category icon, until quests have photos (DESIGN.md §5). */
export function QuestThumb({
  type,
  photo,
  className,
  iconSize = 44,
}: {
  type: QuestType;
  photo: string | null;
  className?: string;
  iconSize?: number;
}) {
  if (photo) {
    // Remote photos come from the content team; next/image needs their hosts configured first.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" loading="lazy" className={cn("object-cover", className)} />;
  }
  return (
    <div className={cn("flex items-center justify-center", CATEGORY[type].tint, className)}>
      <CategoryIcon type={type} size={iconSize} />
    </div>
  );
}

/** "Free", "$", "$$", "$$$" for the meta row; the budget filter keeps its dollar ranges. */
export function priceSymbol(tier: PriceTier): string {
  return tier === 0 ? "Free" : "$".repeat(tier);
}
