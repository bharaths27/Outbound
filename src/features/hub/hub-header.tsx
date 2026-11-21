// Hub header (DESIGN.md "Station hub header"): the station name like a station sign,
// line badges, and the next-train slot. It is what the drawer's peek height shows.

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Station } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { ArrivalSlot } from "./arrival-slot";
import { LineBadges } from "./line-badge";

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close station" className="-mr-2 -mt-1 shrink-0">
      <X aria-hidden />
    </Button>
  );
}

export function HubHeader({ station, onClose }: { station: Station; onClose: () => void }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        {/* Long names ("Boston University Central") step down a size so the peek height
            still shows the lines and next train. */}
        <h2 className={cn("type-display min-w-0 text-balance", station.name.length > 18 && "text-[26px] leading-[30px]")}>
          {station.name}
        </h2>
        <CloseButton onClose={onClose} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <LineBadges routes={station.lines} />
        <ArrivalSlot stationId={station.id} />
      </div>
    </header>
  );
}

export function HubHeaderSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <header className="flex flex-col gap-2" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-9 w-48" />
        <CloseButton onClose={onClose} />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </header>
  );
}
