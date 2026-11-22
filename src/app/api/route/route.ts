// GET /api/route?from=42.36,-71.09&to=42.346,-71.097 -> directions by T + walking (Google Routes API, transit)
// { minutes, distanceKm, path: [[lng,lat]...], steps: [{ mode, text, minutes, line?, color?, from?, to?, stops? }] }
// Falls back to a walking route if there is no transit option. Env: GOOGLE_MAPS_KEY or NEXT_PUBLIC_GOOGLE_MAPS_KEY.
// ?engine=outbound forces our own routing; &name= labels the last walk step.
// With no Google key (or when Google fails) we route on our own MBTA track data instead (src/lib/transit-route.ts).
import { loadGraph, planRoute } from "@/lib/transit-route";

export const dynamic = "force-dynamic";

import { googleMapsKey } from "@/lib/google-places";
import { computeRoutes, seconds } from "@/lib/google-routes";

async function ourRoute(req: Request, from: string, to: string, name?: string | null) {
  const p = (s: string) => {
    const [lat, lng] = s.split(",").map(Number);
    return [lng, lat] as [number, number];
  };
  const a = p(from), b = p(to);
  if (![...a, ...b].every(Number.isFinite)) return Response.json({ error: "from and to must be lat,lng" }, { status: 400 });
  const g = await loadGraph(new URL(req.url).origin);
  return Response.json(planRoute(g, a, b, name || undefined));
}


/** Google encoded polyline -> [[lng, lat], ...] */
function decode(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d;
      else lng += d;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}
const mins = (d?: string) => Math.round((seconds(d) || 0) / 60);
export async function GET(req: Request) {
  const u = new URL(req.url);
  const from = u.searchParams.get("from"), to = u.searchParams.get("to"), name = u.searchParams.get("name");
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });
  if (!googleMapsKey() || u.searchParams.get("engine") === "outbound") {
    try {
      return await ourRoute(req, from, to, name);
    } catch (e) {
      return Response.json({ error: String((e as Error).message ?? e) }, { status: 502 });
    }
  }
  try {
    const coords = (value: string) => {
      const [lat, lng] = value.split(",").map(Number);
      return { lat, lng };
    };
    const origin = coords(from), destination = coords(to);
    const [transit] = await computeRoutes(origin, destination, "TRANSIT");
    const route = transit ?? (await computeRoutes(origin, destination, "WALK"))[0];
    if (!route) return await ourRoute(req, from, to, name);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps: any[] = [];
    const segments: { mode: string; color: string; path: [number, number][] }[] = [];
    for (const s of route.legs?.[0]?.steps ?? []) {
      const path = s.polyline?.encodedPolyline ? decode(s.polyline.encodedPolyline) : [];
      const td = s.transitDetails;
      if (td) {
        const line = td.transitLine ?? {};
        const color = line.color ?? "#555";
        steps.push({
          mode: "transit",
          line: line.nameShort || line.name || "Transit",
          vehicle: line.vehicle?.type ?? "",
          color,
          from: td.stopDetails?.departureStop?.name,
          to: td.stopDetails?.arrivalStop?.name,
          headsign: td.headsign,
          stops: td.stopCount,
          depart: td.localizedValues?.departureTime?.time?.text,
          minutes: mins(s.staticDuration),
        });
        segments.push({ mode: "transit", color, path });
      } else {
        const last = steps[steps.length - 1];
        const m = mins(s.staticDuration);
        if (last?.mode === "walk") {
          last.minutes += m;
          last.meters += s.distanceMeters ?? 0;
        } else steps.push({ mode: "walk", text: s.navigationInstruction?.instructions ?? "Walk", minutes: m, meters: s.distanceMeters ?? 0 });
        const seg = segments[segments.length - 1];
        if (seg?.mode === "walk") seg.path.push(...path);
        else segments.push({ mode: "walk", color: "#5b6b7a", path });
      }
    }
    return Response.json({
      minutes: mins(route.duration),
      distanceKm: Math.round((route.distanceMeters ?? 0) / 100) / 10,
      path: route.polyline?.encodedPolyline ? decode(route.polyline.encodedPolyline) : [],
      segments,
      steps,
    });
  } catch (e) {
    console.warn("[route] Google Routes failed, using our own T routing:", (e as Error).message);
    try {
      return await ourRoute(req, from, to, name);
    } catch {
      return Response.json({ error: String((e as Error).message ?? e) }, { status: 502 });
    }
  }
}
