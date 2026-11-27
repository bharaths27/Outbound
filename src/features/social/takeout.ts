// Reads the "Reviews.json" file from Google Takeout (Maps (your places) → Reviews.json).
// Google doesn't let other apps read your reviews directly, so the player downloads this file
// and drops it here. Handles the current GeoJSON layout and the older "Location"/"Star Rating" one.

import type { ImportedReview } from "@/lib/data/types";

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function day(v: unknown): string {
  const s = str(v);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return new Date().toISOString().slice(0, 10);
  return new Date(t).toISOString().slice(0, 10);
}

function fromFeature(f: Json): ImportedReview | null {
  const p = obj(f.properties);
  const loc = obj(p.location ?? p.Location);
  const coords = obj(f.geometry).coordinates;
  const geo = obj(loc["Geo Coordinates"]);
  const name = str(loc.name) || str(loc["Business Name"]) || str(p.Title);
  const stars = num(p.five_star_rating_published ?? p["Star Rating"] ?? p.rating);
  if (!name || stars === null || stars < 1 || stars > 5) return null;
  const [lon, lat] = Array.isArray(coords) ? coords : [];
  return {
    name: name.slice(0, 200),
    address: str(loc.address) || str(loc.Address) || null,
    lat: num(lat) ?? num(geo.Latitude),
    lon: num(lon) ?? num(geo.Longitude),
    stars,
    text: (str(p.review_text_published) || str(p["Review Comment"])).slice(0, 600),
    date: day(p.date ?? p.Published ?? p["Updated"]),
  };
}

/** Parses the file text. Throws a readable error when it isn't a Takeout reviews file. */
export function parseTakeoutReviews(text: string): ImportedReview[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("That file isn't JSON. Look for Reviews.json inside the Takeout folder.");
  }
  const features = Array.isArray(obj(json).features) ? (obj(json).features as unknown[]) : Array.isArray(json) ? (json as unknown[]) : null;
  if (!features) throw new Error("No reviews found. Make sure it's Reviews.json from Maps (your places).");
  return features.map((f) => fromFeature(obj(f))).filter((r): r is ImportedReview => r !== null);
}
