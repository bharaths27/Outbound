"use client";
// Google-Maps-style exploring: "local eats", "coffee near me" -> pins + list with rating, price, open now,
// filter chips (Craving / Budget / Time), a place card, and directions by T + walking drawn on the map.
// Uses /api/places (Google Places) and /api/route (Google Routes); without a Google key these return nothing.
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { ArrowLeft, Clock, Coffee, FerrisWheel, Footprints, IceCreamCone, MapPin, Star, Utensils, Wine, X } from "lucide-react";
import { createElement, type IconNode, Coffee as CoffeeNode, FerrisWheel as FerrisNode, IceCreamCone as IceCreamNode, MapPin as MapPinNode, Utensils as UtensilsNode, Wine as WineNode } from "lucide";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";

export interface Place {
  id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  types: string[];
  category: string;
  rating: number | null;
  ratings: number;
  price: number | null;
  openNow: boolean | null;
  url: string | null;
}
interface Step {
  mode: "walk" | "transit";
  text?: string;
  minutes: number;
  meters?: number;
  line?: string;
  color?: string;
  from?: string;
  to?: string;
  headsign?: string;
  stops?: number;
  depart?: string;
}
interface Route {
  minutes: number;
  distanceKm: number;
  segments: { mode: string; color: string; path: [number, number][] }[];
  steps: Step[];
}
export interface ExplorerHandle {
  search: (q: string) => void;
  show: (p: Place) => void;
}

type IconC = typeof MapPin;
const CRAVINGS: [string, IconC | null, string[], IconNode | null][] = [
  ["All", null, [], null],
  ["Food", Utensils, ["restaurant", "food", "meal_takeaway"], UtensilsNode],
  ["Coffee", Coffee, ["cafe", "coffee_shop"], CoffeeNode],
  ["Dessert", IceCreamCone, ["bakery", "ice_cream_shop", "dessert_shop", "dessert_restaurant"], IceCreamNode],
  ["Bars", Wine, ["bar", "pub", "night_club"], WineNode],
  ["Fun", FerrisWheel, ["tourist_attraction", "museum", "park", "amusement_center", "movie_theater"], FerrisNode],
];
const cravingOf = (types: string[]) => CRAVINGS.find(([, , t]) => t.some((x) => types.includes(x)));
const IconFor = ({ types, size = 18 }: { types: string[]; size?: number }) => {
  const I = cravingOf(types)?.[1] ?? MapPin;
  return <I size={size} strokeWidth={2} aria-hidden />;
};
/** the same icon as an SVG string, for map pins (plain DOM elements) */
const iconSvg = (types: string[]) => {
  const el = createElement(cravingOf(types)?.[3] ?? MapPinNode);
  el.setAttribute("width", "14");
  el.setAttribute("height", "14");
  el.setAttribute("stroke-width", "2.2");
  return el.outerHTML;
};
const stars = (r: number | null) => (r == null ? "" : `${r.toFixed(1)}`);
const dollars = (p: number | null) => (p == null ? "" : p === 0 ? "Free" : "$".repeat(p));

