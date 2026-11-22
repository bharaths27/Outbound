"use client";

// Ride time "from you" for the hub's time filter (Bharath's answer #8): GET
// /api/ride-times?from=lat,lng returns minutes from the player to every station, by T or
// walking. Used only when the browser already has location permission, so opening a
// station never pops a location prompt. Without a location, or if the route isn't there,
// the filter counts from the station as before (ride time 0).

import { useEffect, useState } from "react";

type Minutes = Record<string, number>;

const MAX_AGE_MS = 2 * 60_000;
let cached: { at: number; minutes: Promise<Minutes | null> } | null = null;

/** The player's position, only if location is already allowed. Never prompts. */
async function knownPosition(): Promise<[number, number] | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator) || !navigator.permissions) return null;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return null;
  } catch {
    return null;
  }
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      () => resolve(null),
      { maximumAge: MAX_AGE_MS, timeout: 8000 },
    ),
  );
}

/** Parses the route's reply; anything unexpected counts as "no ride times". */
export function parseRideTimes(body: unknown): Minutes | null {
  const minutes = (body as { minutes?: unknown } | null)?.minutes;
  if (!minutes || typeof minutes !== "object") return null;
  const out: Minutes = {};
  for (const [id, m] of Object.entries(minutes)) if (typeof m === "number" && Number.isFinite(m) && m >= 0) out[id] = m;
  return out;
}

function loadRideTimes(): Promise<Minutes | null> {
  if (cached && Date.now() - cached.at < MAX_AGE_MS) return cached.minutes;
  const minutes = knownPosition().then(async (pos) => {
    if (!pos) return null;
    try {
      const res = await fetch(`/api/ride-times?from=${pos[0].toFixed(5)},${pos[1].toFixed(5)}`);
      return res.ok ? parseRideTimes(await res.json()) : null;
    } catch {
      return null;
    }
  });
  cached = { at: Date.now(), minutes };
  return minutes;
}

/** Minutes from the player to this station, or null (no location yet, or no data). */
export function useRideMinutes(stationId: string): number | null {
  const [ride, setRide] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadRideTimes().then((m) => {
      if (!cancelled) setRide(m?.[stationId] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [stationId]);
  return ride;
}
