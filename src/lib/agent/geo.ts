// Where in Boston is it? Turns what Grok saw in a photo ("Chinatown Gate, Chinatown") into a point on the
// map, then adds the closest T stop and a route by T from campus. Sources, in order:
//   1) a short list of Boston landmarks we know (fast, exact, no key)
//   2) Google Places text search through our /api/places (when GOOGLE_MAPS_KEY is set)
//   3) Photon (OpenStreetMap geocoder, free, no key), limited to Greater Boston
//   4) the map's bundled place names (public/data/search-places.json)
import { closestStation, DEFAULT_START, describeRoute, loadGraph, planRoute } from "@/lib/transit-route";

export interface Located {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  source: "landmark" | "google" | "osm" | "map-data" | "quest";
}
export interface Destination extends Located {
  why: string | null; // what in the photo gave the place away
  /** false when the photo isn't Boston and this is the closest Boston match. */
  inBoston?: boolean | null;
  station: { id: string; name: string; lines: string[]; walkMin: number } | null;
  ride: { minutes: number; from: string; steps: string[] } | null;
}

// [aliases (lowercase), name, lat, lng, address]
const LANDMARKS: [string[], string, number, number, string][] = [
  [["chinatown gate", "paifang", "chinatown arch", "friendship gate"], "Chinatown Gate", 42.35123, -71.05975, "Beach St & Surface Rd, Chinatown"],
  [["chinatown"], "Chinatown", 42.3505, -71.0618, "Chinatown, Boston"],
  [["container port", "container terminal", "cargo port", "shipping containers", "container ship", "container ships", "conley terminal", "conley", "gantry cranes", "ship to shore cranes"], "Conley Terminal (Boston's container port)", 42.3398, -71.0306, "940 E 1st St, South Boston"],
  [["cruise terminal", "cruise ship", "black falcon"], "Flynn Cruiseport Boston", 42.3432, -71.0345, "1 Black Falcon Ave, South Boston"],
  [["beach", "carson beach", "l street beach"], "Carson Beach, South Boston", 42.3283, -71.0459, "William J Day Blvd, South Boston"],
  [["long wharf", "boston harbor", "boston harbour", "harbor", "harbour", "waterfront", "port of boston", "port"], "Long Wharf, Boston Harbor", 42.3606, -71.0493, "Long Wharf, Boston"],
  [["rowes wharf", "harborwalk", "harbor walk"], "Rowes Wharf Harborwalk", 42.3567, -71.0505, "Rowes Wharf, Boston"],
  [["new england aquarium", "aquarium"], "New England Aquarium", 42.3590, -71.0496, "1 Central Wharf, Boston"],
  [["seaport", "fan pier", "seaport district"], "Seaport", 42.3519, -71.0442, "Seaport, Boston"],
  [["institute of contemporary art", "ica boston"], "Institute of Contemporary Art", 42.3527, -71.0429, "25 Harbor Shore Dr, Boston"],
  [["tea party ship", "tea party museum", "congress street bridge"], "Boston Tea Party Ships", 42.3522, -71.0513, "306 Congress St, Boston"],
  [["fenway park", "green monster", "fenway"], "Fenway Park", 42.34665, -71.09722, "4 Jersey St, Boston"],
  [["citgo sign", "citgo", "kenmore square", "kenmore"], "Kenmore Square (Citgo sign)", 42.34895, -71.0953, "Kenmore Square, Boston"],
  [["faneuil hall", "quincy market", "marketplace"], "Faneuil Hall Marketplace", 42.36003, -71.05479, "4 S Market St, Boston"],
  [["boston common", "frog pond"], "Boston Common", 42.355, -71.0655, "139 Tremont St, Boston"],
  [["public garden", "swan boats", "make way for ducklings"], "Boston Public Garden", 42.354, -71.07, "4 Charles St, Boston"],
  [["state house", "golden dome"], "Massachusetts State House", 42.3588, -71.0637, "24 Beacon St, Boston"],
  [["old state house"], "Old State House", 42.3587, -71.0574, "206 Washington St, Boston"],
  [["old north church"], "Old North Church", 42.3663, -71.0544, "193 Salem St, Boston"],
  [["paul revere house"], "Paul Revere House", 42.3637, -71.0537, "19 North Square, Boston"],
  [["north end", "hanover street", "mike's pastry", "little italy"], "North End (Hanover St)", 42.3634, -71.0545, "Hanover St, North End"],
  [["acorn street", "beacon hill"], "Acorn Street, Beacon Hill", 42.3576, -71.0692, "Acorn St, Beacon Hill"],
  [["copley square", "copley"], "Copley Square", 42.3499, -71.0775, "560 Boylston St, Boston"],
  [["trinity church"], "Trinity Church", 42.3499, -71.0751, "206 Clarendon St, Boston"],
  [["boston public library", "bpl"], "Boston Public Library", 42.3493, -71.0782, "700 Boylston St, Boston"],
  [["prudential", "skywalk", "pru"], "Prudential Center", 42.3471, -71.0825, "800 Boylston St, Boston"],
  [["newbury street", "newbury st"], "Newbury Street", 42.3504, -71.081, "Newbury St, Back Bay"],
  [["back bay"], "Back Bay", 42.3503, -71.0810, "Back Bay, Boston"],
  [["christian science", "mapparium", "reflecting pool"], "Christian Science Plaza", 42.3444, -71.0854, "210 Massachusetts Ave, Boston"],
  [["esplanade", "charles river", "hatch shell", "hatch memorial shell"], "Charles River Esplanade (Hatch Shell)", 42.3577, -71.0739, "Storrow Dr, Boston"],
  [["longfellow bridge", "salt and pepper bridge"], "Longfellow Bridge", 42.3619, -71.0751, "Longfellow Bridge, Boston"],
  [["zakim bridge", "zakim"], "Zakim Bridge", 42.3686, -71.0613, "Leonard P. Zakim Bunker Hill Bridge"],
  [["td garden", "north station", "celtics", "bruins"], "TD Garden", 42.3662, -71.0621, "100 Legends Way, Boston"],
  [["uss constitution", "old ironsides", "navy yard", "charlestown navy yard"], "USS Constitution", 42.3724, -71.0566, "Charlestown Navy Yard, Boston"],
  [["bunker hill monument", "bunker hill"], "Bunker Hill Monument", 42.3763, -71.0607, "Monument Square, Charlestown"],
  [["museum of fine arts", "mfa boston", "mfa"], "Museum of Fine Arts", 42.3394, -71.094, "465 Huntington Ave, Boston"],
  [["isabella stewart gardner", "gardner museum"], "Isabella Stewart Gardner Museum", 42.3382, -71.0991, "25 Evans Way, Boston"],
  [["castle island", "fort independence"], "Castle Island", 42.3379, -71.0122, "2010 William J Day Blvd, South Boston"],
  [["mit dome", "great dome", "killian court", "mit"], "MIT Great Dome", 42.3596, -71.0921, "77 Massachusetts Ave, Cambridge"],
  [["harvard yard", "john harvard statue"], "Harvard Yard", 42.3744, -71.1169, "Harvard Yard, Cambridge"],
  [["harvard square", "harvard"], "Harvard Square", 42.3734, -71.119, "Harvard Square, Cambridge"],
  [["boston university", "marsh plaza", "bu bridge", "comm ave"], "Boston University (Marsh Plaza)", 42.3505, -71.1054, "735 Commonwealth Ave, Boston"],
  [["northeastern"], "Northeastern University", 42.3398, -71.0892, "360 Huntington Ave, Boston"],
  [["downtown crossing", "macy's"], "Downtown Crossing", 42.3554, -71.0603, "Washington St, Boston"],
  [["south station"], "South Station", 42.3523, -71.0552, "700 Atlantic Ave, Boston"],
  [["greenway", "rose kennedy greenway"], "Rose Kennedy Greenway", 42.3601, -71.0532, "Rose Kennedy Greenway, Boston"],
  [["custom house"], "Custom House Tower", 42.3591, -71.0535, "3 McKinley Square, Boston"],
  [["south end"], "South End", 42.341, -71.076, "South End, Boston"],
  [["jamaica pond"], "Jamaica Pond", 42.316, -71.119, "Jamaicaway, Boston"],
  [["arnold arboretum", "arboretum"], "Arnold Arboretum", 42.3075, -71.1213, "125 Arborway, Boston"],
];

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim()} `;
const inBoston = (lat: number, lng: number) => lat > 42.2 && lat < 42.47 && lng > -71.3 && lng < -70.9;

/** Pure: the landmark whose longest alias appears in the text, if any. */
export function matchLandmark(...texts: (string | null | undefined)[]): Located | null {
  let best: { l: (typeof LANDMARKS)[number]; score: number } | null = null;
  for (const [i, text] of texts.entries()) {
    if (!text) continue;
    const t = norm(text);
    for (const l of LANDMARKS) {
      for (const a of l[0]) {
        // Earlier texts (Grok's place guess) count more than later ones (search words).
        const score = t.includes(norm(a)) ? a.length * (texts.length - i) : 0;
        if (score && (!best || score > best.score)) best = { l, score };
      }
    }
  }
  return best ? { name: best.l[1], lat: best.l[2], lng: best.l[3], address: best.l[4], source: "landmark" } : null;
}

async function getJson(url: string, ms = 8000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store", headers: { "user-agent": "Outbound/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function google(q: string, origin: string): Promise<Located | null> {
  const j = await getJson(`${origin}/api/places?text=${encodeURIComponent(`${q} Boston`)}&lat=42.355&lng=-71.065`);
  const p = (j?.places ?? []).find((x: { lat?: number; lng?: number }) => typeof x.lat === "number" && inBoston(x.lat, x.lng!));
  return p ? { name: p.name, address: p.address || null, lat: p.lat, lng: p.lng, source: "google" } : null;
}

async function photon(q: string): Promise<Located | null> {
  const j = await getJson(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=42.355&lon=-71.06&limit=5&lang=en&bbox=-71.3,42.2,-70.9,42.47`);
  for (const f of j?.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (typeof lat !== "number" || !inBoston(lat, lng)) continue;
    const pr = f.properties ?? {};
    const address = [pr.housenumber && pr.street ? `${pr.housenumber} ${pr.street}` : pr.street, pr.district ?? pr.city].filter(Boolean).join(", ");
    return { name: pr.name ?? q, address: address || null, lat, lng, source: "osm" };
  }
  return null;
}