const Explorer = forwardRef<ExplorerHandle, { map: MlMap | null; userLoc: [number, number] | null }>(function Explorer({ map, userLoc }, ref) {
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [craving, setCraving] = useState("All");
  const [budget, setBudget] = useState<number | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const pins = useRef<maplibregl.Marker[]>([]);

  const filtered = useMemo(() => {
    if (!results) return null;
    const types = CRAVINGS.find(([n]) => n === craving)?.[2] ?? [];
    return results.filter(
      (p) => (!types.length || types.some((t) => p.types.includes(t))) && (budget == null || (p.price != null && p.price <= budget)) && (!openNow || p.openNow),
    );
  }, [results, craving, budget, openNow]);

  useImperativeHandle(ref, () => ({
    search: (q: string) => void runSearch(q),
    show: (p: Place) => {
      setPlace(p);
      setRoute(null);
      map?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16.2), pitch: map.getPitch(), duration: 1800 });
    },
  }));

  async function runSearch(q: string) {
    if (!map) return;
    setQuery(q);
    setPlace(null);
    setRoute(null);
    setLoading(true);
    setError(null);
    const c = userLoc && Math.hypot(userLoc[0] - map.getCenter().lng, userLoc[1] - map.getCenter().lat) < 0.05 ? { lng: userLoc[0], lat: userLoc[1] } : map.getCenter();
    try {
      const r = await fetch(`/api/places?text=${encodeURIComponent(q)}&lat=${c.lat}&lng=${c.lng}`);
      const j = await r.json();
      if (j.disabled) throw new Error("Place search needs the Google key (works in the app, not the artifact).");
      if (!r.ok || !Array.isArray(j.places)) throw new Error(j.error ?? "Search failed");
      setResults(j.places);
      if (j.places.length) {
        const b = new maplibregl.LngLatBounds();
        j.places.forEach((p: Place) => b.extend([p.lng, p.lat]));
        map.fitBounds(b, { padding: { top: 120, bottom: 80, left: 380, right: 220 }, maxZoom: 16, pitch: map.getPitch(), duration: 1800 });
      }
    } catch (e) {
      setResults([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // pins for the results (and the chosen place)
  useEffect(() => {
    pins.current.forEach((m) => m.remove());
    pins.current = [];
    if (!map) return;
    const list = place ? [place] : filtered ?? [];
    for (const p of list) {
      const el = document.createElement("button");
      el.className = "ob-place-pin";
      el.innerHTML = `<span class="ob-place-pin-icon">${iconSvg(p.types)}</span>${p.rating ? `<span class="ob-place-pin-rating">${p.rating.toFixed(1)}</span>` : ""}`;
      el.title = p.name;
      el.onclick = (e) => {
        e.stopPropagation();
        setPlace(p);
        setRoute(null);
      };
      pins.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }, [map, filtered, place]);

  // route on the map: colored T legs, dashed walking legs
  useEffect(() => {
    if (!map) return;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (route?.segments ?? []).filter((s) => s.path.length > 1).map((s) => ({ type: "Feature", properties: { mode: s.mode, color: s.color }, geometry: { type: "LineString", coordinates: s.path } })),
    };
    const src = map.getSource("route") as GeoJSONSource | undefined;
    if (src) src.setData(data);
    else {
      map.addSource("route", { type: "geojson", data });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      map.addLayer({ id: "route-walk", type: "line", source: "route", filter: ["==", ["get", "mode"], "walk"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#5b6b7a", "line-width": 4, "line-dasharray": [0.1, 2] } });
      map.addLayer({ id: "route-transit", type: "line", source: "route", filter: ["==", ["get", "mode"], "transit"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 6 } });
    }
  }, [map, route]);

  async function directions(p: Place) {
    if (!map) return;
    const from = userLoc ?? [map.getCenter().lng, map.getCenter().lat];
    setRouting(true);
    setError(null);
    try {
      const r = await fetch(`/api/route?from=${from[1]},${from[0]}&to=${p.lat},${p.lng}`);
      const j = await r.json();
      if (j.disabled) throw new Error("Directions need the Google key (works in the app, not the artifact).");
      if (!r.ok) throw new Error(j.error ?? "No route found");
      setRoute(j);
      const b = new maplibregl.LngLatBounds();
      j.segments.forEach((s: { path: [number, number][] }) => s.path.forEach((pt) => b.extend(pt)));
      if (!b.isEmpty()) map.fitBounds(b, { padding: { top: 120, bottom: 80, left: 380, right: 220 }, pitch: map.getPitch(), duration: 1800 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRouting(false);
    }
  }

  const close = () => {
    setQuery(null);
    setResults(null);
    setPlace(null);
    setRoute(null);
    setError(null);
  };

  if (!query && !place) return null;
  return (
    <div className="ob-panel flex max-h-[min(70vh,560px)] w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden text-sm">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[var(--ob-line)] px-3 py-2">
        {place && results && (
          <button className="rounded px-1 text-[var(--ob-muted)] hover:text-[var(--ob-ink)]" onClick={() => (setPlace(null), setRoute(null))} aria-label="Back to results">
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="min-w-0 flex-1 truncate font-medium text-[var(--ob-ink)]">{place ? place.name : `“${query}”`}</div>
        <button className="rounded px-1 text-[var(--ob-muted)] hover:text-[var(--ob-ink)]" onClick={close} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      {!place && (
        <>
          {/* filter chips, like the mockup: Craving / Budget / Time */}
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--ob-line)] px-3 py-2 text-xs">
            {CRAVINGS.map(([n, Icon]) => (
              <button key={n} onClick={() => setCraving(n)} className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${craving === n ? "bg-[var(--ob-maroon)] text-white" : "bg-[var(--ob-sand)] text-[var(--ob-ink-2)]"}`}>
                {Icon && <Icon size={13} strokeWidth={2.2} aria-hidden />}
                {n}
              </button>
            ))}
            {[1, 2, 3].map((b) => (
              <button key={b} onClick={() => setBudget(budget === b ? null : b)} className={`rounded-full px-2.5 py-1 ${budget === b ? "bg-[var(--ob-maroon)] text-white" : "bg-[var(--ob-sand)] text-[var(--ob-ink-2)]"}`}>
                {"$".repeat(b)}
              </button>
            ))}
            <button onClick={() => setOpenNow(!openNow)} className={`rounded-full px-2.5 py-1 ${openNow ? "bg-[var(--ob-maroon)] text-white" : "bg-[var(--ob-sand)] text-[var(--ob-ink-2)]"}`}>
              <Clock size={13} strokeWidth={2.2} className="mr-1 inline -translate-y-px" aria-hidden />
              Open now
            </button>
          </div>
          <div className="overflow-auto">
            {loading && <div className="px-3 py-3 text-xs text-[var(--ob-muted)]">Searching…</div>}
            {error && <div className="px-3 py-3 text-xs text-amber-800">{error}</div>}
            {filtered && !loading && !error && filtered.length === 0 && <div className="px-3 py-3 text-xs text-[var(--ob-muted)]">Nothing matches these filters.</div>}
            {filtered?.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPlace(p);
                  map?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16.2), pitch: map.getPitch(), duration: 1500 });
                }}
                className="flex w-full gap-2.5 border-b border-[var(--ob-line)] px-3 py-2 text-left hover:bg-[var(--ob-cream)]"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ob-maroon)]/10 text-[var(--ob-maroon)]">
                  <IconFor types={p.types} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--ob-ink)]">{p.name}</span>
                  <span className="block truncate text-xs text-[var(--ob-muted)]">
                    {p.rating != null && <Star size={11} className="mr-0.5 inline -translate-y-px fill-amber-400 text-amber-400" aria-hidden />}
                    {[stars(p.rating) + (p.ratings ? ` (${p.ratings.toLocaleString()})` : ""), dollars(p.price), p.category].filter(Boolean).join(" · ")}
                  </span>
                  {p.openNow != null && <span className={`text-[11px] ${p.openNow ? "text-emerald-700" : "text-rose-700"}`}>{p.openNow ? "Open now" : "Closed"}</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {place && (
        <div className="overflow-auto px-3 py-2.5">
          <div className="text-xs text-[var(--ob-ink-2)]">
            {place.rating != null && <Star size={11} className="mr-0.5 inline -translate-y-px fill-amber-400 text-amber-400" aria-hidden />}
                    {[stars(place.rating) + (place.ratings ? ` (${place.ratings.toLocaleString()})` : ""), dollars(place.price), place.category].filter(Boolean).join(" · ")}
          </div>
          {place.openNow != null && <div className={`text-xs ${place.openNow ? "text-emerald-700" : "text-rose-700"}`}>{place.openNow ? "Open now" : "Closed now"}</div>}
          <div className="mt-1 text-xs text-[var(--ob-muted)]">{place.address}</div>
          <div className="mt-2.5 flex gap-2">
            <button className="flex-1 rounded-lg bg-[var(--ob-maroon)] px-3 py-1.5 font-medium text-white disabled:opacity-60" disabled={routing} onClick={() => directions(place)}>
              {routing ? "Finding route…" : "Directions"}
            </button>
            {place.url && (
              <a className="rounded-lg bg-[var(--ob-sand)] px-3 py-1.5 text-[var(--ob-ink-2)]" href={place.url} target="_blank" rel="noreferrer">
                Google Maps
              </a>
            )}
          </div>
          {error && <div className="mt-2 text-xs text-amber-800">{error}</div>}
          {route && (
            <div className="mt-3">
              <div className="text-xs font-medium text-[var(--ob-ink)]">
                {route.minutes} min · {route.distanceKm} km {userLoc ? "from you" : "from the map center"}
              </div>
              <ol className="mt-1.5 flex flex-col gap-1.5">
                {route.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-xs text-[var(--ob-ink-2)]">
                    {s.mode === "walk" ? (
                      <>
                        <span className="flex w-12 shrink-0 items-center gap-0.5 text-[var(--ob-muted)]"><Footprints size={12} aria-hidden /> {s.minutes}m</span>
                        <span>{s.text}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-12 shrink-0 rounded px-1 text-center font-semibold text-white" style={{ background: s.color }}>
                          {s.line}
                        </span>
                        <span>
                          {s.from} → {s.to}
                          <span className="block text-[11px] text-[var(--ob-muted)]">
                            {[s.headsign && `toward ${s.headsign}`, s.stops && `${s.stops} stops`, `${s.minutes} min`, s.depart && `leaves ${s.depart}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
export default Explorer;
