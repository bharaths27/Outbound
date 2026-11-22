// A quest in the hub list (DESIGN.md §5 "Quest card: hub"). Phones: a 4:3 tinted
// thumbnail on top, then title, meta (price · walk · open/closed), up to 3 vibe tags, and
// the XP chip with the player's tier. Desktop: the same content beside a 104 × 96
// thumbnail. Done quests show a stamp in the corner. The whole card is the tap target.

import type { Quest, Tier, Visit } from "@/lib/data/types";
import { Stamp, TIER_NAME } from "@/features/passport/stamp";
import { cn } from "@/lib/utils";
import { QuestOfWeekBadge } from "@/features/weekly/quest-of-the-week";
import { QuestThumb, priceSymbol } from "./category";
import { cravingLabel } from "./filter-state";
import { openState } from "./hours";

/** Price · walk time · open or closed (green when open, maroon when closed). */
export function QuestMeta({ quest, now, className }: { quest: Quest; now: Date; className?: string }) {
  const open = openState(quest.hours, now);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground", className)}>
      <span>{priceSymbol(quest.price_tier)}</span>
      <span className="tabular-nums">{quest.walk_min} min walk</span>
      {open && (
        <span className={cn("font-semibold tabular-nums", open.open ? "text-success" : "text-closed")}>{open.label}</span>
      )}
    </p>
  );
}

export function TagList({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Vibes">
      {tags.slice(0, max).map((t) => (
        <li key={t} className="rounded-full bg-sand px-2.5 py-[3px] text-xs font-semibold text-ink-2">
          {cravingLabel(t)}
        </li>
      ))}
    </ul>
  );
}

export function XpChip({ xp, className }: { xp: number; className?: string }) {
  return (
    <span className={cn("shrink-0 rounded-full bg-xp-chip px-2.5 py-[3px] text-[13px] font-bold whitespace-nowrap text-xp-chip-ink tabular-nums", className)}>
      +{xp} XP
    </span>
  );
}

export function Reward({
  xp,
  tier,
  neighborhood,
  questId,
  visit,
}: {
  xp: number;
  tier: Tier | null;
  neighborhood: string;
  questId?: string;
  /** The player's latest visit to this quest, so the Quest of the Week badge knows if it's used. */
  visit?: Visit;
}) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
      <XpChip xp={xp} />
      {questId && <QuestOfWeekBadge questId={questId} visits={visit ? [visit] : []} />}
      {tier && (
        <span>
          · {TIER_NAME[tier]} in {neighborhood}
        </span>
      )}
    </p>
  );
}

export interface QuestCardProps {
  quest: Quest;
  neighborhood: string;
  now: Date;
  tier: Tier | null;
  visit?: Visit;
  onOpen: (questId: string) => void;
}

export function QuestCard({ quest, neighborhood, now, tier, visit, onOpen }: QuestCardProps) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface text-ink",
        "has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2 has-[button:focus-visible]:outline-maroon",
        "desk:flex desk:gap-3 desk:rounded-[18px] desk:p-2.5",
      )}
    >
      <QuestThumb
        type={quest.type}
        photo={quest.photo_url}
        className="aspect-[4/3] max-h-[150px] w-full desk:aspect-auto desk:h-24 desk:w-[104px] desk:shrink-0 desk:rounded-md"
        iconSize={44}
      />
      <div className={cn("flex min-w-0 flex-col gap-2 px-3.5 pt-3 pb-3.5 desk:flex-1 desk:gap-1.5 desk:p-0", visit && "desk:pr-12")}>
        <h3 className="text-[17px] leading-6 font-bold desk:text-base">
          {/* The whole card is the tap target; the title button stretches over it. */}
          <button
            type="button"
            onClick={() => onOpen(quest.id)}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {quest.title}
          </button>
        </h3>
        <QuestMeta quest={quest} now={now} />
        <TagList tags={quest.vibe_tags} />
        <Reward xp={quest.xp} tier={tier} neighborhood={neighborhood} questId={quest.id} visit={visit} />
      </div>
      {visit && (
        <div className="pointer-events-none absolute top-2 right-2">
          <Stamp
            questId={quest.id}
            title={quest.title}
            neighborhood={neighborhood}
            stationId={quest.station_id}
            tier={tier ?? "bronze"}
            crossSchool={visit.cross_school}
            size={48}
            label={`Done, ${neighborhood} stamp`}
          />
        </div>
      )}
    </article>
  );
}
