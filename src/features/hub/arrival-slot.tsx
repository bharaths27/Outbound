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
  const live = trains.length > 0;
  let fallback: string | null = null;
  if (feed.status === "loading" || feed.status === "error") fallback = "Next train: —";
  else if (!live) fallback = "No trains due";

  // A white box with a live dot: "Heath St 2 min · Park St 4 min" (DESIGN.md §6).
  return (
    <div
      className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm"
      aria-live="polite"
      data-station-id={stationId}
    >
      <span
        aria-hidden
        className={live ? "size-2 shrink-0 rounded-full bg-success shadow-[0_0_0_4px_#D6EEDF]" : "size-2 shrink-0 rounded-full bg-stamp-dot-off"}
      />
      {fallback ? (
        <span className="text-muted-foreground">{fallback}</span>
      ) : (
        <p className="min-w-0 truncate tabular-nums">
          <span className="sr-only">Next trains: </span>
          {trains.map((t, i) => (
            <span key={t.key}>
              {i > 0 && <span className="px-1.5 text-[#B7ABA4]" aria-hidden>·</span>}
              <b className="font-bold">{t.destination}</b> {formatMinutes(t.minutes)}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
