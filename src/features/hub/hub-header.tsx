// Hub header (DESIGN.md §6 Station hub): the station name set like a station sign, its
// lines, a round close button, and the live next-trains box. It's what the drawer's peek
// height shows, and it stays pinned while the rest of the hub scrolls.

import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Station } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { ArrivalSlot } from "./arrival-slot";
import { LineBadges } from "./line-badge";

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close station"
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-ink"
    >
      <X className="size-[18px]" strokeWidth={2.2} aria-hidden />
    </button>
  );
}

export function HubHeader({ station, onClose }: { station: Station; onClose: () => void }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          {/* Long names ("Boston University Central") step down a size (DESIGN.md §3). */}
          <h2
            className={cn(
              "inline-block max-w-full rounded-sm bg-ink px-3 py-1 font-bold tracking-[-0.01em] text-white",
              station.name.length > 18 ? "text-[21px] leading-7" : "type-sign",
            )}
          >
            {station.name}
          </h2>
          <div className="mt-2">
            <LineBadges routes={station.lines} />
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <ArrivalSlot stationId={station.id} />
    </header>
  );
}

export function HubHeaderSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex flex-col gap-3" aria-busy>
      <div className="flex items-start gap-2.5">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-10 w-44 rounded-sm" />
          <Skeleton className="h-4 w-28" />
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
    </header>
  );
}
