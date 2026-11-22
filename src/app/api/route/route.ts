// GET /api/route?from=42.36,-71.09&to=42.346,-71.097 -> directions by T + walking (Google Routes API, transit)
// { minutes, distanceKm, path: [[lng,lat]...], steps: [{ mode, text, minutes, line?, color?, from?, to?, stops? }] }
// Falls back to a walking route if there is no transit option. Env: GOOGLE_MAPS_KEY or NEXT_PUBLIC_GOOGLE_MAPS_KEY.
export const dynamic = "force-dynamic";

const KEY = process.env.GOOGLE_MAPS_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

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
const mins = (d?: string) => (d ? Math.round(parseInt(d) / 60) : 0);
const point = (s: string) => {
  const [lat, lng] = s.split(",").map(Number);
  return { location: { latLng: { latitude: lat, longitude: lng } } };
};

async function compute(from: string, to: string, mode: "TRANSIT" | "WALK") {
  const r = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": KEY,
      "content-type": "application/json",
      "X-Goog-FieldMask":
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.transitDetails",
    },
    body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: mode, ...(mode === "TRANSIT" ? { transitPreferences: { allowedTravelModes: ["SUBWAY", "TRAIN", "LIGHT_RAIL", "BUS"] } } : {}) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
  return j.routes?.[0];
}

export async function GET(req: Request) {
  if (!KEY) return Response.json({ disabled: true });
  const u = new URL(req.url);
  const from = u.searchParams.get("from"), to = u.searchParams.get("to");
  if (!from || !to) return Response.json({ error: "from and to are required" }, { status: 400 });
  try {
    const route = (await compute(from, to, "TRANSIT")) ?? (await compute(from, to, "WALK"));
    if (!route) return Response.json({ error: "No route found" }, { status: 404 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps: any[] = [];
    const segments: { mode: string; color: string; path: [number, number][] }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of route.legs?.[0]?.steps ?? ([] as any[])) {
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
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
