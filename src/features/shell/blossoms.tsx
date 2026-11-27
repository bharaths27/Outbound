// A small cherry-blossom branch for maroon headers (decorative, from the Boston-spring mockups).

import { cn } from "@/lib/utils";

const FLOWERS: [number, number, number][] = [
  [22, 20, 1], [46, 12, 0.8], [62, 30, 1.1], [86, 18, 0.75], [38, 40, 0.7], [104, 34, 0.9],
];

function Flower({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-5.2" rx="4.2" ry="5.6" transform={`rotate(${a})`} fill="#F7B8C9" stroke="#E98AA6" strokeWidth=".6" />
      ))}
      <circle r="2.1" fill="#F2C14E" />
    </g>
  );
}

export function Blossoms({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 52" aria-hidden className={cn("pointer-events-none select-none", className)}>
      <path d="M0 44 C 30 40, 52 30, 70 28 S 104 22, 120 14" fill="none" stroke="#3B1019" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
      <path d="M44 34 C 46 24, 50 18, 56 14" fill="none" stroke="#3B1019" strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
      {FLOWERS.map(([x, y, s], i) => (
        <Flower key={i} x={x} y={y} s={s} />
      ))}
    </svg>
  );
}
