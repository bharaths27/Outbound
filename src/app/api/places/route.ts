// GET /api/places?q=fenway+park      -> place/address suggestions (Google Places Autocomplete, biased to Boston)
// GET /api/places?id=<placeId>       -> { name, address, lng, lat, bbox } for the chosen suggestion
//
// Proxies Google Places API (New) so search works for any place or address, like Google Maps.
// Env: GOOGLE_MAPS_KEY (server) or NEXT_PUBLIC_GOOGLE_MAPS_KEY. Without a key: { disabled: true } and the
// map falls back to its free search (Photon / OpenStreetMap).
export const dynamic = "force-dynamic";

const KEY = process.env.GOOGLE_MAPS_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";
const BASE = "https://places.googleapis.com/v1";

export async function GET(req: Request) {
  if (!KEY) return Response.json({ disabled: true });
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const id = url.searchParams.get("id");
  const session = url.searchParams.get("session") ?? undefined;
  try {
    if (id) {
      const r = await fetch(`${BASE}/places/${encodeURIComponent(id)}${session ? `?sessionToken=${session}` : ""}`, {
        headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "displayName,formattedAddress,location,viewport,types" },
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      const v = j.viewport;
      return Response.json({
        name: j.displayName?.text ?? "",
        address: j.formattedAddress ?? "",
        lng: j.location?.longitude,
        lat: j.location?.latitude,
        bbox: v ? [v.low.longitude, v.low.latitude, v.high.longitude, v.high.latitude] : null,
        types: j.types ?? [],
      });
    }
    if (!q || q.trim().length < 2) return Response.json({ results: [] });
    const r = await fetch(`${BASE}/places:autocomplete`, {
      method: "POST",
      headers: { "X-Goog-Api-Key": KEY, "content-type": "application/json" },
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
