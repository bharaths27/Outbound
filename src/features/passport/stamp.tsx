// The passport stamp: the one bold element in Outbound (DESIGN.md, "The stamp").
// Serrated SVG edge in tier ink with a faint ink texture, the neighborhood set on an arc,
// a fixed per-quest rotation, a gold outer ring for cross-school stamps, and a dashed
// outline for stamps not collected yet.

import { Lock, Mountain, Ticket, Utensils, type LucideIcon } from "lucide-react";
import type { QuestType, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<QuestType, LucideIcon> = { food: Utensils, event: Ticket, scenic: Mountain };
const TIER_INK: Record<Tier, string> = {
  bronze: "text-tier-bronze",
  silver: "text-tier-silver",
  gold: "text-tier-gold",
};

/** FNV-1a: a small stable hash, so rotation and texture never change between renders. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Rotation between -6° and 6°, fixed per quest. */
export const stampRotation = (questId: string) => ((hash(questId) % 1201) / 100) - 6;

function serratedEdge(teeth: number, outer: number, inner: number, c = 60): string {
  const points: string[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / teeth;
    points.push(`${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${points.join(" L ")} Z`;
}

const EDGE = serratedEdge(36, 55, 52);

export interface StampProps {
  questId: string;
  title: string; // used for the accessible name; the UI shows it next to the stamp
  neighborhood: string;
  type?: QuestType;
  tier: Tier;
  crossSchool?: boolean;
  locked?: boolean;
  size?: number;
  className?: string;
}

export function Stamp({
  questId,
  title,
  neighborhood,
  type = "scenic",
  tier,
  crossSchool = false,
  locked = false,
  size = 112,
  className,
}: StampProps) {
  const Icon = locked ? Lock : TYPE_ICON[type];
  const id = `stamp-${questId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const label = locked
    ? `${title}, not collected yet`
    : `${title} stamp, ${tier} tier${crossSchool ? ", cross-school" : ""}`;

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={cn("shrink-0", locked ? "text-muted-foreground" : TIER_INK[tier], className)}
      style={{ transform: `rotate(${stampRotation(questId)}deg)` }}
    >
      <defs>
        <path id={`${id}-arc`} d="M 21 62 A 39 39 0 0 1 99 62" fill="none" />
        {!locked && (
          // Knocks small speckles out of the ink so it reads as stamped, not printed.
          <filter id={`${id}-ink`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={hash(questId) % 97} result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 2.4" result="speckle" />
            <feComposite in="SourceGraphic" in2="speckle" operator="in" />
          </filter>
        )}
      </defs>

      {crossSchool && !locked && <circle cx="60" cy="60" r="58.5" fill="none" className="stroke-gold" strokeWidth="3" />}

      <g filter={locked ? undefined : `url(#${id}-ink)`} fill="none" stroke="currentColor">
        {locked ? (
          <circle cx="60" cy="60" r="54" className="stroke-border" strokeWidth="1.5" strokeDasharray="4 4" />
        ) : (
          <>
            <path d={EDGE} strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx="60" cy="60" r="46" strokeWidth="1.5" />
          </>
        )}
        <text fill="currentColor" stroke="none" fontSize="10" fontWeight="700" letterSpacing="0.6">
          <textPath href={`#${id}-arc`} startOffset="50%" textAnchor="middle">
            {neighborhood}
          </textPath>
        </text>
        <Icon x={43} y={56} width={34} height={34} strokeWidth={1.75} aria-hidden />
      </g>
    </svg>
  );
}
