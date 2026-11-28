"use client";

// The passport stamp, Outbound's signature element (DESIGN.md §5 Stamp). Art from
// design/hifi/outbound-handoff/reference: a perforated dashed outer ring, a thin inner
// ring, the neighborhood in caps on the top arc, and a line-art landmark in the center.
// Ink by tier; earned stamps sit at a fixed per-quest tilt between −8° and +7°.
// Cross-school stamps get an extra thin gold outer ring (maroon on a gold stamp).

import { useId } from "react";
import type { QuestType, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { SCALLOP, STATION_ART, type StationArt } from "./station-art";

/** Landmark glyphs from the reference designs (drawn in a 100 × 100 box). */
const GLYPHS = {
  stadium: "M26 66h48M30 66V54h40v12M34 54l4-8h24l4 8M42 46v-6h16v6",
  common: "M38 66V52M30 52a8 8 0 1 1 16 0zM56 66V56h12v10M54 56l8-7 8 7M26 66h48",
  gate: "M28 44h44M32 50h36M36 44v22M64 44v22M44 50v16M56 50v16M30 44l-4-4h48l-4 4",
  church: "M50 32v10M46 36h8M44 66V50l6-8 6 8v16M32 66V56h12M56 56h12v10M28 66h44",
  brownstone: "M28 66V48h14v18M42 66V44h16v22M58 66V48h14v18M32 54h6M46 52h8M62 54h6",
  wheel: "M36 52a14 14 0 1 0 28 0a14 14 0 1 0 -28 0M50 38v28M36 52h28M42 68l8-16 8 16",
  houses: "M28 66V52l8-6 8 6v14M44 66V48h14v18M58 66V52l7-5 7 5v14",
  trolley: "M30 44h40v18H30zM34 48h8v6h-8zM46 48h8v6h-8zM58 48h8v6h-8zM36 62v4M64 62v4M50 44v-6",
  dome: "M34 66V54h32v12M38 54a12 12 0 0 1 24 0M50 42v-6M28 66h44",
  lighthouse: "M46 66l2-24h4l2 24M44 42h12M50 42v-6M40 66h20",
} as const;

type Glyph = keyof typeof GLYPHS;

/** A landmark per neighborhood (lowercased name contains the key); the T trolley otherwise. */
const NEIGHBORHOOD_GLYPH: [string, Glyph][] = [
  ["fenway", "stadium"],
  ["back bay", "brownstone"],
  ["chinatown", "gate"],
  ["north end", "church"],
  ["beacon hill", "dome"],
  ["downtown", "dome"],
  ["common", "common"],
  ["harvard", "church"],
  ["central", "houses"],
  ["cambridge", "dome"],
  ["seaport", "wheel"],
  ["waterfront", "lighthouse"],
  ["allston", "houses"],
  ["somerville", "houses"],
];

export function glyphFor(neighborhood: string): Glyph {
  const n = neighborhood.toLowerCase();
  return NEIGHBORHOOD_GLYPH.find(([key]) => n.includes(key))?.[1] ?? "trolley";
}

/** [ink, background, outer ring] per tier (DESIGN.md §5; bronze background is a light tint). */
const TIER_COLORS: Record<Tier | "locked", [string, string, string]> = {
  bronze: ["#A8643A", "#FBF1EA", "#A8643A"],
  silver: ["#6B7486", "#F4F5F8", "#9AA3B2"],
  gold: ["#1F4A7A", "#FFF4D6", "#D9A21B"],
  locked: ["#8C7F79", "#F3EDE3", "#B7ABA4"],
};

export const TIER_NAME: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

/** FNV-1a: a small stable hash, so a stamp's tilt never changes between renders. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Tilt between −8° and +7°, fixed per quest. */
export const stampRotation = (questId: string) => (hash(questId) % 16) - 8;

export interface StampProps {
  questId: string;
  /** Used in the accessible name of locked stamps ("Frog Pond, not collected yet"). */
  title: string;
  neighborhood: string;
  /** The quest's station. Stations with illustrated art (station-art.ts) get their own stamp. */
  stationId?: string;
  /** Kept for callers; the glyph comes from the neighborhood. */
  type?: QuestType;
  tier: Tier;
  crossSchool?: boolean;
  locked?: boolean;
  size?: number;
  /** Fixed rotation instead of the per-quest tilt (e.g. −8 for the celebration). */
  rotate?: number;
  /** Overrides the accessible name ("You have this stamp, Silver"). */
  label?: string;
  className?: string;
}

/** Stations with a hand-drawn stamp in public/stations. */
const HAND_DRAWN = new Set([
  "place-pktrm", "place-gover", "place-haecl", "place-coecl", "place-kencl", "place-bucen", "place-harsq", "place-cntsq", "place-chncl",
  "place-sstat", "place-harvd", "place-grnst", "place-knncl", "place-davis", "place-cool", "place-rbmnl", "place-qnctr",
]);

export function Stamp({
  questId,
  title,
  neighborhood,
  stationId,
  tier,
  crossSchool = false,
  locked = false,
  size = 88,
  rotate,
  label,
  className,
}: StampProps) {
  const arcId = `stamp-arc-${useId().replace(/:/g, "")}`;
  const [ink, bg, ring] = TIER_COLORS[locked ? "locked" : tier];
  const crossRing = tier === "gold" ? "#6B1F33" : "#D9A21B";
  const name =
    label ??
    (locked ? `${title}, not collected yet` : `${neighborhood} stamp, ${TIER_NAME[tier]}${crossSchool ? ", cross-school" : ""}`);
  const tilt = locked ? 0 : (rotate ?? stampRotation(questId));
  const upper = neighborhood.toUpperCase();
  const art = stationId ? STATION_ART[stationId] : undefined;

  if (art) {
    const stationName =
      label ??
      (locked
        ? `${title}, not collected yet`
        : `${titleCase(art.ribbon)} stamp, ${TIER_NAME[tier]}${crossSchool ? ", cross-school" : ""}`);
    // Hand-drawn station stamps (public/stations/<station id>.webp) replace the code-drawn art.
    if (stationId && HAND_DRAWN.has(stationId)) {
      return (
        <span
          role="img"
          aria-label={stationName}
          className={cn("relative inline-grid shrink-0 place-items-center", className)}
          style={{ width: size, height: size, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static stamp art */}
          <img
            src={`/stations/${stationId}.webp`}
            alt=""
            draggable={false}
            className={cn("max-h-full max-w-full object-contain select-none", locked ? "opacity-45 grayscale" : "drop-shadow-[0_2px_2px_rgb(43_26_31/0.25)]")}
          />
          {!locked && (
            // Tier seal (bronze star, silver two stars, gold crown) and the cross-school seal.
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/stamps/tier-${tier}.webp`} alt="" aria-hidden className="absolute -right-1 -bottom-1 drop-shadow-sm" style={{ width: size * 0.32, height: size * 0.32 }} />
              {crossSchool && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/stamps/cross-school.webp" alt="" aria-hidden className="absolute -bottom-1 -left-1 drop-shadow-sm" style={{ width: size * 0.32, height: size * 0.32 }} />
              )}
            </>
          )}
        </span>
      );
    }
    return (
      <svg
        width={size}
        height={size}
        viewBox="-4 -4 108 108"
        role="img"
        aria-label={stationName}
        className={cn("shrink-0", className)}
        style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
      >
        <StationArtwork art={art} ink={ink} bg={bg} ring={ring} locked={locked} crossSchool={crossSchool} crossRing={crossRing} uid={arcId} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="-4 -4 108 108"
      role="img"
      aria-label={name}
      className={cn("shrink-0", className)}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {crossSchool && !locked && <circle cx="50" cy="50" r="51" fill="none" stroke={crossRing} strokeWidth="1.6" />}
      <circle cx="50" cy="50" r="46" fill={bg} stroke={ring} strokeWidth="3.5" strokeDasharray="2.5 3" />
      <circle
        cx="50"
        cy="50"
        r="39"
        fill="none"
        stroke={ink}
        strokeWidth="1.4"
        strokeDasharray={locked ? "3 3" : undefined}
      />
      <path id={arcId} d="M17 54 A33 33 0 0 1 83 54" fill="none" />
      <text
        fontFamily="var(--font-dm-sans), DM Sans, sans-serif"
        fontSize={upper.length > 14 ? 7 : 9}
        fontWeight="700"
        letterSpacing="0.8"
        fill={ink}
      >
        <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
          {upper}
        </textPath>
      </text>
      <path
        d={GLYPHS[glyphFor(neighborhood)]}
        transform="translate(50 62) scale(0.72) translate(-50 -52)"
        fill="none"
        stroke={ink}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** MBTA line colors for the badges (orange darkened for white text, DESIGN.md §3). */
const LINE_BADGE: Record<string, string> = { R: "#DA291C", O: "#C46A00", G: "#00843D", B: "#003DA5" };

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Bu\b/, "BU");

/**
 * Illustrated station stamp (design/stamps): scalloped edge, double ring, the area on the
 * top arc, a two-tone landmark scene, and the station on an outlined ribbon with line badges.
 */
function StationArtwork({
  art,
  ink,
  bg,
  ring,
  locked,
  crossSchool,
  crossRing,
  uid,
}: {
  art: StationArt;
  ink: string;
  bg: string;
  ring: string;
  locked: boolean;
  crossSchool: boolean;
  crossRing: string;
  uid: string;
}) {
  const accent = locked ? ink : ring;
  const dash = locked ? "3 3" : undefined;
  const topSize = art.top.length <= 10 ? 6.6 : art.top.length <= 14 ? 6 : 5.3;
  const ribbonSize = art.ribbon.length <= 10 ? 5.6 : 5.1;
  const ribbon = "M19 64.5h62l-2.8 5.5 2.8 5.5H19l2.8-5.5z";
  const font = "var(--font-dm-sans), DM Sans, sans-serif";
  return (
    <>
      {crossSchool && !locked && <circle cx="50" cy="50" r="51.5" fill="none" stroke={crossRing} strokeWidth="1.6" />}
      <path d={SCALLOP} fill={bg} stroke={ring} strokeWidth="1.4" />
      <circle cx="50" cy="50" r="41.5" fill="none" stroke={ink} strokeWidth="1.5" strokeDasharray={dash} />
      <circle cx="50" cy="50" r="39" fill="none" stroke={ink} strokeWidth="0.6" strokeDasharray={dash} />
      <defs>
        <clipPath id={`${uid}-clip`}>
          <circle cx="50" cy="50" r="29.5" />
        </clipPath>
        <path id={`${uid}-top`} d="M19 50A31 31 0 0 1 81 50" fill="none" />
      </defs>
      <g clipPath={`url(#${uid}-clip)`} opacity={locked ? 0.55 : undefined}>
        <g transform="translate(50 66) scale(0.8) translate(-50 -66)">
          {art.scene.map(([role, d], i) =>
            role === "line" || role === "bgline" ? (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={role === "line" ? ink : bg}
                strokeWidth={role === "line" ? 1.6 : 1.1}
                strokeLinecap="round"
              />
            ) : (
              <path
                key={i}
                d={d}
                fill={role === "bg" ? bg : role === "accent" ? accent : ink}
                fillOpacity={role === "tint" ? 0.3 : undefined}
              />
            ),
          )}
        </g>
      </g>
      <text fontFamily={font} fontSize={topSize} fontWeight="700" letterSpacing="1" fill={ink}>
        <textPath href={`#${uid}-top`} startOffset="50%" textAnchor="middle">
          {art.top}
        </textPath>
      </text>
      <path d={ribbon} fill={accent} stroke={accent} strokeWidth="3.6" strokeLinejoin="round" />
      <path d={ribbon} fill={ink} stroke={bg} strokeWidth="1.5" strokeLinejoin="round" />
      <text x="50" y="71.9" fontFamily={font} fontSize={ribbonSize} fontWeight="700" letterSpacing="0.6" textAnchor="middle" fill={bg}>
        {art.ribbon}
      </text>
      {art.lines.map((line, i) => {
        const cx = 50 + (i - (art.lines.length - 1) / 2) * 7;
        return (
          <g key={line}>
            <circle cx={cx} cy="82.6" r="3" fill={locked ? ink : LINE_BADGE[line]} />
            <text x={cx} y="84.4" fontFamily={font} fontSize="4.6" fontWeight="700" textAnchor="middle" fill="#fff">
              {line}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Three dots under a stamp: earned tiers in gold, the rest muted (DESIGN.md §5). */
export function TierDots({ tier, className }: { tier: Tier | null; className?: string }) {
  const earned = tier === "gold" ? 3 : tier === "silver" ? 2 : tier === "bronze" ? 1 : 0;
  return (
    <span className={cn("flex gap-1", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("size-1.5 rounded-full", i < earned ? "bg-stamp-dot-on" : "bg-stamp-dot-off")} />
      ))}
    </span>
  );
}
