"use client";
// Search places and streets like a normal map.
//   - always: T stations, campuses, and a bundled index of Boston/Cambridge streets, parks and landmarks (data/search-places.json)
//   - online: Photon geocoder (OpenStreetMap data, free, no key), biased to Boston
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap } from "maplibre-gl";
import { CAMPUSES } from "./places";
import type { Place } from "./Explorer";

export interface SearchStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lines: string[];
}
type Kind = "station" | "campus" | "place" | "street" | "park" | "address";
interface Result {
  key: string;
  name: string;
  sub: string;
  kind: Kind;
  lng: number;
  lat: number;
  bbox?: [number, number, number, number];
  stationId?: string;
  placeId?: string; // Google suggestion: location is looked up when picked
}

/** Ray-casting point-in-polygon for a single [lng, lat] ring. */
export function pointInRing(pt: [number, number], ring: [number, number][]) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
// common street abbreviations, so "mass ave" finds "Massachusetts Avenue" and "tremont st" finds "Tremont Street"
const ABBR: Record<string, string> = { st: "street", ave: "avenue", av: "avenue", rd: "road", blvd: "boulevard", pl: "place", sq: "square", pk: "park", dr: "drive", ct: "court", hwy: "highway", pkwy: "parkway", mass: "massachusetts", mt: "mount", n: "north", s: "south", e: "east", w: "west" };
const expand = (s: string) => norm(s).split(" ").map((w) => ABBR[w] ?? w).join(" ");

function score(name: string, q: string) {
  const n = expand(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(" " + q)) return 2;
  const words = q.split(" ");
  if (words.every((w) => n.includes(w))) return 3;
  return -1;
}

const KIND_LABEL: Record<Kind, string> = { station: "T station", campus: "Campus", place: "Place", street: "Street", park: "Park", address: "Address" };
const KIND_DOT: Record<Kind, string> = { station: "#0f172a", campus: "#A31F34", place: "#64748b", street: "#94a3b8", park: "#4d9a52", address: "#64748b" };

