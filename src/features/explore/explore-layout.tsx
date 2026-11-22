"use client";

// Explore's frame around Verna's map (DESIGN.md §6): the "Explore Boston" card over the map
// (top right on desktop: search, filters, then the map's view controls and live trains under it),
// and on desktop room for the station hub. The map's own overlays start below the card: the
// card's height goes into --ob-map-top, which TransitMap reads.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { ExploreCard } from "./explore-card";

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

function Frame({ hubOpen, children }: { hubOpen: boolean; children: ReactNode }) {
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
        <div ref={cardRef} className="absolute top-3 right-3 left-3 z-10 desk:top-4 desk:right-4 desk:left-auto desk:w-[min(460px,calc(100%-32px))]">
          <ExploreCard />
        </div>
      </div>

      {/* Room for the station hub, a 420 px panel 24 px from the right edge (hub-host.tsx),
          plus a 24 px gap on its left so the map and its controls stop short of the panel. */}
      {hubOpen && <div aria-hidden className="hidden w-[468px] shrink-0 bg-background desk:block" />}
    </div>
  );
}
