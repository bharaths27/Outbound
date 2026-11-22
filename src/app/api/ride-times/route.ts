// GET /api/ride-times?from=42.35,-71.107 -> { from: [lat, lng], minutes: { "place-kencl": 9, ... } }
// Minutes from that point to every T station (walk to a nearby station, wait, ride, transfers, or just walk),
// from our own MBTA track data (src/lib/transit-route.ts). No API key. This is ride_min for the hub's time
// filter: ride_min + 2 * walk_min + duration_min <= minutes. Without `from`, starts at BU Central.
import { DEFAULT_START, loadGraph, rideTimes } from "@/lib/transit-route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const [lat, lng] = (u.searchParams.get("from") ?? `${DEFAULT_START[1]},${DEFAULT_START[0]}`).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: "from must be lat,lng" }, { status: 400 });
  try {
    const g = await loadGraph(u.origin);
    return Response.json({ from: [lat, lng], minutes: rideTimes(g, [lng, lat]) }, { headers: { "cache-control": "private, max-age=60" } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
