// A quest in the hub list (DESIGN.md "Quest card"): photo, title, one meta row, up to
// three vibe tags, and the reward. Done quests show their stamp in the corner.

import { Camera, Footprints, Ticket, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Stamp } from "@/features/passport/stamp";
import type { Quest, QuestType, Tier, Visit } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { budgetLabel, cravingLabel } from "./filter-state";
import { openState } from "./hours";

export const TYPE_ICON: Record<QuestType, LucideIcon> = {
  food: UtensilsCrossed,
  event: Ticket,
  scenic: Camera,
};

const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
const TIER_DOT: Record<Tier, string> = { bronze: "bg-tier-bronze", silver: "bg-tier-silver", gold: "bg-tier-gold" };

/** Category, price, walk time, and open or closed, on one line. */
export function QuestMeta({ quest, now, className }: { quest: Quest; now: Date; className?: string }) {
  const Icon = TYPE_ICON[quest.type];
  const open = openState(quest.hours, now);
  return (
    <p className={cn("type-small flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground", className)}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        {cravingLabel(quest.type)}
      </span>
      <span aria-hidden>·</span>
      <span>{budgetLabel(quest.price_tier)}</span>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Footprints className="size-4" strokeWidth={1.75} aria-hidden />
        {quest.walk_min} min walk
      </span>
      {open && (
        <>
          <span aria-hidden>·</span>
          <span className={cn("tabular-nums", open.open ? "text-foreground" : "text-destructive")}>{open.label}</span>
        </>
      )}
    </p>
  );
}

export function TagList({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Vibes">
      {tags.slice(0, max).map((t) => (
        <li key={t}>
          <Badge variant="secondary">{cravingLabel(t)}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function Reward({ xp, tier, neighborhood }: { xp: number; tier: Tier | null; neighborhood: string }) {
  return (
    <p className="type-small flex items-center gap-2">
      <span className="font-semibold text-xp tabular-nums">+{xp} XP</span>
      {tier && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <span aria-hidden className={cn("size-2 rounded-full", TIER_DOT[tier])} />
          {TIER_LABEL[tier]} in {neighborhood}
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
    <Card className="relative gap-3 py-4 has-[button:focus-visible]:ring-3 has-[button:focus-visible]:ring-ring/50">
      {quest.photo_url && (
        <div className="px-4">
          {/* Remote photos come from the content team; next/image needs their hosts configured first. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={quest.photo_url} alt="" className="aspect-[4/3] w-full rounded-md object-cover" loading="lazy" />
        </div>
      )}
      {/* Room on the right for the corner stamp. */}
      <div className={cn("flex flex-col gap-2 px-4", visit && "pr-16")}>
        <h3 className="type-heading">
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
        <Reward xp={quest.xp} tier={tier} neighborhood={neighborhood} />
      </div>
      {visit && (
        <div className="pointer-events-none absolute top-3 right-3" title="Done">
          <Stamp
            questId={quest.id}
            title={quest.title}
            neighborhood={neighborhood}
            type={quest.type}
            tier={tier ?? "bronze"}
            crossSchool={visit.cross_school}
            size={48}
          />
        </div>
      )}
    </Card>
  );
}
