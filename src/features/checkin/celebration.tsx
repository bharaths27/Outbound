"use client";

// The check-in celebration (DESIGN.md §8.5; reference check-in-success.html): maroon,
// full-screen on phones and a 520 px dialog on desktop. The stamp drops in and lands at
// −8°, the tier ring fills, the eyebrow says "Tier up" or "First stamp", XP counts up while
// the bonus lines appear, then the next-tier and level lines. A requestAnimationFrame clock
// drives the pure timeline in sequence.ts; Skip (or a tap) jumps to the end, and reduced
// motion starts there with a fade.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Stamp } from "@/features/passport/stamp";
import { DateStamp } from "@/features/passport/date-stamp";
import type { CheckInResult, Quest, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { REASON_LABEL, TIER_LABEL, TOTAL_MS, frameAt, summary } from "./sequence";

const RING = 176;
const STROKE = 6;
const RADIUS = (RING - STROKE * 2) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Tier ring colors on maroon (lighter than the stamp inks so they read on the dark background). */
const RING_ON_MAROON: Record<Tier, string> = { bronze: "#E0A878", silver: "#C9D0DC", gold: "#F2C14E" };

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

/** Milliseconds since mount, until TOTAL_MS. `skip()` jumps to the end. */
function useTimeline(reduced: boolean): { t: number; skip: () => void } {
  const [t, setT] = useState(reduced ? TOTAL_MS : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(TOTAL_MS, now - start);
      setT(elapsed);
      if (elapsed < TOTAL_MS) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [reduced]);

  return {
    t: reduced ? TOTAL_MS : t,
    skip: () => {
      cancelAnimationFrame(frame.current);
      setT(TOTAL_MS);
    },
  };
}

export interface CelebrationProps {
  quest: Quest;
  result: CheckInResult;
  /** The player's tier in this neighborhood before the check-in (null if it's new). */
  prevTier: Tier | null;
  /** Squad name for the squad bonus line ("Squad bonus · Night Owls"), if any. */
  squadName?: string;
  /** The buttons (See your passport / Done), rendered under the summary. */
  actions: React.ReactNode;
  /** Shown under the XP lines once they're in, e.g. the "+N OUT ready to claim" link. */
  reward?: React.ReactNode;
  /** Renders the accessible title; the dialog supplies its own Title component. */
  renderTitle: (text: string) => React.ReactNode;
}

export function Celebration({ quest, result, prevTier, squadName, actions, reward, renderTitle }: CelebrationProps) {
  const reduced = usePrefersReducedMotion();
  const { t, skip } = useTimeline(reduced);
  const f = frameAt(t, result, prevTier);
  const s = f.stamp; // 0 → 1 with a small overshoot

  const firstStamp = prevTier === null;
  const eyebrow = f.tierUp ? "Tier up" : firstStamp ? "First stamp" : "Checked in";
  const headline = f.tierUp
    ? `${TIER_LABEL[result.tier]} in ${result.neighborhood}`
    : firstStamp
      ? `First stamp in ${result.neighborhood}`
      : quest.title;
  const show = (visible: boolean) =>
    cn("transition-[opacity,transform] duration-300 ease-out", visible ? "opacity-100" : "translate-y-1.5 opacity-0");

  return (
    <div
      className={cn("flex flex-col items-center gap-3.5 text-center", reduced && "animate-in fade-in-0 duration-200")}
      onPointerDown={f.done ? undefined : skip}
    >
      {/* Screen readers get the outcome at once, not the count-up. */}
      <p className="sr-only" aria-live="assertive">
        {summary(result, prevTier)}
      </p>

      <div className="flex min-h-9 w-full justify-end">
        {!f.done && (
          <button type="button" onClick={skip} className="min-h-9 px-3 text-sm font-semibold text-on-maroon-muted">
            Skip
          </button>
        )}
      </div>

      <div className="relative grid place-items-center" style={{ width: RING, height: RING }} aria-hidden>
        <svg width={RING} height={RING} className="absolute inset-0 -rotate-90">
          <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth={STROKE} />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke={RING_ON_MAROON[f.ringTier]}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - f.ring)}
          />
        </svg>
        {/* ob-drop: falls from above, tilted and enlarged, overshoots, lands at −8°. */}
        <div
          className="flex rounded-full bg-background"
          style={{
            opacity: f.stampOpacity,
            transform: `translateY(${-140 * (1 - s)}px) rotate(${-30 + 22 * s}deg) scale(${1.3 - 0.3 * Math.min(s, 1)})`,
          }}
        >
          <Stamp
            questId={quest.id}
            title={quest.title}
            neighborhood={result.neighborhood}
            stationId={quest.station_id}
            tier={result.tier}
            crossSchool={result.cross_school}
            size={128}
            rotate={0}
          />
        </div>
        {/* The dated rubber stamp lands once the stamp has. */}
        <span className={cn("absolute -right-6 bottom-0", t >= 700 ? "ob-date-press" : "opacity-0")}>
          <DateStamp at={new Date()} onMaroon />
        </span>
      </div>

      <div className={cn("flex flex-col items-center gap-1", show(t >= 450))}>
        <p className="text-xs font-bold tracking-[0.12em] text-gold uppercase">{eyebrow}</p>
        {renderTitle(headline)}
      </div>

      <p className="font-display text-5xl leading-none font-bold text-gold tabular-nums" aria-hidden>
        +{f.xp} XP
      </p>

      <ul className="flex w-full flex-col gap-1.5 rounded-2xl bg-white/8 px-4 py-3 text-[15px]" aria-hidden>
        {result.xp_breakdown.map((line, i) => (
          <li key={line.reason} className={cn("flex justify-between gap-3", show(i < f.lines))}>
            <span>
              {REASON_LABEL[line.reason]}
              {line.reason === "squad" && squadName && ` · ${squadName}`}
            </span>
            <b className="tabular-nums">+{line.xp}</b>
          </li>
        ))}
      </ul>

      {reward && <div className={cn("w-full", show(f.done))}>{reward}</div>}

      <p className={cn("text-sm leading-relaxed text-on-maroon-muted", show(f.done))} aria-hidden>
        {result.next_tier === null ? (
          <>
            <b className="text-gold">Gold.</b> You&apos;ve collected this neighborhood.
          </>
        ) : (
          <>
            {result.quests_to_next_tier} more {result.quests_to_next_tier === 1 ? "quest" : "quests"} here for{" "}
            <b className="text-gold">{TIER_LABEL[result.next_tier]}</b>
          </>
        )}
        <br />
        <span className="tabular-nums">
          Level {result.level} · {result.xp_to_next_level} XP to level {result.level + 1}
        </span>
      </p>

      <div className="mt-2 flex w-full flex-col gap-2.5 desk:flex-row-reverse">{actions}</div>
    </div>
  );
}
