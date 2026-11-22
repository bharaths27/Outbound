"use client";
// The list under the map's LIVE status: every train running now, grouped by line and branch
// (where it is and where it's headed), plus tonight's last train each way from /api/service.
// Tap a line to open it; tap a train to fly to it on the map.
import { ChevronDown, ChevronRight, Moon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Train } from "@/lib/types";
import { destinationOf } from "./feed";

const GROUPS: { id: string; label: string; color: string; routes: string[] }[] = [
  { id: "Red", label: "Red Line", color: "#da291c", routes: ["Red", "Mattapan"] },
  { id: "Orange", label: "Orange Line", color: "#ed8b00", routes: ["Orange"] },
  { id: "Green", label: "Green Line", color: "#00843d", routes: ["Green-B", "Green-C", "Green-D", "Green-E"] },
  { id: "Blue", label: "Blue Line", color: "#003da5", routes: ["Blue"] },
];
const routeName = (r: string) => (r.startsWith("Green-") ? `${r.slice(6)} branch` : r === "Mattapan" ? "Mattapan trolley" : r);
const statusWord = (s: string | null) =>
  s === "STOPPED_AT" ? "At" : s === "INCOMING_AT" ? "Arriving at" : "Heading to";

interface LastTrip {
  route: string;
  line: string;
  directionId: number;
  headsign: string | null;
  from: string | null;
  departs: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

export default function ServicePanel({
  trains,
  stationName,
  onTrain,
}: {
  trains: Train[];
  stationName: (id: string | null) => string | null;
  onTrain: (t: Train) => void;
}) {
  const [open, setOpen] = useState<string | null>("Green");
  const [last, setLast] = useState<LastTrip[] | null>(null);
  const [lastError, setLastError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/service")
      .then((r) => r.json())
      .then((j) => alive && (j.last?.length ? setLast(j.last) : setLastError(true)))
      .catch(() => alive && setLastError(true));
    return () => {
      alive = false;
    };
  }, []);

  const byRoute = useMemo(() => {
    const m = new Map<string, Train[]>();
    for (const t of trains) m.set(t.route, [...(m.get(t.route) ?? []), t]);
    return m;
  }, [trains]);

  return (
    // Same width as the map's other left panels, and short enough to stay above the Quest of the
    // Week card and the Ask Guide button.
    <div className="ob-panel max-h-[max(160px,min(520px,calc(100dvh-var(--ob-map-top,0px)-22rem)))] w-[min(340px,calc(100vw-24px))] overflow-y-auto px-2 py-1.5 text-xs desk:max-h-[max(160px,min(520px,calc(100dvh-var(--ob-map-top,0px)-14rem)))]">
      {GROUPS.map((g) => {
        const count = g.routes.reduce((n, r) => n + (byRoute.get(r)?.length ?? 0), 0);
        const isOpen = open === g.id;
        return (
          <div key={g.id} className="border-b border-[var(--ob-line)] last:border-0">
            <button
              className="flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-[var(--ob-sand)]"
              onClick={() => setOpen(isOpen ? null : g.id)}
              aria-expanded={isOpen}
            >
              <span className="size-3 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
              <span className="flex-1 font-semibold text-[var(--ob-ink)]">{g.label}</span>
              <span className="text-[var(--ob-ink-2)]">{count} running</span>
              {isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
            </button>
            {isOpen && (
              <div className="pb-2 pl-6">
                {g.routes.map((r) => {
                  const list = byRoute.get(r) ?? [];
                  const lastHere = (last ?? []).filter((l) => l.route === r);
                  if (!list.length && !lastHere.length) return null;
                  return (
                    <div key={r} className="mt-1.5">
                      {g.routes.length > 1 && <p className="font-semibold text-[var(--ob-ink-2)]">{routeName(r)} · {list.length}</p>}
                      <ul className="mt-0.5 space-y-0.5">
                        {list.map((t) => (
                          <li key={t.id}>
                            <button className="w-full rounded px-1 py-0.5 text-left hover:bg-[var(--ob-sand)]" onClick={() => onTrain(t)}>
                              <span className="text-[var(--ob-ink)]">To {destinationOf(t.route, t.directionId ?? 0)}</span>
                              <span className="text-[var(--ob-muted)]">
                                {" "}
                                · {statusWord(t.status)} {stationName(t.stopId) ?? "next stop"}
                              </span>
                            </button>
                          </li>
                        ))}
                        {!list.length && <li className="px-1 text-[var(--ob-muted)]">No trains running now</li>}
                      </ul>
                      {lastHere.map((l) => (
                        <p key={l.directionId} className="mt-0.5 flex items-center gap-1 px-1 text-[var(--ob-ink-2)]">
                          <Moon size={11} aria-hidden />
                          Last to {l.headsign ?? destinationOf(r, l.directionId)}: {fmt(l.departs)}
                          {l.from ? ` from ${l.from}` : ""}
                          {new Date(l.departs).getTime() < Date.now() ? " (left)" : ""}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {lastError && <p className="px-1.5 py-1 text-[var(--ob-muted)]">Last-train times need the MBTA schedule feed (not reachable right now).</p>}
    </div>
  );
}
