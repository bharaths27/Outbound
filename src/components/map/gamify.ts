// Map game layer: XP for visiting places, more XP the farther you ride from home, a weekly
// Expedition, and fog that clears as you explore. Owner: Person 1 (map frontend).
// The XP numbers here are placeholders until Person 4's rules ship; keep the same shapes.
import type { Quest } from "./places";

export interface GameStation {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lon: number;
}

/** Your home station: the T stop nearest your school. Sample: BU until profiles give us the real one. */
export const DEFAULT_HOME = "place-bucen";
export const CHECKIN_RADIUS_M = 75;
export const REPEAT_SHARE = 0.25; // later visits earn a quarter
export const EXPEDITION_BONUS = 50;
export const NEW_AREA_BONUS = 25;
const EXPLORED_HOME_M = 1400;
const EXPLORED_VISIT_M = 800;

export const haversineM = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export function nearestStation(stations: GameStation[], lat: number, lon: number) {
  let best: GameStation | null = null, d = Infinity;
  for (const s of stations) {
    const x = haversineM(lat, lon, s.lat, s.lon);
    if (x < d) {
      d = x;
      best = s;
    }
  }
  return best;
}

export interface Ride {
  from: GameStation;
  to: GameStation;
  minutes: number;
  line: string; // line you arrive on
  transfer: boolean;
}

/** Rough ride time: track distance (~1.3x straight line) at ~25 km/h, plus waiting, plus a transfer if needed. */
export function estimateRide(from: GameStation, to: GameStation): Ride {
  const km = (haversineM(from.lat, from.lon, to.lat, to.lon) * 1.3) / 1000;
  const shared = to.lines.find((l) => from.lines.includes(l));
  const transfer = !shared && from.id !== to.id;
  const minutes = from.id === to.id ? 0 : Math.round((km / 25) * 60 + 4 + (transfer ? 6 : 0));
  return { from, to, minutes, line: shared ?? to.lines[0], transfer };
}

/** Farther from home pays more, capped at 2x so living far out doesn't win by default. */
export const distanceMultiplier = (minutes: number) => (minutes >= 30 ? 2 : minutes >= 15 ? 1.5 : 1);

export interface SpotXp {
  base: number;
  mult: number;
  distanceXp: number; // base x mult
  expeditionBonus: number;
  firstVisit: boolean;
  total: number; // what you'd earn checking in now
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export function spotXp(q: Quest, ride: Ride, visited: boolean, expedition: boolean): SpotXp {
  const mult = distanceMultiplier(ride.minutes);
  const distanceXp = round5(q.points * mult);
  const expeditionBonus = expedition && !visited ? EXPEDITION_BONUS : 0;
  const total = visited ? round5(distanceXp * REPEAT_SHARE) : distanceXp + expeditionBonus;
  return { base: q.points, mult, distanceXp, expeditionBonus, firstVisit: !visited, total };
}

/** ISO-ish week number in Boston time: the Expedition changes every Monday. */
export function weekKey(d = new Date()) {
  const t = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = (t.getDay() + 6) % 7; // Monday = 0
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() - day);
  return Math.floor(t.getTime() / (7 * 86400000));
}

/** This week's 3 Expedition spots: picked from the far-out ones (1.5x or more), same for everyone from the same home. */
export function pickExpeditions(quests: Quest[], rides: Map<string, Ride>, week = weekKey()) {
  const far = quests.filter((q) => (rides.get(q.id)?.minutes ?? 0) >= 15);
  const scored = far.map((q) => ({ q, k: hash(`${q.id}:${week}`) })).sort((a, b) => a.k - b.k);
  return new Set(scored.slice(0, 3).map((s) => s.q.id));
}
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- levels ----------
/** XP needed to go from level n to n+1: 150, 250, 350, ... */
export const levelStep = (n: number) => 50 + 100 * n;
export function levelOf(xp: number) {
  let level = 1, floor = 0;
  while (xp >= floor + levelStep(level)) floor += levelStep(level++);
  return { level, into: xp - floor, need: levelStep(level) };
}

// ---------- fog of war ----------
/** The T area the fog covers, as a grid of ~450 m cells. Explored cells are left out. */
const FOG_BOX = { w: -71.6, s: 42.0, e: -70.7, n: 42.65 }; // past the pan limits, so no fog edge ever shows
const T_BOX = { w: -71.275, s: 42.195, e: -70.965, n: 42.45 }; // the part that counts toward "% explored"
const CELL_LAT = 0.004, CELL_LON = 0.0055;

export function fogGeoJSON(home: GameStation, visited: { lat: number; lon: number }[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let lat = FOG_BOX.s; lat < FOG_BOX.n; lat += CELL_LAT) {
    for (let lon = FOG_BOX.w; lon < FOG_BOX.e; lon += CELL_LON) {
      const cLat = lat + CELL_LAT / 2, cLon = lon + CELL_LON / 2;
      if (haversineM(cLat, cLon, home.lat, home.lon) < EXPLORED_HOME_M) continue;
      if (visited.some((v) => haversineM(cLat, cLon, v.lat, v.lon) < EXPLORED_VISIT_M)) continue;
      const inT = cLon > T_BOX.w && cLon < T_BOX.e && cLat > T_BOX.s && cLat < T_BOX.n;
      features.push({
        type: "Feature",
        properties: inT ? { t: 1 } : {},
        geometry: { type: "Polygon", coordinates: [[[lon, lat], [lon + CELL_LON, lat], [lon + CELL_LON, lat + CELL_LAT], [lon, lat + CELL_LAT], [lon, lat]]] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Share of the T area you've uncovered, 0..1. */
export function exploredShare(fog: GeoJSON.FeatureCollection) {
  const cols = Math.round((T_BOX.e - T_BOX.w) / CELL_LON), rows = Math.round((T_BOX.n - T_BOX.s) / CELL_LAT);
  const foggy = fog.features.filter((f) => f.properties?.t).length;
  return Math.max(0, 1 - foggy / (cols * rows));
}

// ---------- saved progress (this browser, until Person 3's visits table is wired in) ----------
export interface Progress {
  xp: number;
  visits: Record<string, number[]>; // quest id -> check-in times
}
const KEY = "outbound.game.v1";
/** Sample starting point so the demo has a level and one cleared area. */
const SAMPLE: Progress = { xp: 320, visits: { q6: [Date.now() - 3 * 86400000] } };

export function loadProgress(): Progress {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (j && typeof j.xp === "number" && j.visits) return j;
  } catch {}
  return structuredClone(SAMPLE);
}
export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}
export const checkedInToday = (p: Progress, id: string) =>
  (p.visits[id] ?? []).some((t) => new Date(t).toDateString() === new Date().toDateString());

/** T stops inside the area you've uncovered (home plus every place you've checked in). */
export function exploredStops(stations: GameStation[], home: GameStation, visited: { lat: number; lon: number }[]) {
  const n = stations.filter(
    (s) => haversineM(s.lat, s.lon, home.lat, home.lon) < EXPLORED_HOME_M || visited.some((v) => haversineM(s.lat, s.lon, v.lat, v.lon) < EXPLORED_VISIT_M),
  ).length;
  return { n, total: stations.length };
}