export default function SearchBox({
  map,
  stations,
  online,
  onStation,
  onTextSearch,
  onPlace,
  inCard = false,
}: {
  map: MlMap | null;
  stations: SearchStation[];
  online: boolean;
  onStation: (id: string) => void;
  /** "local eats", "coffee near me": show many places like Google Maps */
  onTextSearch?: (q: string) => void;
  /** a Google place was picked: show its card (rating, directions) */
  onPlace?: (p: Place) => void;
  /** Sits in the Explore card: full width, styled like the card's filter chips. */
  inCard?: boolean;
}) {
  const [q, setQ] = useState("");
  // our Google search route answers (a server with a key): search works even when the basemap tiles are offline
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    fetch("/api/places")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setGoogle(Array.isArray(j?.results)))
      .catch(() => setGoogle(false));
  }, []);
  const live = online || google;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // -1 = the "Search for …" row (Enter searches like Google Maps)
  const [places, setPlaces] = useState<[string, string, number, number][]>([]);
  const [remote, setRemote] = useState<Result[]>([]);
  const marker = useRef<maplibregl.Marker | null>(null);
  const session = useRef(Math.random().toString(36).slice(2)); // groups Google autocomplete calls for billing
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(new URL("/data/search-places.json", document.baseURI))
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, []);

  const query = expand(q);

  const local = useMemo<Result[]>(() => {
    if (query.length < 2) return [];
    const out: (Result & { s: number })[] = [];
    for (const s of stations) {
      const sc = score(s.name, query);
      if (sc >= 0) out.push({ key: `st-${s.id}`, name: s.name, sub: `${s.lines.join(", ")} Line`, kind: "station", lng: s.lon, lat: s.lat, stationId: s.id, s: sc - 0.5 });
    }
    for (const c of CAMPUSES) {
      const sc = Math.min(...[score(c.name, query), score(c.short, query)].map((v) => (v < 0 ? 99 : v)));
      if (sc < 99) out.push({ key: `c-${c.short}`, name: c.name, sub: "Campus", kind: "campus", lng: c.lng, lat: c.lat, s: sc - 0.4 });
    }
    for (const [name, kind, lng, lat] of places) {
      const sc = score(name, query);
      if (sc >= 0) out.push({ key: `p-${name}-${lng}`, name, sub: KIND_LABEL[kind as Kind] ?? "Place", kind: kind as Kind, lng, lat, s: sc + (kind === "street" ? 0.1 : 0) });
    }
    out.sort((a, b) => a.s - b.s || a.name.length - b.name.length);
    // one row per name ("Massachusetts Ave" and "Massachusetts Avenue" are the same street)
    const seen = new Set<string>();
    return out.filter((r) => {
      const k = expand(r.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 8);
  }, [query, stations, places]);

  // online geocoder, debounced
  useEffect(() => {
    setRemote([]);
    if (!live || q.trim().length < 3) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      // 1) Google Places (any place or address, like Google Maps), through our /api/places route
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}&session=${session.current}`, { signal: ctl.signal });
        const j = await r.json();
        if (r.ok && Array.isArray(j.results)) {
          setRemote(
            j.results.map((p: { id: string; name: string; sub: string; types: string[] }) => ({
              key: `g-${p.id}`,
              name: p.name,
              sub: p.sub,
              kind: (p.types.includes("route") ? "street" : p.types.includes("street_address") || p.types.includes("premise") ? "address" : p.types.includes("park") ? "park" : "place") as Kind,
              lng: NaN,
              lat: NaN,
              placeId: p.id,
            })),
          );
          return;
        }
      } catch {
        /* no Google key or no server (artifact): use the free geocoder */
      }
      // 2) Photon (OpenStreetMap), free, no key
      try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=42.36&lon=-71.06&limit=6&lang=en&bbox=-73.6,41.2,-69.8,42.9`;
        const r = await fetch(url, { signal: ctl.signal });
        if (!r.ok) return;
        const j = await r.json();
        setRemote(
          (j.features ?? []).map((f: { geometry: { coordinates: [number, number] }; properties: Record<string, string | number[]> }, i: number) => {
            const p = f.properties;
            const street = p.housenumber ? `${p.housenumber} ${p.street ?? ""}`.trim() : (p.street as string);
            const name = (p.name as string) || street || (p.city as string) || q;
            const sub = [p.name && street ? street : null, p.city ?? p.county, p.state].filter(Boolean).join(", ");
            const e = p.extent as unknown as number[] | undefined;
            return {
              key: `r-${i}-${p.osm_id}`,
              name,
              sub,
              kind: (p.osm_key === "highway" ? "street" : p.housenumber ? "address" : p.osm_key === "leisure" ? "park" : "place") as Kind,
              lng: f.geometry.coordinates[0],
              lat: f.geometry.coordinates[1],
              bbox: e && e.length === 4 ? [e[0], e[3], e[2], e[1]] : undefined,
            };
          }),
        );
      } catch {
        /* offline or blocked: local results only */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, live]);

  const results = useMemo(() => {
    // with Google: our stations/campuses first, then Google's places and addresses
    const google = remote.some((r) => r.placeId);
    const mine = google ? local.filter((r) => r.kind === "station" || r.kind === "campus").slice(0, 3) : local;
    const seen = new Set(mine.map((r) => expand(r.name)));
    return [...mine, ...remote.filter((r) => !seen.has(expand(r.name)))].slice(0, 9);
  }, [local, remote]);

  useEffect(() => setActive(-1), [results.length]);
  const textSearch = () => {
    if (!onTextSearch || q.trim().length < 2) return;
    setOpen(false);
    marker.current?.remove();
    onTextSearch(q.trim());
  };

  // close when clicking elsewhere
  useEffect(() => {
    const h = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, []);

  const go = async (r: Result) => {
    setOpen(false);
    setQ(r.name);
    if (!map) return;
    if (r.placeId) {
      try {
        const d = await (await fetch(`/api/places?id=${encodeURIComponent(r.placeId)}&session=${session.current}`)).json();
        session.current = Math.random().toString(36).slice(2);
        if (typeof d.lng !== "number") return;
        // a business or landmark: open its card (rating, open now, directions)
        if (onPlace && d.id && !(d.types ?? []).some((t: string) => ["route", "locality", "sublocality", "neighborhood", "administrative_area_level_1", "administrative_area_level_2", "postal_code", "country"].includes(t))) {
          marker.current?.remove();
          onPlace(d);
          return;
        }
        r = { ...r, lng: d.lng, lat: d.lat, bbox: d.bbox ?? undefined };
      } catch {
        return;
      }
    }
    marker.current?.remove();
    if (r.kind !== "station" && r.kind !== "campus") {
      const el = document.createElement("div");
      el.innerHTML = '<div class="ob-search-pin"></div>'; // inner div: MapLibre owns the outer element's transform
      marker.current = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([r.lng, r.lat]).addTo(map);
    }
    const pitch = map.getPitch();
    if (r.bbox && (r.bbox[2] - r.bbox[0] > 0.004 || r.bbox[3] - r.bbox[1] > 0.004)) {
      map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: 80, pitch, duration: 2200, maxZoom: 16.5 });
    } else {
      const zoom = r.kind === "street" || r.kind === "station" ? 16 : r.kind === "campus" ? 15.2 : 16.6;
      map.flyTo({ center: [r.lng, r.lat], zoom, pitch, duration: 2200 });
    }
    if (r.stationId) onStation(r.stationId);
  };

  const clear = () => {
    setQ("");
    setRemote([]);
    marker.current?.remove();
    marker.current = null;
  };

  return (
    <div ref={boxRef} className={inCard ? "relative w-full" : "relative w-[min(340px,calc(100vw-212px))] min-w-[150px] sm:w-[340px]"}>
      <div
        className={
          inCard
            ? "flex h-9 items-center gap-2 rounded-full border border-border-strong bg-sand/70 px-3.5 text-[13px] transition-colors focus-within:border-maroon focus-within:bg-surface"
            : "ob-panel flex items-center gap-2 px-3 py-2"
        }
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="shrink-0 text-[var(--ob-muted)]" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            }
            else if (e.key === "Enter") {
              if (results[active]) go(results[active]);
              else if (onTextSearch && live) textSearch();
              else if (results[0]) go(results[0]);
            }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Where to? Places, food, addresses"
          aria-label="Search places, food, addresses"
          role="combobox"
          aria-expanded={open && query.length >= 2}
          aria-controls="ob-search-results"
          aria-autocomplete="list"
          className={`w-full min-w-0 bg-transparent text-[var(--ob-ink)] outline-none placeholder:text-[var(--ob-muted)] ${inCard ? "text-base desk:text-sm" : "text-sm"}`}
        />
        {q && (
          <button onClick={clear} aria-label="Clear search" className="shrink-0 rounded px-1 text-[var(--ob-muted)] hover:text-[var(--ob-ink-2)]">
            ×
          </button>
        )}
      </div>
      {open && query.length >= 2 && (
        <div id="ob-search-results" role="listbox" aria-label="Search suggestions" className={`ob-panel !bg-[var(--ob-paper)] absolute left-0 right-0 top-full z-20 mt-1.5 animate-in overflow-auto py-1 text-sm fade-in slide-in-from-top-1 duration-150 ${inCard ? "max-h-[min(50vh,420px)] shadow-xl" : "max-h-[60vh]"}`}>
          {onTextSearch && live && (
            <button
              role="option"
              aria-selected={active === -1}
              onMouseEnter={() => setActive(-1)}
              onClick={textSearch}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${active === -1 ? "bg-[var(--ob-sand)]" : ""}`}
            >
              <Search size={14} className="text-[var(--ob-muted)]" aria-hidden />
              <span className="truncate text-[var(--ob-ink)]">
                Search for <b>{q.trim()}</b> nearby
              </span>
            </button>
          )}
          {results.length === 0 && !(onTextSearch && live) && <div className="px-3 py-2 text-xs text-[var(--ob-muted)]">No matches{live ? "" : " in the offline index"}</div>}
          {results.map((r, i) => (
            <button
              key={r.key}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${i === active ? "bg-[var(--ob-sand)]" : ""}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_DOT[r.kind] }} />
              <span className="min-w-0">
                <span className="block truncate text-[var(--ob-ink)]">{r.name}</span>
                <span className="block truncate text-[11px] text-[var(--ob-muted)]">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
