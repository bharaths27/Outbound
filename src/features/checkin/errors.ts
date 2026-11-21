// What a failed check-in says and offers next (DESIGN.md "Copy": say what happened, then
// what to do). Server failures come keyed by check_in()'s error.hint; location failures
// are found in the browser before anything is sent.

import type { CheckInError } from "@/lib/data/types";

export type FlowErrorCode = CheckInError["code"] | "LOCATION_DENIED" | "LOCATION_UNAVAILABLE" | "NETWORK";

export interface FlowError {
  code: FlowErrorCode;
  distanceM?: number;
  radiusM?: number;
}

/** Next steps, in order of how helpful they are. The first is the primary button. */
export type NextStep = "retry" | "directions" | "passport" | "signin" | "close";

export interface ErrorCopy {
  title: string;
  body: string;
  steps: NextStep[];
}

export function errorCopy(e: FlowError): ErrorCopy {
  switch (e.code) {
    case "TOO_FAR":
      return {
        title: "Not quite there",
        body:
          e.distanceM && e.radiusM
            ? `You're ${e.distanceM} m away. Get within ${e.radiusM} m of the spot to check in.`
            : "You're too far from the spot. Get closer, then try again.",
        steps: ["directions", "retry"],
      };
    case "ALREADY_CHECKED_IN_TODAY":
      return {
        title: "Already stamped today",
        body: "You checked in here today. Come back tomorrow for more XP, or find another quest nearby.",
        steps: ["close", "passport"],
      };
    case "LOCATION_DENIED":
      return {
        title: "Location is off",
        body: "Outbound checks your location only at check-in, to confirm you're at the spot. Allow location for this site in your browser settings, then try again.",
        steps: ["retry"],
      };
    case "LOCATION_UNAVAILABLE":
    case "LOCATION_REQUIRED":
      return {
        title: "Couldn't find you",
        body: "We couldn't get your location. Step outside or near a window, then try again.",
        steps: ["retry"],
      };
    case "NOT_SIGNED_IN":
      return { title: "Sign in to check in", body: "Your stamps and XP are saved to your account.", steps: ["signin"] };
    case "NOT_IN_SQUAD":
      return {
        title: "Not in that squad",
        body: "You're not in that squad anymore. Check in on your own, or rejoin the squad first.",
        steps: ["retry", "close"],
      };
    case "QR_MISMATCH":
      return {
        title: "Code doesn't match",
        body: "That code is for a different quest. Check the code at the spot and try again.",
        steps: ["retry"],
      };
    case "QUEST_NOT_FOUND":
      return { title: "Quest not found", body: "This quest isn't available anymore. Pick another one nearby.", steps: ["close"] };
    case "NETWORK":
      return {
        title: "No connection",
        body: "Check-in didn't reach us. Check your connection, then try again.",
        steps: ["retry"],
      };
    default:
      return { title: "Something went wrong", body: "Check-in didn't go through. Try again in a moment.", steps: ["retry"] };
  }
}

/** Google Maps walking directions to the quest. */
export function directionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;
}
