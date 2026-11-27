// GET /api/buses -> live positions of every MBTA bus (route type 3, Silver Line included)
//
// Proxies the MBTA so the API key stays on the server. Cached ~10 s.
// Env: MBTA_API_KEY (server-only)
//
// Response: { updatedAt, buses: Bus[] } (see src/lib/bus.ts)
import { busNumber, SILVER, type Bus } from "@/lib/bus";

export const dynamic = "force-dynamic";

const MBTA = "https://api-v3.mbta.com";

interface Included {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
}

export async function GET() {
  try {
    const res = await fetch(
      `${MBTA}/vehicles?filter[route_type]=3&include=trip,stop&fields[trip]=headsign&fields[stop]=name` +
        "&fields[vehicle]=latitude,longitude,bearing,current_status,direction_id",
      {
        headers: { "x-api-key": process.env.MBTA_API_KEY ?? "", accept: "application/vnd.api+json" },
        next: { revalidate: 10 },
      },
    );
    if (!res.ok) throw new Error(`MBTA ${res.status}`);
    const j = await res.json();
    const inc = new Map<string, Included>(((j.included ?? []) as Included[]).map((x) => [`${x.type}:${x.id}`, x]));
    const buses: Bus[] = ((j.data ?? []) as { id: string; attributes: Record<string, unknown>; relationships?: Record<string, { data?: { id: string } | null }> }[])
      .flatMap((v) => {
        const route = v.relationships?.route?.data?.id;
        const lat = v.attributes.latitude as number | null, lon = v.attributes.longitude as number | null;
        if (!route || lat == null || lon == null) return [];
        const trip = v.relationships?.trip?.data?.id, stop = v.relationships?.stop?.data?.id;
        return [{
          id: v.id,
          route,
          number: busNumber(route),
          silver: route in SILVER,
          lat,
          lon,
          bearing: (v.attributes.bearing as number | null) ?? 0,
          headsign: (trip && (inc.get(`trip:${trip}`)?.attributes.headsign as string)) || null,
          status: (v.attributes.current_status as string | null) ?? null,
          stopName: (stop && (inc.get(`stop:${stop}`)?.attributes.name as string)) || null,
          directionId: (v.attributes.direction_id as number | null) ?? null,
        }];
      });
    return Response.json({ updatedAt: new Date().toISOString(), buses });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
