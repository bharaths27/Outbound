"use client";

// The check-in flow as a small state machine:
//   idle → (closed: confirm) → (options: squad and/or QR code) → locating → sending
//        → success | error
// Options appear only when they matter: the player is in a squad, or the quest is an event
// checked in by QR code. Demo accounts skip location and send null; the backend decides
// whether that's allowed. The QR code is checked by check_in(), never in the browser.

import { useCallback, useRef, useState } from "react";
import { data } from "@/lib/data";
import type { CheckInResult, Profile, Quest } from "@/lib/data/types";
import type { FlowError } from "./errors";

export interface CheckInOptions {
  squadId?: string;
  qr?: string;
}

export type CheckInState =
  | { step: "idle" }
  | { step: "closed"; label: string } // the place looks closed; ask before checking in
  | { step: "options" } // pick a squad and/or enter the event code
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

/**
 * @param needsOptions whether to ask for a squad or code before sending (see CheckInButton).
 */
export function useCheckIn(quest: Quest, profile: Profile | null, needsOptions: boolean) {
  const [state, setState] = useState<CheckInState>({ step: "idle" });
  const run = useRef(0); // ignores results from a flow the user already closed
  const lastOptions = useRef<CheckInOptions>({});

  const send = useCallback(
    async (opts: CheckInOptions = lastOptions.current) => {
      lastOptions.current = opts;
      const id = ++run.current;
      const live = () => run.current === id;
      let location: Position | null = null;
      // QR check-ins don't need location; demo accounts never do.
      if (!profile?.is_demo && !opts.qr) {
        setState({ step: "locating" });
        const found = await locate();
        if (!live()) return;
        if ("code" in found) return setState({ step: "error", error: found });
        location = found;
      }
      setState({ step: "sending" });
      try {
        const outcome = await data.checkIn(quest.id, location, opts);
        if (!live()) return;
        setState(outcome.ok ? { step: "success", result: outcome.result } : { step: "error", error: outcome.error });
      } catch {
        if (live()) setState({ step: "error", error: { code: "NETWORK" } });
      }
    },
    [quest.id, profile?.is_demo],
  );

  /** After any closed-hours confirm: ask for options if needed, else send. */
  const proceed = useCallback(() => {
    if (needsOptions) setState({ step: "options" });
    else void send({});
  }, [needsOptions, send]);

  /** Starts the flow. If `closedLabel` is set, asks first ("Closed · opens 7 AM"). */
  const start = useCallback(
    (closedLabel?: string | null) => {
      if (closedLabel) setState({ step: "closed", label: closedLabel });
      else proceed();
    },
    [proceed],
  );

  const reset = useCallback(() => {
    run.current++;
    lastOptions.current = {};
    setState({ step: "idle" });
  }, []);

  return {
    state,
    start,
    confirm: proceed,
    submitOptions: (opts: CheckInOptions) => void send(opts),
    /** Retries with the same squad and code; a wrong code goes back to the options. */
    retry: () => (state.step === "error" && state.error.code === "QR_MISMATCH" ? setState({ step: "options" }) : void send()),
    reset,
  };
}
