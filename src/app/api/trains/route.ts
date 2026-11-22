// GET /api/trains            -> live positions of every Red, Orange, Blue and Green Line train
// GET /api/trains?stop=place-kencl -> plus next arrivals at that station (for the hub countdown)
//
// Proxies the MBTA so the API key stays on the server. Cached ~10 s.
// Env: MBTA_API_KEY (server-only)
//
// Response:
// { updatedAt, trains: [{ id, line, route, lat, lon, bearing, status, stopId, directionId, occupancy }],
//   arrivals?: [{ route, line, directionId, arrivalTime, minutes, status }] }
export const dynamic = "force-dynamic";

const MBTA = "https://api-v3.mbta.com";
const ROUTES = "Red,Orange,Blue,Green-B,Green-C,Green-D,Green-E";

async function mbta(path: string) {
  const res = await fetch(`${MBTA}${path}`, {
    headers: { "x-api-key": process.env.MBTA_API_KEY ?? "", accept: "application/vnd.api+json" },
    next: { revalidate: 10 },
  });
  if (!res.ok) throw new Error(`MBTA ${res.status}`);
  return res.json();
}

const lineOf = (route: string) => route.split("-")[0];

export async function GET(req: Request) {
  try {
    const stop = new URL(req.url).searchParams.get("stop");
    const vehicles = await mbta(`/vehicles?filter[route]=${ROUTES}`);
    const trains = (vehicles.data ?? [])
      .filter((v: any) => v.relationships?.route?.data?.id)
      .map((v: any) => {
        const route = v.relationships.route.data.id as string;
        return {
          id: v.id,
          line: lineOf(route),
          route,
          lat: v.attributes.latitude,
          lon: v.attributes.longitude,
          bearing: v.attributes.bearing,
          status: v.attributes.current_status,
          stopId: v.relationships?.stop?.data?.id ?? null,
          directionId: v.attributes.direction_id,
          occupancy: v.attributes.occupancy_status,
        };
      });

    let arrivals;
    if (stop) {
      const preds = await mbta(
        `/predictions?filter[stop]=${encodeURIComponent(stop)}&filter[route]=${ROUTES}&sort=arrival_time`,
      );
      const now = Date.now();
      arrivals = (preds.data ?? [])
        .map((p: any) => {
          const t = p.attributes.arrival_time ?? p.attributes.departure_time;
          const route = p.relationships?.route?.data?.id as string;
          return t && route
            ? {
                route,
                line: lineOf(route),
                directionId: p.attributes.direction_id,
                arrivalTime: t,
                minutes: Math.max(0, Math.round((new Date(t).getTime() - now) / 60000)),
                status: p.attributes.status, // e.g. "Approaching", "Stopped 2 stops away"
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 8);
    }

    return Response.json({ updatedAt: new Date().toISOString(), trains, arrivals });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 502 });
  }
}
