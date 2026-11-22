"use client";

// Quest detail (DESIGN.md §6 Quest detail, §7 desktop). Two layouts:
// - "panel": inside the station hub. One column, "All quests" back link, and a sticky gold
//   Check in bar at the bottom of the hub's scroll area.
// - "page": /q/[questId]. Phones: a full-bleed photo with the content on a rounded sheet
//   over it and a sticky Check in bar. Desktop: a main column (16:9 photo, 44 px title,
//   hours and time cards side by side) and a sticky side column (stamp, reward, Check in,
//   distance note, student deals).

import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CheckInButton } from "@/features/checkin";
import { Stamp, TIER_NAME } from "@/features/passport/stamp";
import { data } from "@/lib/data";
import type { Deal, Quest, Station } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { CATEGORY, QuestThumb, priceSymbol } from "./category";
import { budgetLabel } from "./filter-state";
import { openState, scheduleRows } from "./hours";
import { LineLetter, groupLines } from "./line-badge";
import { TagList, XpChip } from "./quest-card";
import { lastVisit, type Player } from "./use-player";

export interface QuestDetailProps {
  quest: Quest;
  station: Station;
  player: Player;
  now: Date;
  /** Inside the hub: shown as "All quests". */
  onBack?: () => void;
  /** Called after a successful check-in, so the caller can reload progress. */
  onCheckedIn?: () => void;
  /** On the full page: the station link ("Copley · Back Bay"). */
  stationHref?: string;
}

export function QuestDetail({ quest, station, player, now, onBack, onCheckedIn, stationHref }: QuestDetailProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const page = Boolean(stationHref);
  const visit = lastVisit(player, quest.id);
  const hood = player.passport.find((p) => p.neighborhood === station.neighborhood) ?? null;
  const tier = hood?.tier ?? null;

  useEffect(() => {
    let cancelled = false;
    data
      .getDeals([quest.id])
      .then((d) => !cancelled && setDeals(d))
      .catch(() => {}); // deals are optional extras
    return () => {
      cancelled = true;
    };
  }, [quest.id]);

  const rewardText = !hood ? (
    <>
      and your first stamp in <b>{station.neighborhood}</b>
    </>
  ) : hood.next_tier ? (
    <>
      and progress toward{" "}
      <b>
        {TIER_NAME[hood.next_tier]} in {station.neighborhood}
      </b>
    </>
  ) : (
    <>
      for your <b>Gold {station.neighborhood}</b> passport
    </>
  );

  const stamp = visit ? (
    <Stamp
      questId={quest.id}
      title={quest.title}
      neighborhood={station.neighborhood}
      stationId={quest.station_id}
      tier={tier ?? "bronze"}
      crossSchool={visit.cross_school}
      size={page ? 96 : 64}
      rotate={-8}
      label={`You have this stamp, ${TIER_NAME[tier ?? "bronze"]}`}
    />
  ) : null;

  const checkIn = (
    <CheckInButton quest={quest} profile={player.profile} tier={tier} now={now} onCheckedIn={onCheckedIn} />
  );

  const titleBlock = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className={cn("font-display leading-[1.1] font-bold text-maroon", page ? "text-[30px] desk:text-[44px]" : "text-[28px]")}>
          {quest.title}
        </h2>
        <StationLine station={station} href={stationHref} />
      </div>
      {/* On the desktop page the stamp lives in the side column. */}
      <div className={page ? "desk:hidden" : undefined}>{stamp}</div>
    </div>
  );

  const body = (
    <>
      <Meta quest={quest} now={now} />
      {quest.description && <p className="max-w-[70ch] text-[15px] leading-[1.55] text-ink-2">{quest.description}</p>}
      <TagList tags={quest.vibe_tags} max={6} />
    </>
  );

  const hoursCard = <HoursCard quest={quest} now={now} />;
  const timeLine = <TimeLine quest={quest} />;
  const dealsBox = deals.length > 0 && <DealsBox deals={deals} />;
  const reward = (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-3.5 py-3 text-sm text-ink-2">
      <XpChip xp={quest.xp} className="text-sm" />
      <span>{rewardText}</span>
    </div>
  );

  // ---------- inside the hub ----------
  if (!page) {
    return (
      <article className="flex flex-col gap-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-maroon"
          >
            <ArrowLeft className="size-[18px]" aria-hidden />
            All quests
          </button>
        )}
        <QuestThumb type={quest.type} photo={quest.photo_url} className="aspect-[4/3] max-h-[200px] w-full rounded-xl" iconSize={64} />
        {titleBlock}
        {body}
        <section className="rounded-[18px] border border-border bg-surface px-4 py-3.5">
          {hoursCard}
          <div className="mt-3">{timeLine}</div>
        </section>
        {dealsBox}
        {reward}
        <StickyCheckIn>{checkIn}</StickyCheckIn>
      </article>
    );
  }

  // ---------- full page ----------
  return (
    <article className="desk:mx-auto desk:flex desk:max-w-[1360px] desk:flex-wrap desk:gap-6 desk:px-8 desk:pt-6 desk:pb-10">
      <div className="min-w-0 desk:flex-[999_1_600px]">
        <QuestThumb
          type={quest.type}
          photo={quest.photo_url}
          className="aspect-[4/3] max-h-[230px] w-full desk:aspect-video desk:max-h-[420px] desk:rounded-2xl"
          iconSize={72}
        />
        <div className="relative -mt-5 flex flex-col gap-4 rounded-t-[22px] bg-background px-4 pt-5 pb-6 shadow-[0_2px_15px_4px_rgb(74_20_36/0.26)] desk:mt-6 desk:rounded-none desk:bg-transparent desk:p-0 desk:shadow-none">
          {titleBlock}
          {body}
          <div className="grid gap-4 desk:grid-cols-2">
            <section className="rounded-[18px] border border-border bg-surface px-4 py-3.5">{hoursCard}</section>
            <section className="rounded-[18px] border border-border bg-surface px-4 py-3.5">
              <h3 className="mb-1 text-[15px] font-bold">Time</h3>
              {timeLine}
            </section>
          </div>
          <div className="flex flex-col gap-4 desk:hidden">
            {dealsBox}
            {reward}
          </div>
        </div>
      </div>

      {/* Desktop side column */}
      <aside className="hidden desk:flex desk:flex-[1_1_340px] desk:flex-col desk:gap-4 desk:self-start desk:sticky desk:top-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-center">
          {stamp ? (
            <>
              {stamp}
              <p className="text-sm text-ink-2">
                You have this stamp · <b>{TIER_NAME[tier ?? "bronze"]} in {station.neighborhood}</b>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Check in to collect this stamp.</p>
          )}
          {reward}
          <div className="w-full">{checkIn}</div>
          <p className="text-[13px] text-muted-foreground">You&apos;ll need to be within {quest.checkin_radius_m} m.</p>
        </div>
        {dealsBox}
      </aside>

      <div className="px-4 desk:hidden">
        <StickyCheckIn>{checkIn}</StickyCheckIn>
      </div>
    </article>
  );
}

