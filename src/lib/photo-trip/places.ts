import { searchPlaces, type GooglePlace } from "../google-places";
import type { Coordinates } from "../google-routes";
import type { GuidePlace } from "./types";

const BOSTON = { lat: 42.3601, lng: -71.0589 };
const BOSTON_RADIUS_KM = 25;
const FIELDS = ["id", "displayName", "formattedAddress", "location", "googleMapsUri", "businessStatus"];

export function comparableName(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");
}

function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = Math.PI / 180;
  const latitude = Math.sin((a.lat - b.lat) * radians / 2);
  const longitude = Math.sin((a.lng - b.lng) * radians / 2);
  return 12_742 * Math.asin(Math.sqrt(latitude ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * longitude ** 2));
}

function localPlace(place: GooglePlace): GuidePlace | undefined {
  const { id, formattedAddress: address, businessStatus } = place;
  const name = place.displayName?.text;
  const lat = place.location?.latitude, lng = place.location?.longitude;
  if (!id || !name || !address || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)
    || businessStatus?.startsWith("CLOSED") || distanceKm(BOSTON, { lat, lng }) > BOSTON_RADIUS_KM) return;
  const params = new URLSearchParams({ api: "1", query: name, query_place_id: id });
  return { id, name, address, lat, lng, mapUrl: `https://www.google.com/maps/search/?${params}` };
}

export async function verifyLandmark(name: string, municipality: string) {
  const places = await searchPlaces(FIELDS, {
    textQuery: `${name}, ${municipality || "Boston area"}, Massachusetts`,
    pageSize: 8,
    locationBias: { circle: { center: { latitude: BOSTON.lat, longitude: BOSTON.lng }, radius: 25_000 } },
  });
  const matches = places.map(localPlace).filter((place) => place && comparableName(place.name) === comparableName(name));
  if (matches.length === 1) return matches[0];
  if (municipality) {
    const byCity = matches.filter((place) => place?.address.split(",").some((part) => comparableName(part) === comparableName(municipality)));
    if (byCity.length === 1) return byCity[0];
  }
}

export async function searchRestaurants(dish: string, origin?: Coordinates, signal?: AbortSignal) {
  const center = origin && distanceKm(origin, BOSTON) <= BOSTON_RADIUS_KM ? origin : BOSTON;
  const places = await searchPlaces([...FIELDS, "websiteUri"], {
    textQuery: dish,
    includedType: "restaurant",
    strictTypeFiltering: true,
    pageSize: 12,
    locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 8000 } },
  }, signal);
  const matches = new Map<string, { place: GuidePlace; website?: string }>();
  for (const candidate of places) {
    const place = localPlace(candidate);
    if (place && distanceKm(center, place) <= 12 && !matches.has(place.id)) {
      matches.set(place.id, { place, website: candidate.websiteUri });
    }
  }
  return [...matches.values()].slice(0, 5);
}
