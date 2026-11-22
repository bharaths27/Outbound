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
  fare?: number;
  // route options (/api/route?alts=1)
  label?: string;
  transfers?: number;
  walkMin?: number;
  rideMin?: number;
}
type LL = [number, number];
const kmBetween = (a: LL, b: LL) => {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), dy = (a[1] - b[1]) * 110.57;
  return Math.hypot(dx, dy);
};
const bearing = (a: LL, b: LL) => (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
const pathOf = (r: Route): LL[] => r.segments.flatMap((x) => x.path);
/** The point `f` (0..1) of the way along a path, and the heading there. */
function along(path: LL[], f: number): { pt: LL; heading: number } {
  const lens = path.slice(1).map((p, i) => kmBetween(path[i], p));
  let left = lens.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, f));
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, left / lens[i]) : 0;
      const a = path[i], b = path[i + 1];
      return { pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) };
    }
    left -= lens[i];
  }
  return { pt: path[0], heading: 0 };
}
/** Where you are on a route: the step you're on, minutes left, distance to the end. */
function progressOn(r: Route, pos: LL) {
  // segments line up with the steps that aren't "Transfer at ..." (transfers have no line on the map)
  const stepIdx = r.steps.map((x, i) => [x, i] as const).filter(([x]) => !x.text?.startsWith("Transfer")).map(([, i]) => i);
  let best = 0, bestD = Infinity;
  r.segments.forEach((seg, si) => seg.path.forEach((pt) => {
    const d = kmBetween(pt, pos);
    if (d < bestD) { bestD = d; best = si; }
  }));
  const step = stepIdx[best] ?? 0;
  const end = pathOf(r).at(-1)!;
  const toEnd = kmBetween(pos, end);
  const left = r.steps.slice(step).reduce((n, x) => n + x.minutes, 0);
  return { step, minutesLeft: toEnd < 0.08 ? 0 : left, toEndKm: toEnd, offRoute: bestD > 0.3, arrived: toEnd < 0.08 };
}
/** " · $2.40 fare", " · free (walk)", or nothing when the route didn't say. */
const fareLabel = (fare?: number) => (fare === undefined ? "" : fare > 0 ? ` · ${"$"}${fare.toFixed(2)} fare` : " · free (walk)");