let mapNames: Promise<[string, string, number, number][]> | null = null;
async function bundled(q: string, origin: string): Promise<Located | null> {
  mapNames ??= getJson(`${origin}/data/search-places.json`).catch(() => ((mapNames = null), []));
  const words = norm(q).trim().split(" ").filter((w) => w.length > 3);
  if (!words.length) return null;
  let best: { row: [string, string, number, number]; n: number } | null = null;
  for (const row of await mapNames) {
    const name = norm(row[0]);
    const n = words.filter((w) => name.includes(` ${w} `)).length;
    if (n && (!best || n > best.n)) best = { row, n };
  }
  return best ? { name: best.row[0], address: null, lat: best.row[3], lng: best.row[2], source: "map-data" } : null;
}

/** Find a Boston place from Grok's guesses, most specific first. Never throws; null if nothing fits. */
export async function locate(queries: (string | null | undefined)[], origin: string): Promise<Located | null> {
  const qs = [...new Set(queries.map((q) => q?.trim()).filter((q): q is string => !!q))];
  const known = matchLandmark(...qs);
  if (known) return known;
  for (const find of [(q: string) => google(q, origin), photon, (q: string) => bundled(q, origin)]) {
    for (const q of qs) {
      const hit = await find(q).catch((e) => (console.warn("[guide] locate:", (e as Error).message), null));
      if (hit) return hit;
    }
  }
  return null;
}

/** Add the closest T stop and the ride from campus (BU Central unless we know better). */
export async function toDestination(place: Located, why: string | null, origin: string, from = DEFAULT_START): Promise<Destination> {
  try {
    const g = await loadGraph(origin);
    const station = closestStation(g, [place.lng, place.lat]);
    const r = planRoute(g, from, [place.lng, place.lat], place.name);
    return { ...place, why, station, ride: { minutes: r.minutes, from: "BU Central", steps: describeRoute(r) } };
  } catch (e) {
    console.warn("[guide] route to destination failed:", (e as Error).message);
    return { ...place, why, station: null, ride: null };
  }
}

/** Text for the Trip Planner's brief. */
export function destinationBrief(d: Destination) {
  return [
    `DESTINATION (located from the photo): ${d.name}${d.address ? `, ${d.address}` : ""} at ${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}.`,
    d.station ? `Closest T stop: ${d.station.name} (${d.station.lines.join("/")} Line, station id ${d.station.id}), ${d.station.walkMin} min walk.` : "",
    d.ride ? `Route from BU Central, about ${d.ride.minutes} min: ${d.ride.steps.join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}
