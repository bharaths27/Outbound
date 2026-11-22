import { computeRoutes, seconds, type Coordinates, type GoogleRoute, type GoogleRouteStep } from "../google-routes";
import type { GuidePlace, GuideTrip, TripStep } from "./types";

function isMbta(step: GoogleRouteStep) {
  return step.transitDetails?.transitLine?.agencies?.some(({ name, uri }) => {
    if (/\bMBTA\b|Massachusetts Bay Transportation Authority/i.test(name ?? "")) return true;
    try {
      const host = uri && new URL(uri).hostname;
      return host === "mbta.com" || !!host?.endsWith(".mbta.com");
    } catch {
      return false;
    }
  });
}

export function mbtaOption(route: GoogleRoute) {
  const duration = seconds(route.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const steps: TripStep[] = [];
  let boardings = 0;
  for (const step of route.legs?.flatMap((leg) => leg.steps ?? []) ?? []) {
    if (step.travelMode === "WALK") {
      steps.push({
        mode: "walk",
        text: step.navigationInstruction?.instructions || "Walk",
        minutes: Math.ceil((seconds(step.staticDuration) || 0) / 60),
      });
      continue;
    }
    const details = step.transitDetails;
    const line = details?.transitLine?.nameShort || details?.transitLine?.name;
    const from = details?.stopDetails?.departureStop?.name;
    const to = details?.stopDetails?.arrivalStop?.name;
    if (step.travelMode !== "TRANSIT" || !isMbta(step) || !line || !from || !to) return null;
    boardings++;
    steps.push({ mode: "transit", line, from, to, headsign: details?.headsign });
  }
  return boardings > 0 ? { duration, transfers: boardings - 1, steps } : null;
}

export async function findFastestTrip(origin: Coordinates, destinations: GuidePlace[]): Promise<GuideTrip | undefined> {
  const results = await Promise.allSettled(destinations.map(async (destination) => {
    const routes = await computeRoutes(origin, destination, "TRANSIT", true);
    return routes.flatMap((route) => {
      const option = mbtaOption(route);
      return option ? [{ ...option, destination }] : [];
    });
  }));
  const options = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  // Compare provider durations before rounding for display.
  const fastest = options.sort((a, b) => a.duration - b.duration || a.transfers - b.transfers)[0];
  if (!fastest) return;
  const { destination, duration, transfers, steps } = fastest;
  const params = new URLSearchParams({
    api: "1",
    destination: destination.name,
    destination_place_id: destination.id,
    travelmode: "transit",
  });
  return {
    destination, minutes: Math.ceil(duration / 60), transfers, steps,
    mapUrl: `https://www.google.com/maps/dir/?${params}`,
  };
}