export interface ExplorerHandle {
  search: (q: string) => void;
  show: (p: Place) => void;
  /** Open a place card and draw the route there (from you, or from BU Central if we don't know where you are). */
  navigate: (t: { name: string; lat: number; lng: number; address?: string }) => void;
}
const BU_CENTRAL: [number, number] = [-71.107037, 42.350049];

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
  // Directions: options -> pick one (journey preview) -> follow along (your GPS, or a simulated ride).
  const [options, setOptions] = useState<Route[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [follow, setFollow] = useState<"gps" | "sim" | null>(null);
  const [simPos, setSimPos] = useState<LL | null>(null);
  const route = options && chosen != null ? options[chosen] : null;
  const resetRoute = () => {
    setOptions(null);
    setChosen(null);
    setHover(null);
    setFollow(null);
    setSimPos(null);
  };
  const [routing, setRouting] = useState(false);
  const [fromLabel, setFromLabel] = useState("from the map center");
  const [routeFrom, setRouteFrom] = useState<[number, number] | null>(null);
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
      resetRoute();
      map?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16.2), pitch: map.getPitch(), duration: 1800 });
    },
    navigate: (t) => {
      const p: Place = {
        id: `guide-${t.lat},${t.lng}`, name: t.name, address: t.address ?? "", lng: t.lng, lat: t.lat,
        types: [], category: "From the Outbound Guide", rating: null, ratings: 0, price: null, openNow: null, url: null,
      };
      setQuery(null);
      setResults(null);
      setPlace(p);
      resetRoute();
      void directions(p, userLoc ?? BU_CENTRAL, userLoc ? "from you" : "from BU Central");
    },
  }));

  async function runSearch(q: string) {
    if (!map) return;
    setQuery(q);
    setPlace(null);
    resetRoute();
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
        resetRoute();
      };
      pins.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }, [map, filtered, place]);

  // route on the map: the shown option in color (T legs in line colors, dashed walking legs);
  // while choosing, the other options in grey underneath.
  const shownIdx = chosen ?? hover ?? 0;
  useEffect(() => {
    if (!map) return;
    const shown = options?.[shownIdx];
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (shown?.segments ?? []).filter((x) => x.path.length > 1).map((x) => ({ type: "Feature", properties: { mode: x.mode, color: x.color }, geometry: { type: "LineString", coordinates: x.path } })),
    };
    const alts: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: chosen != null || !options ? [] : options.filter((_, i) => i !== shownIdx).map((o) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pathOf(o) } })),
    };
    const src = map.getSource("route") as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      (map.getSource("route-alts") as GeoJSONSource | undefined)?.setData(alts);
    } else {
      map.addSource("route-alts", { type: "geojson", data: alts });
      map.addLayer({ id: "route-alts", type: "line", source: "route-alts", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#7b8794", "line-width": 5, "line-opacity": 0.55 } });
      map.addSource("route", { type: "geojson", data });
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.9 } });
      map.addLayer({ id: "route-walk", type: "line", source: "route", filter: ["==", ["get", "mode"], "walk"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#5b6b7a", "line-width": 4, "line-dasharray": [0.1, 2] } });
      map.addLayer({ id: "route-transit", type: "line", source: "route", filter: ["==", ["get", "mode"], "transit"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 6 } });
    }
  }, [map, options, chosen, shownIdx]);

  const fit = (paths: LL[][]) => {
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    paths.forEach((pp) => pp.forEach((pt) => b.extend(pt)));
    if (!b.isEmpty()) map.fitBounds(b, { padding: { top: 120, bottom: 80, left: 380, right: 380 }, pitch: map.getPitch(), duration: 1600 });
  };

  // Follow along: the camera rides with you (GPS) or with a simulated rider (preview the ride).
  const simMarker = useRef<maplibregl.Marker | null>(null);
  useEffect(() => {
    if (!map || !route || follow !== "sim") return;
    const path = pathOf(route);
    const el = document.createElement("div");
    el.className = "ob-sim-rider";
    simMarker.current = new maplibregl.Marker({ element: el }).setLngLat(path[0]).addTo(map);
    const total = Math.min(28000, Math.max(12000, route.minutes * 600)); // 12-28 s for the whole trip
    const t0 = performance.now();
    let raf = 0, last = 0;
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / total);
      const { pt, heading } = along(path, f);
      simMarker.current?.setLngLat(pt);
      map.jumpTo({ center: pt, bearing: heading, pitch: 60, zoom: 15.6 });
      if (now - last > 250) {
        last = now;
        setSimPos(pt);
      }
      if (f < 1) raf = requestAnimationFrame(tick);
      else setSimPos(path.at(-1)!);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      simMarker.current?.remove();
      simMarker.current = null;
    };
  }, [map, route, follow]);
  useEffect(() => {
    if (!map || !route || follow !== "gps" || !userLoc) return;
    const path = pathOf(route);
    // look toward the next point of the route ahead of you
    let i = 0, bestD = Infinity;
    path.forEach((pt, j) => {
      const d = kmBetween(pt, userLoc);
      if (d < bestD) { bestD = d; i = j; }
    });
    const ahead = path[Math.min(path.length - 1, i + 1)];
    map.easeTo({ center: userLoc, bearing: bearing(userLoc, ahead), pitch: 60, zoom: 16.4, duration: 900 });
  }, [map, route, follow, userLoc]);
  const followPos = follow === "sim" ? simPos : follow === "gps" ? userLoc : null;
  const prog = route && followPos ? progressOn(route, followPos) : null;

  async function directions(p: Place, start?: [number, number], label?: string) {
    if (!map) return;
    const from = start ?? userLoc ?? [map.getCenter().lng, map.getCenter().lat];
    setFromLabel(label ?? (userLoc ? "from you" : "from the map center"));
    setRouteFrom(from as [number, number]);
    setRouting(true);
    setError(null);
    resetRoute();
    try {
      const r = await fetch(`/api/route?alts=1&from=${from[1]},${from[0]}&to=${p.lat},${p.lng}&name=${encodeURIComponent(p.name)}`);
      const j = await r.json();
      if (!r.ok || !j.options?.length) throw new Error(j.error ?? "No route found");
      setOptions(j.options);
      fit(j.options.map(pathOf));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRouting(false);
    }
  }

  const choose = (i: number) => {
    if (!options) return;
    setChosen(i);
    setFollow(null);
    fit([pathOf(options[i])]);
  };

  const close = () => {
    setQuery(null);
    setResults(null);
    setPlace(null);
    resetRoute();
    setError(null);
  };

  if (!query && !place) return null;
  return (
    <div className="ob-panel flex max-h-[min(70vh,560px)] w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden text-sm">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-[var(--ob-line)] px-3 py-2">
        {place && results && (
          <button className="rounded px-1 text-[var(--ob-muted)] hover:text-[var(--ob-ink)]" onClick={() => (setPlace(null), resetRoute())} aria-label="Back to results">
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
          {!options && (
            <div className="mt-2.5 flex gap-2">
              <button className="flex-1 rounded-lg bg-[var(--ob-maroon)] px-3 py-1.5 font-medium text-white disabled:opacity-60" disabled={routing} onClick={() => directions(place)}>
                {routing ? "Finding routes…" : "Directions"}
              </button>
              {place.url && (
                <a className="rounded-lg bg-[var(--ob-sand)] px-3 py-1.5 text-[var(--ob-ink-2)]" href={place.url} target="_blank" rel="noreferrer">
                  Google Maps
                </a>
              )}
            </div>
          )}
          {error && <div className="mt-2 text-xs text-amber-800">{error}</div>}

          {/* 1. Route options: every way there by T, fastest first. Hover to preview on the map. */}
          {options && chosen == null && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-[var(--ob-ink)]">{options.length} ways there {fromLabel}</span>
                <button className="text-[var(--ob-muted)] hover:underline" onClick={resetRoute}>Clear</button>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {options.map((o, i) => {
                  const rides = o.steps.filter((x) => x.mode === "transit");
                  return (
                    <li key={i}>
                      <button
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(i)}
                        onClick={() => choose(i)}
                        className={`w-full rounded-xl border px-2.5 py-2 text-left text-xs ${i === shownIdx ? "border-[var(--ob-maroon)] bg-[var(--ob-cream)]" : "border-[var(--ob-line)] hover:bg-[var(--ob-cream)]"}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--ob-ink)]">{o.minutes} min{fareLabel(o.fare)}</span>
                          {o.label && <span className="rounded-full bg-[var(--ob-sand)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ob-ink-2)]">{o.label}</span>}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {rides.length === 0 && <span className="flex items-center gap-0.5 text-[var(--ob-muted)]"><Footprints size={12} aria-hidden /> Walk the whole way</span>}
                          {rides.map((x, k) => (
                            <span key={k} className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: x.color }}>{x.line}</span>
                          ))}
                        </span>
                        <span className="mt-1 block text-[11px] text-[var(--ob-muted)]">
                          {[
                            rides.length ? `${o.transfers ?? Math.max(0, rides.length - 1)} transfer${(o.transfers ?? 0) === 1 ? "" : "s"}` : null,
                            o.walkMin != null ? `${o.walkMin} min walking` : null,
                            rides.length ? `off at ${rides.at(-1)!.to}` : null,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 2. Journey preview, then 3. follow along */}
          {route && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <button className="text-[var(--ob-muted)] hover:underline" onClick={() => (setChosen(null), setFollow(null), fit(options!.map(pathOf)))}>
                  ← All options
                </button>
                {route.label && <span className="rounded-full bg-[var(--ob-sand)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ob-ink-2)]">{route.label}</span>}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {[
                  [`${prog ? prog.minutesLeft : route.minutes}`, prog ? "min left" : "min"],
                  [route.fare ? `${"$"}${route.fare.toFixed(2)}` : "Free", "fare"],
                  [`${prog ? prog.toEndKm.toFixed(1) : route.distanceKm}`, prog ? "km to go" : "km"],
                  [`${route.transfers ?? 0}`, route.transfers === 1 ? "transfer" : "transfers"],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-lg bg-[var(--ob-sand)] px-1 py-1.5">
                    <div className="text-sm font-bold text-[var(--ob-ink)] tabular-nums">{v}</div>
                    <div className="text-[10px] text-[var(--ob-muted)]">{l}</div>
                  </div>
                ))}
              </div>

              {prog?.arrived ? (
                <div className="mt-2 rounded-lg bg-emerald-600/10 px-2.5 py-2 text-xs font-semibold text-emerald-700">You’re here: {place.name}. Open its quest to check in.</div>
              ) : (
                follow && (
                  <div className="mt-2 rounded-lg bg-[var(--ob-maroon)] px-2.5 py-2 text-xs text-white">
                    {follow === "gps" && !userLoc ? (
                      "Waiting for your location… turn on location for Outbound."
                    ) : prog ? (
                      <>
                        <span className="font-semibold">Now: </span>
                        {(() => {
                          const x = route.steps[prog.step];
                          return x.mode === "walk" ? x.text : `Ride the ${x.line} Line ${x.from} → ${x.to} (${x.stops} stops)`;
                        })()}
                        {prog.offRoute && follow === "gps" && <span className="mt-0.5 block text-[11px] text-white/80">You’re off this route. Head back to it, or pick another option.</span>}
                      </>
                    ) : (
                      "Starting…"
                    )}
                  </div>
                )
              )}

              <ol className="mt-2 flex flex-col gap-1.5">
                {route.steps.map((x, i) => (
                  <li key={i} className={`flex gap-2 rounded text-xs ${prog && i === prog.step ? "bg-[var(--ob-cream)] font-semibold text-[var(--ob-ink)]" : "text-[var(--ob-ink-2)]"} ${prog && i < prog.step ? "opacity-50" : ""}`}>
                    {x.mode === "walk" ? (
                      <>
                        <span className="flex w-12 shrink-0 items-center gap-0.5 text-[var(--ob-muted)]"><Footprints size={12} aria-hidden /> {x.minutes}m</span>
                        <span>{x.text}</span>
                      </>
                    ) : (
                      <>
                        <span className="w-12 shrink-0 rounded px-1 text-center font-semibold text-white" style={{ background: x.color }}>
                          {x.line}
                        </span>
                        <span>
                          {x.from} → {x.to}
                          <span className="block text-[11px] font-normal text-[var(--ob-muted)]">
                            {[x.headsign && `toward ${x.headsign}`, x.stops && `${x.stops} stops`, `${x.minutes} min`, x.depart && `leaves ${x.depart}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ol>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {follow ? (
                  <button className="flex-1 rounded-lg bg-[var(--ob-sand)] px-3 py-1.5 font-medium text-[var(--ob-ink)]" onClick={() => (setFollow(null), setSimPos(null), fit([pathOf(route)]))}>
                    End
                  </button>
                ) : (
                  <>
                    <button className="flex-1 rounded-lg bg-[var(--ob-maroon)] px-3 py-1.5 font-medium text-white" onClick={() => setFollow("gps")}>
                      Start trip
                    </button>
                    <button className="flex-1 rounded-lg bg-[var(--ob-sand)] px-3 py-1.5 font-medium text-[var(--ob-ink)]" onClick={() => setFollow("sim")}>
                      Preview the ride
                    </button>
                  </>
                )}
              </div>
              {routeFrom && (
                <a
                  className="mt-1.5 block text-center text-[11px] text-[var(--ob-muted)] underline-offset-2 hover:underline"
                  href={`https://www.google.com/maps/dir/?api=1&origin=${routeFrom[1]},${routeFrom[0]}&destination=${place.lat},${place.lng}&travelmode=transit`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Also open in Google Maps
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
export default Explorer;