function StationLine({ station, href }: { station: Station; href?: string }) {
  const lines = groupLines(station.lines);
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-2">
      {lines.map((g) => (
        <LineLetter key={g.line} line={g.line} />
      ))}
      {href ? (
        <Link href={href} className="font-semibold text-maroon underline-offset-4 hover:underline">
          {station.name}
        </Link>
      ) : (
        <span className="font-semibold">{station.name}</span>
      )}
      <span aria-hidden>·</span>
      <span>{station.neighborhood}</span>
    </div>
  );
}

function Meta({ quest, now }: { quest: Quest; now: Date }) {
  const open = openState(quest.hours, now);
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-2">
      <span>{CATEGORY[quest.type].label}</span>
      <span>
        {priceSymbol(quest.price_tier)}
        {quest.price_tier > 0 && ` · ${budgetLabel(quest.price_tier)}`}
      </span>
      <span className="tabular-nums">{quest.walk_min} min walk</span>
      {open && <span className={cn("font-bold tabular-nums", open.open ? "text-success" : "text-closed")}>{open.label}</span>}
    </p>
  );
}

function HoursCard({ quest, now }: { quest: Quest; now: Date }) {
  const rows = scheduleRows(quest.hours, now);
  return (
    <>
      <h3 className="mb-1 text-[15px] font-bold">Hours</h3>
      {rows ? (
        <ul className="text-sm">
          {rows.map((r) => (
            <li
              key={r.days}
              className="flex justify-between gap-3 border-b border-sand py-1.5 last:border-b-0"
              aria-current={r.today ? "date" : undefined}
            >
              <span className={r.today ? "font-bold" : "font-medium"}>
                {r.days}
                {r.today && <span className="sr-only"> (today)</span>}
              </span>
              <span className={cn("tabular-nums", r.today ? "font-bold text-ink" : "text-muted-2")}>{r.time}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Hours not listed. Check before you go.</p>
      )}
    </>
  );
}

function TimeLine({ quest }: { quest: Quest }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-2">
      <Clock className="size-[18px] shrink-0 text-maroon" strokeWidth={2} aria-hidden />
      <span className="tabular-nums">
        About {quest.duration_min} min there, {quest.walk_min} min walk each way
      </span>
    </p>
  );
}

function DealsBox({ deals }: { deals: Deal[] }) {
  return (
    <section aria-label="Student deals" className="rounded-[18px] border border-[#F0D58E] bg-[#FFF4D6] px-4 pt-3.5 pb-1.5">
      <h3 className="mb-1.5 text-[15px] font-bold">Student deals</h3>
      <ul>
        {deals.map((d) => (
          <li key={d.id} className="flex items-center gap-2.5 border-t border-dashed border-border-strong py-2.5">
            <span className="flex-1 text-sm">{d.text.replace(/^SAMPLE:\s*/i, "")}</span>
            {d.is_sample && (
              <span className="rounded-md bg-sample px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] text-sample-foreground uppercase">
                Sample
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Paper bar pinned to the bottom of the scroll area, holding the gold Check in button. */
function StickyCheckIn({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-divider bg-paper px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] desk:-mx-6 desk:px-6">
      {children}
    </div>
  );
}
