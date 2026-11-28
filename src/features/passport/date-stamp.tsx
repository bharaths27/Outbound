// A rubber date stamp in passport ink: "ENTERED · NOV 26 2026 · BOSTON".

import { cn } from "@/lib/utils";
import { inkDate } from "./fresh-stamps";

export function DateStamp({ at, className, onMaroon = false }: { at: string | Date; className?: string; onMaroon?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center rounded-[6px] border-2 bg-surface/70 px-1.5 py-0.5 leading-none font-bold tracking-[0.1em] whitespace-nowrap uppercase [font-family:'DM_Sans',system-ui]",
        onMaroon ? "border-gold/90 text-gold" : "border-[#2D5A8A]/80 text-[#2D5A8A]",
        "-rotate-6",
        onMaroon && "bg-transparent",
        className,
      )}
      aria-label={`Stamped ${inkDate(at)}`}
    >
      <span className="text-[8px] opacity-80">Entered</span>
      <span className="text-[11px] tabular-nums">{inkDate(at)}</span>
      <span className="text-[7px] opacity-80">Boston · MBTA</span>
    </span>
  );
}
