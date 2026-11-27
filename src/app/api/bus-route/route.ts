// GET /api/bus-route?from=42.35,-71.10&to=42.34,-71.12&name=Coolidge%20Corner
//   -> { options: BusOption[] } one-bus trips (walk, ride one MBTA bus, walk), fastest first.
// Each option has the same shape as /api/route?alts=1 options, so the map lists them together.
// The wait for the next bus is added from MBTA predictions when there is one.
// Env: MBTA_API_KEY (server-only)
import { planBus, type RouteStops } from "@/lib/bus-plan";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MBTA = "https://api-v3.mbta.com";
const NEAR_DEG = 0.008; // ~700 m search radius for stops

async function mbta(path: string, revalidate = 300) {
  const res = await fetch(`${MBTA}${path}`, {
    headers: { "x-api-key": process.env.MBTA_API_KEY ?? "", accept: "application/vnd.api+json" },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`MBTA ${res.status}`);
  return res.json();
}

type Row = { id: string; attributes: Record<string, unknown> };

const ll = (s: string | null) => {
  const [lat, lng] = (s ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? ([lng, lat] as [number, number]) : null;
};

async function routesNear([lng, lat]: [number, number]): Promise<Set<string>> {
  const stops = (await mbta(`/stops?filter[latitude]=${lat}&filter[longitude]=${lng}&filter[radius]=${NEAR_DEG}&filter[route_type]=3&fields[stop]=name`)).data as Row[];
  if (!stops?.length) return new Set();
  const ids = stops.slice(0, 40).map((s) => s.id).join(",");
  const routes = (await mbta(`/routes?filter[stop]=${ids}&filter[type]=3&fields[route]=short_name`)).data as Row[];
  return new Set(routes.map((r) => r.id));
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "bus-route", 60, 60_000);
  if (limited) return limited;
  const u = new URL(req.url);
  const from = ll(u.searchParams.get("from")), to = ll(u.searchParams.get("to"));
  if (!from || !to) return Response.json({ error: "from and to must be lat,lng" }, { status: 400 });
  try {
    const [a, b] = await Promise.all([routesNear(from), routesNear(to)]);
    const common = [...a].filter((r) => b.has(r)).slice(0, 6);
    if (!common.length) return Response.json({ options: [] });

    const routeInfo = (await mbta(`/routes?filter[id]=${common.join(",")}&fields[route]=direction_destinations`, 86_400)).data as Row[];
    const dest = new Map(routeInfo.map((r) => [r.id, (r.attributes.direction_destinations as string[]) ?? []]));
    const lists: RouteStops[] = await Promise.all(
      common.flatMap((route) =>
        [0, 1].map(async (directionId) => {
          const stops = ((await mbta(`/stops?filter[route]=${route}&filter[direction_id]=${directionId}&fields[stop]=name,latitude,longitude`, 86_400)).data as Row[]).map((s) => ({
            id: s.id,
            name: s.attributes.name as string,
            lat: s.attributes.latitude as number,
            lon: s.attributes.longitude as number,
          }));
          return { route, directionId, headsign: dest.get(route)?.[directionId] ?? "", stops };
        }),
      ),
    );
    const options = planBus(from, to, lists, u.searchParams.get("name") || undefined);

    // Add the wait for the next bus at the boarding stop.
    const now = Date.now();
    await Promise.all(
      options.map(async (o) => {
        try {
          const p = ((await mbta(`/predictions?filter[stop]=${o.board.stopId}&filter[route]=${o.board.route}&filter[direction_id]=${o.board.directionId}&sort=departure_time&page[limit]=3`, 15)).data as Row[])
            .map((x) => (x.attributes.departure_time ?? x.attributes.arrival_time) as string | null)
            .filter((t): t is string => !!t)
            .map((t) => new Date(t).getTime())
            .find((t) => t > now + o.steps[0].minutes * 60_000 - 30_000);
          if (!p) return;
          const wait = Math.max(0, Math.round((p - now) / 60_000) - o.steps[0].minutes);
          o.minutes += wait;
          const ride = o.steps[1] as (typeof o.steps)[number] & { depart?: string };
          ride.depart = new Date(p).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
        } catch {}
      }),
    );
    options.sort((x, y) => x.minutes - y.minutes);
    return Response.json({
      options: options.map((o) => {
        const { board, ...rest } = o;
        void board;
        return rest;
      }),
    });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
