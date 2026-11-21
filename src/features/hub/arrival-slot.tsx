"use client";

// Next trains at a station, from GET /api/trains?stop=<id> (live MBTA predictions, cached
// ~10 s on the server). Refreshes every 30 s while the hub is open and ticks the minutes
// down in between. Falls back to "Next train: —" when the feed is unavailable.

import { useEffect, useState } from "react";
import type { Arrival } from "@/lib/types";
import { formatMinutes, nextTrains } from "./arrivals";
import { useNow } from "./use-now";

const REFRESH_MS = 30_000;

type Feed = { status: "loading" } | { status: "error" } | { status: "ready"; arrivals: Arrival[] };

export function ArrivalSlot({ stationId }: { stationId: string }) {
  const [feed, setFeed] = useState<Feed>({ status: "loading" });
  const now = useNow(15_000);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(`/api/trains?stop=${encodeURIComponent(stationId)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`trains ${res.status}`);
        const body = (await res.json()) as { arrivals?: Arrival[] };
        if (!cancelled) setFeed({ status: "ready", arrivals: body.arrivals ?? [] });
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setFeed((f) => (f.status === "ready" ? f : { status: "error" })); // keep the last good data
        }
      }
    }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [stationId]);

  const trains = feed.status === "ready" ? nextTrains(feed.arrivals, now) : [];
  let text: string;
  if (feed.status === "loading" || feed.status === "error") text = "Next train: —";
  else if (trains.length === 0) text = "No trains due";
  else text = trains.map((t) => `${t.destination} ${formatMinutes(t.minutes)}`).join(" · ");

  return (
    <p
      className="type-small min-w-0 truncate text-muted-foreground tabular-nums"
      aria-live="polite"
      title={text}
      data-station-id={stationId}
    >
      {trains.length > 0 && <span className="sr-only">Next trains: </span>}
      {text}
    </p>
  );
}
