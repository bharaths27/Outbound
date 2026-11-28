// GET /api/bus-shapes?routes=1,57,749 -> { shapes: { [routeId]: string[] } }
// The street paths (MBTA "shapes", Google encoded polylines) each bus route drives, so the map
// can keep buses on their streets. Shapes rarely change: cached for a day.
// Env: MBTA_API_KEY (server-only)
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MBTA = "https://api-v3.mbta.com";
const ROUTE_ID = /^[A-Za-z0-9_-]{1,12}$/;

export async function GET(req: Request) {
  const limited = rateLimit(req, "bus-shapes", 60, 60_000);
  if (limited) return limited;
  const routes = [...new Set((new URL(req.url).searchParams.get("routes") ?? "").split(",").filter((r) => ROUTE_ID.test(r)))].slice(0, 60);
  if (!routes.length) return Response.json({ shapes: {} });
  try {
    // One request per route, so each shape is surely that route's (cached a day each).
    const shapes: Record<string, string[]> = {};
    for (let i = 0; i < routes.length; i += 10) {
      await Promise.all(
        routes.slice(i, i + 10).map(async (route) => {
          const res = await fetch(`${MBTA}/shapes?filter[route]=${route}&fields[shape]=polyline`, {
            headers: { "x-api-key": process.env.MBTA_API_KEY ?? "", accept: "application/vnd.api+json" },
            next: { revalidate: 86_400 },
          });
          if (!res.ok) throw new Error(`MBTA ${res.status}`);
          const j = await res.json();
          shapes[route] = ((j.data ?? []) as { attributes: { polyline?: string } }[]).map((x) => x.attributes.polyline).filter((x): x is string => !!x);
        }),
      );
    }
    return Response.json({ shapes }, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message ?? e) }, { status: 502 });
  }
}
