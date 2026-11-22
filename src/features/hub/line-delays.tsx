"use client";

// Line delays from Tiger Data (GET /api/lateness), next to the next trains in the hub
// header. Shows the backend's ready-made badge ("Orange Line +6 min") for this station's
// lines when the backend marks them late (yellow, orange or red); on-time lines and
// lines with no data show nothing.

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface LineLateness {
  line: string;
  color: "green" | "yellow" | "orange" | "red" | "gray";
  badge: string;
}

const LATE = new Set(["yellow", "orange", "red"]);
const REFRESH_MS = 60_000;

/** "Green-B" and "Green" are both the Green Line; Mattapan rides as Red. */
export function lineFamily(route: string): string {
  const base = route.split("-")[0];
  return base === "Mattapan" ? "Red" : base;
}

/** The late lines among a station's routes, one per line. */
export function lateFor(routes: string[], lines: LineLateness[]): LineLateness[] {
  const families = new Set(routes.map(lineFamily));
  return lines.filter((l) => families.has(l.line) && LATE.has(l.color));
}

export function LineDelays({ routes }: { routes: string[] }) {
  const [lines, setLines] = useState<LineLateness[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/lateness", { cache: "no-store" });
        const body = (await res.json()) as { lines?: LineLateness[] };
        if (!cancelled && res.ok && Array.isArray(body.lines)) setLines(body.lines);
      } catch {
        /* no badge when Tiger Data is unreachable */
      }
    }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const late = lateFor(routes, lines);
  if (late.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Line delays">
      {late.map((l) => (
        <span
          key={l.line}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
            l.color === "red" ? "bg-delay-severe text-delay-severe-ink" : "bg-delay-minor text-delay-minor-ink",
          )}
        >
          <Clock className="size-3.5" aria-hidden />
          {l.badge}
        </span>
      ))}
    </div>
  );
}
