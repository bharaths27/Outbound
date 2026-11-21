"use client";

// The check-in flow as a small state machine:
//   idle → (closed: confirm) → locating → sending → success | error
// Demo accounts skip location and send null; the backend decides whether that's allowed.

import { useCallback, useRef, useState } from "react";
import { data } from "@/lib/data";
import type { CheckInResult, Profile, Quest } from "@/lib/data/types";
import type { FlowError } from "./errors";

export type CheckInState =
  | { step: "idle" }
  | { step: "closed"; label: string } // the place looks closed; ask before checking in
  | { step: "locating" }
  | { step: "sending" }
  | { step: "success"; result: CheckInResult }
  | { step: "error"; error: FlowError };

type Position = { lat: number; lon: number };

function locate(): Promise<Position | FlowError> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ code: "LOCATION_UNAVAILABLE" });
  }
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (err) => resolve({ code: err.code === err.PERMISSION_DENIED ? "LOCATION_DENIED" : "LOCATION_UNAVAILABLE" }),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    ),
  );
}

export function useCheckIn(quest: Quest, profile: Profile | null) {
  const [state, setState] = useState<CheckInState>({ step: "idle" });
  const run = useRef(0); // ignores results from a flow the user already closed

  const send = useCallback(async () => {
    const id = ++run.current;
    const live = () => run.current === id;
    let location: Position | null = null;
    if (!profile?.is_demo) {
      setState({ step: "locating" });
      const found = await locate();
      if (!live()) return;
      if ("code" in found) return setState({ step: "error", error: found });
      location = found;
    }
    setState({ step: "sending" });
    try {
      const outcome = await data.checkIn(quest.id, location);
      if (!live()) return;
      setState(outcome.ok ? { step: "success", result: outcome.result } : { step: "error", error: outcome.error });
    } catch {
      if (live()) setState({ step: "error", error: { code: "NETWORK" } });
    }
  }, [quest.id, profile?.is_demo]);

  /** Starts the flow. If `closedLabel` is set, asks first ("Closed · opens 7 AM"). */
  const start = useCallback(
    (closedLabel?: string | null) => {
      if (closedLabel) setState({ step: "closed", label: closedLabel });
      else void send();
    },
    [send],
  );

  const reset = useCallback(() => {
    run.current++;
    setState({ step: "idle" });
  }, []);

  return { state, start, confirm: send, retry: send, reset };
}
