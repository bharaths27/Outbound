export const PLACES_BASE = "https://places.googleapis.com/v1";

export const googleMapsKey = () => process.env.GOOGLE_MAPS_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
  websiteUri?: string;
  businessStatus?: string;
}

export async function searchPlaces(fields: string[], search: Record<string, unknown>, signal?: AbortSignal) {
  const key = googleMapsKey();
  if (!key) throw new Error("Google Maps key is missing");
  const response = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": key,
      "content-type": "application/json",
      "X-Goog-FieldMask": fields.map((field) => `places.${field}`).join(","),
    },
    body: JSON.stringify(search),
    signal: signal ?? AbortSignal.timeout(10_000),
  });
  const result: { places?: GooglePlace[]; error?: { message?: string } } = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? `Places HTTP ${response.status}`);
  return result.places ?? [];
}
