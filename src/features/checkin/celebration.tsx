"use client";

// The check-in celebration (DESIGN.md "Motion"): the stamp lands, XP counts up with its
// breakdown, and the neighborhood ring fills. A requestAnimationFrame clock drives the
// pure timeline in sequence.ts. Tap to skip; with reduced motion it fades in at the end.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Stamp } from "@/features/passport/stamp";
import type { CheckInResult, Quest, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { REASON_LABEL, TIER_LABEL, TOTAL_MS, frameAt, nextTierLine, summary } from "./sequence";

const RING_SIZE = 168;
const RING_WIDTH = 6;
const RADIUS = (RING_SIZE - RING_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TIER_VAR: Record<Tier, string> = {
  bronze: "var(--tier-bronze)",
  silver: "var(--tier-silver)",
  gold: "var(--tier-gold)",
};

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
}

export function Celebration({ quest, result, prevTier }: CelebrationProps) {
  const reduced = usePrefersReducedMotion();
  const { t, skip } = useTimeline(reduced);
  const f = frameAt(t, result, prevTier);
  const drop = 1 - f.stamp; // 1 at the start, 0 when landed (negative while overshooting)

  return (
    <div
      className={cn("flex flex-col items-center gap-5 text-center", reduced && "animate-in fade-in-0 duration-150")}
      onPointerDown={f.done ? undefined : skip}
    >
      {/* Screen readers get the outcome at once, not the count-up. */}
      <p className="sr-only" aria-live="assertive">
        {summary(result, prevTier)}
      </p>

      <div className="relative grid place-items-center" style={{ width: RING_SIZE, height: RING_SIZE }} aria-hidden>
        <svg width={RING_SIZE} height={RING_SIZE} className="absolute inset-0 -rotate-90">
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS} fill="none" stroke="var(--border)" strokeWidth={RING_WIDTH} />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={TIER_VAR[f.ringTier]}
            strokeWidth={RING_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - f.ring)}
          />
        </svg>
        <div
          style={{
            opacity: f.stampOpacity,
            transform: `translateY(${-48 * Math.max(0, drop)}px) scale(${1 + 0.5 * drop})`,
          }}
        >
          <Stamp
            questId={quest.id}
            title={quest.title}
            neighborhood={result.neighborhood}
            type={quest.type}
            tier={result.tier}
            crossSchool={result.cross_school}
            size={128}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1" aria-hidden>
        <p className="type-display text-xp tabular-nums">+{f.xp} XP</p>
        <ul className="type-small flex flex-col items-center gap-0.5 text-muted-foreground">
          {result.xp_breakdown.slice(0, f.lines).map((line) => (
            <li key={line.reason} className="tabular-nums">
              {REASON_LABEL[line.reason]} <span className="text-foreground">+{line.xp}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col items-center gap-1" aria-hidden>
        {f.tierUp && f.done ? (
          <p className="type-heading">
            {TIER_LABEL[result.tier]} in {result.neighborhood}
          </p>
        ) : prevTier === null ? (
          <p className="type-heading">First stamp in {result.neighborhood}</p>
        ) : null}
        <p className="type-small text-muted-foreground">{nextTierLine(result)}</p>
        <p className="type-small text-muted-foreground tabular-nums">
          Level {result.level} · {result.xp_to_next_level} XP to level {result.level + 1}
        </p>
      </div>

      {!f.done && <p className="type-tiny text-muted-foreground">Tap to skip</p>}
    </div>
  );
}
