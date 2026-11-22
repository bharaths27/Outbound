"use client";

// Explore's frame around Verna's map (DESIGN.md §6–7): the "Explore Boston" card over the
// map, and on desktop the leaderboard drawer and room for the station hub. The map's own
// overlays start below the card: the card's height goes into --ob-map-top, which
// TransitMap reads.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ExploreCard } from "./explore-card";
import { DrawerTab, LeaderboardCard } from "./leaderboard-drawer";

const DRAWER_KEY = "outbound.exploreLeaderboard";

export function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Frame hubOpen={false}>{children}</Frame>}>
      <WithHub>{children}</WithHub>
    </Suspense>
  );
}

function WithHub({ children }: { children: ReactNode }) {
  const hubOpen = useSearchParams().has("station");
  return <Frame hubOpen={hubOpen}>{children}</Frame>;
}

function useDrawerOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(DRAWER_KEY) === "open") setOpen(true);
    } catch {}
  }, []);
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(DRAWER_KEY, o ? "closed" : "open");
      } catch {}
      return !o;
    });
  return [open, toggle];
}

function Frame({ hubOpen, children }: { hubOpen: boolean; children: ReactNode }) {
  const [drawerOpen, toggleDrawer] = useDrawerOpen();
  const mapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep --ob-map-top equal to the card's bottom edge, so the map's overlays sit under it.
  useEffect(() => {
    const card = cardRef.current;
    const map = mapRef.current;
    if (!card || !map) return;
    const update = () => map.style.setProperty("--ob-map-top", `${card.offsetTop + card.offsetHeight}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="absolute inset-0 flex">
      <div ref={mapRef} className="relative min-w-0 flex-1">
        {children}
        <div ref={cardRef} className="absolute top-3 right-3 left-3 z-10 desk:top-4 desk:right-auto desk:left-4 desk:w-[min(560px,calc(100%-32px))]">
          <ExploreCard />
        </div>
        {!drawerOpen && (
          <DrawerTab open={false} onToggle={toggleDrawer} className="absolute top-1/2 right-0 z-10 hidden -translate-y-1/2 desk:flex" />
        )}
      </div>

      {drawerOpen && (
        <aside aria-label="Leaderboard" className="relative hidden w-[380px] shrink-0 bg-background py-4 pr-4 pl-6 desk:block motion-safe:animate-in motion-safe:slide-in-from-right-8 motion-safe:duration-200">
          <DrawerTab
            open
            compact={hubOpen}
            onToggle={toggleDrawer}
            className={cn("absolute left-0 z-10", hubOpen ? "top-6" : "top-1/2 -translate-y-1/2")}
          />
          <LeaderboardCard className="max-h-full overflow-y-auto" />
        </aside>
      )}

      {/* Room for the station hub, a 420 px panel 24 px from the right edge (hub-host.tsx). */}
      {hubOpen && <div aria-hidden className="hidden w-[444px] shrink-0 desk:block" />}
    </div>
  );
}
