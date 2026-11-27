// Embroidered-patch badges (the "Green Line Veteran" look from the mockups): a colored shape,
// a stitched inner edge, the name on an arc, and the icon in the middle. Locked badges are grey.

import { Map as MapIcon, Moon, TrainFront, Users, type LucideIcon } from "lucide-react";
import { useId } from "react";
import type { BadgeId } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type Shape = "circle" | "shield" | "scallop" | "hex";

export const BADGE_ART: Record<BadgeId, { name: string; how: string; icon: LucideIcon; shape: Shape; fill: string; ring: string; ink: string }> = {
  line_collector: { name: "Line Collector", how: "Check in on the Red, Orange and Green lines", icon: TrainFront, shape: "shield", fill: "#2F6B4F", ring: "#F2C14E", ink: "#FFF8EF" },
  night_owl: { name: "Night Owl", how: "Check in after 10 PM", icon: Moon, shape: "circle", fill: "#1F2A5C", ring: "#F2C14E", ink: "#FFF8EF" },
  squad_goals: { name: "Squad Goals", how: "Finish a quest with your squad", icon: Users, shape: "scallop", fill: "#6B1F33", ring: "#F2C14E", ink: "#FFF8EF" },
  cross_town: { name: "Cross-Town", how: "Visit 4 neighborhoods in one week", icon: MapIcon, shape: "hex", fill: "#B36A1F", ring: "#FFF4D6", ink: "#FFF8EF" },
};

function shapePath(shape: Shape, inset: number): string {
  const c = 60;
  const r = 56 - inset;
  if (shape === "circle") return `M${c - r} ${c}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  if (shape === "shield") {
    const k = 1 - inset / 56;
    const p = (x: number, y: number) => `${c + (x - c) * k} ${c + (y - c) * k}`;
    return `M${p(60, 4)}L${p(108, 18)}V${p(108, 58).split(" ")[1]}C${p(108, 88)} ${p(86, 108)} ${p(60, 116)}C${p(34, 108)} ${p(12, 88)} ${p(12, 58)}V${p(12, 18).split(" ")[1]}Z`;
  }
  if (shape === "hex") {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
    });
    return `M${pts.join("L")}Z`;
  }
  // scallop: 16 soft bumps
  const n = 16;
  const pts = Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI * i) / n;
    const rr = i % 2 ? r : r - 5;
    return `${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join("L")}Z`;
}

export function BadgePatch({
  id,
  locked = false,
  size = 56,
  className,
}: {
  id: BadgeId;
  locked?: boolean;
  size?: number;
  className?: string;
}) {
  const art = BADGE_ART[id];
  const arcId = `arc-${useId().replace(/:/g, "")}`;
  const Icon = art.icon;
  const fill = locked ? "#EDE5D9" : art.fill;
  const ring = locked ? "#CDBBA3" : art.ring;
  const ink = locked ? "#8C7F79" : art.ink;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={`${art.name} badge${locked ? ", locked" : ""}`}
      className={cn("shrink-0", !locked && "drop-shadow-[0_3px_4px_rgb(43_26_31/0.3)]", className)}
    >
      <defs>
        <path id={arcId} d="M24 62 A36 36 0 0 1 96 62" />
        <radialGradient id={`${arcId}-sheen`} cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity={locked ? 0 : 0.28} />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={shapePath(art.shape, 0)} fill={ring} />
      <path d={shapePath(art.shape, 4)} fill={fill} />
      <path d={shapePath(art.shape, 4)} fill={`url(#${arcId}-sheen)`} />
      <path
        d={shapePath(art.shape, 9)}
        fill="none"
        stroke={ring}
        strokeWidth="1.6"
        strokeDasharray="3.2 2.6"
        strokeLinecap="round"
        opacity={locked ? 0.9 : 0.85}
      />
      <text fill={ink} fontFamily="DM Sans, system-ui, sans-serif" fontSize="11.5" fontWeight="800" letterSpacing="1.2">
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          {art.name.toUpperCase()}
        </textPath>
      </text>
      <circle cx="60" cy="74" r="20" fill={locked ? "#E2D8C9" : "rgb(255 255 255 / .14)"} />
      <Icon x={46} y={60} width={28} height={28} color={locked ? ink : ring} strokeWidth={2.1} aria-hidden />
      {!locked && (
        <g fill={ring}>
          <path d="M60 99l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" />
        </g>
      )}
    </svg>
  );
}
