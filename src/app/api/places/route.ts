// GET /api/places?q=fenway+park      -> place/address suggestions (Google Places Autocomplete, biased to Boston)
// GET /api/places?id=<placeId>       -> { name, address, lng, lat, bbox, rating, ... } for the chosen suggestion
// GET /api/places?text=local+eats&lat=42.35&lng=-71.06 -> places like Google Maps search: rating, price, open now
//
// Proxies Google Places API (New) so search works for any place or address, like Google Maps.
// Env: GOOGLE_MAPS_KEY (server) or NEXT_PUBLIC_GOOGLE_MAPS_KEY. Without a key: { disabled: true } and the
// map falls back to its free search (Photon / OpenStreetMap).
export const dynamic = "force-dynamic";

import { googleMapsKey, PLACES_BASE, searchPlaces, type GooglePlace } from "@/lib/google-places";
import { rateLimit } from "@/lib/rate-limit";

const FIELDS = ["id", "displayName", "formattedAddress", "location", "types", "rating", "userRatingCount", "priceLevel", "currentOpeningHours.openNow", "primaryTypeDisplayName", "googleMapsUri"];
const PRICE: Record<string, number> = { PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

/** The place fields the map uses. */
function shape(p: GooglePlace) {
  return {
    id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    lng: p.location?.longitude,
    lat: p.location?.latitude,
    types: p.types ?? [],
    category: p.primaryTypeDisplayName?.text ?? "",
    rating: p.rating ?? null,
    ratings: p.userRatingCount ?? 0,
    price: PRICE[p.priceLevel ?? ""] ?? null,
    openNow: p.currentOpeningHours?.openNow ?? null,
    url: p.googleMapsUri ?? null,
  };
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "places", 60, 60000);
  if (limited) return limited;
  const key = googleMapsKey();
  if (!key) return Response.json({ disabled: true });
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const id = url.searchParams.get("id");
  const session = url.searchParams.get("session") ?? undefined;
  const text = url.searchParams.get("text");
  try {
    if (text) {
      const lat = Number(url.searchParams.get("lat") ?? 42.36), lng = Number(url.searchParams.get("lng") ?? -71.06);
      const places = await searchPlaces(FIELDS, { textQuery: text, pageSize: 20, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 8000 } } });
      return Response.json({ places: places.map(shape) });
    }
    if (id) {
      const r = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(id)}${session ? `?sessionToken=${session}` : ""}`, {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": [...FIELDS, "viewport"].join(",") },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      const v = j.viewport;
      return Response.json({ ...shape(j), bbox: v ? [v.low.longitude, v.low.latitude, v.high.longitude, v.high.latitude] : null });
    }
    if (!q || q.trim().length < 2) return Response.json({ results: [] });
    const r = await fetch(`${PLACES_BASE}/places:autocomplete`, {
      method: "POST",
      headers: { "X-Goog-Api-Key": key, "content-type": "application/json" },
      body: JSON.stringify({
        input: q,
        sessionToken: session,
        locationBias: { circle: { center: { latitude: 42.36, longitude: -71.06 }, radius: 50000 } },
        regionCode: "us",
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
    const results = (j.suggestions ?? [])
      .map((s: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; types?: string[] } }) => s.placePrediction)
      .filter(Boolean)
      .map((p: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; types?: string[] }) => ({
        id: p.placeId,
        name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        sub: p.structuredFormat?.secondaryText?.text ?? "",
        types: p.types ?? [],
      }));
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
