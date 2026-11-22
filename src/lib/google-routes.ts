import { googleMapsKey } from "./google-places";

export interface Coordinates {
  lat: number;
  lng: number;
}

interface GoogleStop {
  name?: string;
}

export interface GoogleRouteStep {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
  navigationInstruction?: { instructions?: string };
  transitDetails?: {
    transitLine?: {
      name?: string;
      nameShort?: string;
      color?: string;
      vehicle?: { type?: string };
      agencies?: { name?: string; uri?: string }[];
    };
    stopDetails?: { departureStop?: GoogleStop; arrivalStop?: GoogleStop };
    headsign?: string;
    stopCount?: number;
    localizedValues?: { departureTime?: { time?: { text?: string } } };
  };
}

export interface GoogleRoute {
  duration?: string;
  distanceMeters?: number;
  polyline?: { encodedPolyline?: string };
  legs?: { steps?: GoogleRouteStep[] }[];
}

export const seconds = (duration?: string) => Number(duration?.match(/^(\d+(?:\.\d+)?)s$/)?.[1] ?? NaN);

function waypoint({ lat, lng }: Coordinates) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

export async function computeRoutes(
  origin: Coordinates,
  destination: Coordinates,
  mode: "TRANSIT" | "WALK",
  alternatives = false,
  signal?: AbortSignal,
) {
  const key = googleMapsKey();
  if (!key) throw new Error("Google Maps key is missing");
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": key,
      "content-type": "application/json",
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.transitDetails",
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: mode,
      ...(alternatives ? { computeAlternativeRoutes: true } : {}),
      ...(mode === "TRANSIT" ? { transitPreferences: { allowedTravelModes: ["SUBWAY", "TRAIN", "LIGHT_RAIL", "BUS"] } } : {}),
    }),
    signal: signal ?? AbortSignal.timeout(10_000),
  });
  const result: { routes?: GoogleRoute[]; error?: { message?: string } } = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `Routes HTTP ${response.status}`);
  return result.routes ?? [];
}
