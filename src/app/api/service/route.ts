// GET /api/service -> tonight's last trains on every subway route, from MBTA schedules.
// { serviceDate, last: [{ route, line, directionId, headsign, from, departs }] }
//   departs: ISO time the last trip leaves its first stop (after midnight counts as tonight).
// The service day runs to about 3 AM, so between midnight and 3 AM we ask for yesterday's schedule.
// Proxies the MBTA so the key stays on the server. Cached 10 minutes. Env: MBTA_API_KEY (server-only)
export const dynamic = "force-dynamic";

const MBTA = "https://api-v3.mbta.com";
const ROUTES = ["Red", "Mattapan", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E"];
const lineOf = (route: string) => (route === "Mattapan" ? "Red" : route.split("-")[0]);

/** Boston service date: before 3 AM it's still yesterday's service. */
function serviceDate(now = new Date()): string {
  const boston = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  if (boston.getHours() < 3) boston.setDate(boston.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${boston.getFullYear()}-${p(boston.getMonth() + 1)}-${p(boston.getDate())}`;
}

interface JsonApi {
  data?: { attributes: { departure_time: string | null }; relationships: { trip?: { data?: { id: string } }; stop?: { data?: { id: string } } } }[];
  included?: { type: string; id: string; attributes: { headsign?: string; name?: string } }[];
}

async function lastTrip(route: string, directionId: number, date: string) {
  const q = new URLSearchParams({
    "filter[route]": route,
    "filter[direction_id]": String(directionId),
    "filter[stop_sequence]": "first",
    "filter[date]": date,
    sort: "-departure_time",
    "page[limit]": "1",
    include: "trip,stop",
    "fields[schedule]": "departure_time",
    "fields[trip]": "headsign",
    "fields[stop]": "name",
  });
  const res = await fetch(`${MBTA}/schedules?${q}`, {
    headers: { "x-api-key": process.env.MBTA_API_KEY ?? "", accept: "application/vnd.api+json" },
    next: { revalidate: 600 },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`MBTA ${res.status}`);
  const j = (await res.json()) as JsonApi;
  const s = j.data?.[0];
  if (!s?.attributes.departure_time) return null;
  const inc = (type: string, id?: string) => j.included?.find((x) => x.type === type && x.id === id)?.attributes;
  return {
    route,
    line: lineOf(route),
    directionId,
    headsign: inc("trip", s.relationships.trip?.data?.id)?.headsign ?? null,
    from: inc("stop", s.relationships.stop?.data?.id)?.name ?? null,
    departs: s.attributes.departure_time,
  };
}

export async function GET() {
  const date = serviceDate();
  const jobs = ROUTES.flatMap((r) => [0, 1].map((d) => lastTrip(r, d, date).catch(() => null)));
  const last = (await Promise.all(jobs)).filter(Boolean);
  if (!last.length) return Response.json({ serviceDate: date, last: [], error: "MBTA schedules unreachable" }, { status: 502 });
  return Response.json({ serviceDate: date, last }, { headers: { "cache-control": "public, max-age=300" } });
}
