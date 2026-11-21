"use client";

// Renders the station hub over any page when the URL has ?station=<id>. Phones get a
// non-modal bottom drawer with three snap points (peek, half, full); from 768 px it is a
// 420 px non-modal sheet on the right. Non-modal keeps the map usable behind it, so
// tapping another station swaps the hub instead of closing it. Mounted once in layout.tsx.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { closeStationHub, forgetHubHistory } from "./open-hub";
import { StationHub } from "./station-hub";

const DESKTOP = "(min-width: 1024px)"; // DESIGN.md §2.5
/** Peek shows the header: station name, lines, next train. */
const PEEK = "228px"; // handle + sign + lines + next-trains box
const SNAP_POINTS: (string | number)[] = [PEEK, 0.55, 1];

function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => null, // unknown on the server; render nothing until the client knows
  );
}

export function StationHubHost() {
  // useSearchParams needs a Suspense boundary on statically rendered pages.
  return (
    <Suspense fallback={null}>
      <HubHost />
    </Suspense>
  );
}

function HubHost() {
  const stationId = useSearchParams().get("station");
  const desktop = useMediaQuery(DESKTOP);
  const [snap, setSnap] = useState<string | number | null>(PEEK);
  // Keep the last station while the close animation runs.
  const [shownId, setShownId] = useState(stationId);
  if (stationId && stationId !== shownId) setShownId(stationId);

  const open = stationId !== null;

  useEffect(() => {
    if (!open) {
      forgetHubHistory();
      setSnap(PEEK); // the next station opens at peek again
    }
  }, [open]);

  if (desktop === null || !shownId) return null;

  const onOpenChange = (next: boolean) => {
    if (!next) closeStationHub();
  };
  const hub = <StationHub key={shownId} stationId={shownId} onClose={closeStationHub} />;

  if (desktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side="right"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()} // map clicks swap stations instead
          onOpenAutoFocus={(e) => e.preventDefault()}
          // A floating card right of the map, under the top bar (DESIGN.md §7).
          className="gap-0 overflow-hidden rounded-[22px] border border-border bg-background shadow-card data-[side=right]:top-[88px] data-[side=right]:right-6 data-[side=right]:bottom-6 data-[side=right]:h-auto data-[side=right]:w-[420px] data-[side=right]:sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">Station</SheetTitle>
          <SheetDescription className="sr-only">Quests and filters for this station</SheetDescription>
          <div data-hub-scroll className="min-h-0 flex-1 overflow-y-auto p-6">
            {hub}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <DrawerContent className="h-[96dvh] border-0 bg-background shadow-[0_-8px_30px_rgb(74_20_36/0.22)] data-[vaul-drawer-direction=bottom]:max-h-[96dvh]">
        <DrawerTitle className="sr-only">Station</DrawerTitle>
        <DrawerDescription className="sr-only">Quests and filters for this station</DrawerDescription>
        {/* Scrolls only when fully open; below that, drags move the drawer. */}
        <div
          data-hub-scroll
          className={
            snap === 1
              ? "min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]"
              : "min-h-0 flex-1 overflow-hidden px-4 pt-3"
          }
        >
          {hub}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
