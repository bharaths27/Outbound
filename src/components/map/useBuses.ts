// Live buses on the map: polls /api/buses, draws the 3D layer and the far-out mini buses,
// and finds the bus you tapped. Falls back to sample buses when the MBTA feed isn't reachable.
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Bus } from "@/lib/bus";
import { decodePolyline, makeRoadNet } from "./bus-track";
import { BUS_3D_MIN_ZOOM, BusAnimator, Buses3DLayer, SampleBuses, loadSampleRoutes, bearingOf, topBusId, topBusImage, type BusNow } from "./buses3d";

const BUS_INTERVAL_MS = 15_000;
/** Street width in meters by road rank in ground/major.json (5 motorway, 4 trunk, 3 primary, 2 secondary, 1 tertiary),
 *  as the map draws them up close (style.ts realRoadMeters). */
const ROAD_W: Record<number, number> = { 5: 22, 4: 15, 3: 15, 2: 12, 1: 12 };

async function fetchBuses(): Promise<Bus[]> {
  const r = await fetch("/api/buses", { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j.error || !Array.isArray(j.buses)) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j.buses;
}

const toGeo = (list: BusNow[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: list.map((x) => ({
    type: "Feature",
    properties: { id: x.bus.id, icon: topBusId(x.bus.silver), rot: bearingOf(x.heading), number: x.bus.number },
    geometry: { type: "Point", coordinates: [x.lng, x.lat] },
  })),
});

export function useBuses(map: MlMap | null, ready: boolean, on: boolean, beforeId?: string) {
  const animRef = useRef(new BusAnimator());
  const layerRef = useRef<Buses3DLayer | null>(null);
  const [bus, setBus] = useState<BusNow | null>(null);
  const [sample, setSample] = useState(false);
  const [count, setCount] = useState(0);
  const askedShapes = useRef(new Set<string>());

  /** Loads the street shapes for routes we haven't asked about yet, so their buses stay on the road. */
  const loadShapes = (list: Bus[]) => {
    const need = [...new Set(list.map((b) => b.route))].filter((r) => !askedShapes.current.has(r));
    for (let i = 0; i < need.length; i += 60) {
      const chunk = need.slice(i, i + 60);
      chunk.forEach((r) => askedShapes.current.add(r));
      fetch(`/api/bus-shapes?routes=${chunk.join(",")}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { shapes?: Record<string, string[]> } | null) => {
          for (const [route, lines] of Object.entries(j?.shapes ?? {})) animRef.current.setShapes(route, lines.map(decodePolyline));
        })
        .catch(() => chunk.forEach((r) => askedShapes.current.delete(r)));
    }
  };

  // Layers: 3D buses, plus the mini bus symbols for zoomed far out.
  useEffect(() => {
    if (!ready || !map || map.getLayer("buses-3d")) return;
    const layer = new Buses3DLayer(animRef.current);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __obBuses: BusAnimator }).__obBuses = animRef.current; // for tests
    layerRef.current = layer;
    // Under the place labels, like the trains.
    const before = beforeId && map.getLayer(beforeId) ? beforeId : map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(layer, before);
    map.addSource("buses-2d", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "buses-2d",
      type: "symbol",
      source: "buses-2d",
      maxzoom: BUS_3D_MIN_ZOOM,
      layout: {
        // flat bus lying on the street, turned the way it drives
        "icon-image": ["get", "icon"],
        "icon-rotate": ["get", "rot"],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        // about as wide as the drawn street, so the bus stays on it
        "icon-size": ["interpolate", ["exponential", 1.6], ["zoom"], 10, 0.18, 13, 0.24, 15, 0.36, BUS_3D_MIN_ZOOM, 0.5],
        "icon-allow-overlap": false, // overlapping buses hide, so far out doesn't turn into a yellow blur
        "icon-padding": 0,
        // route number stays upright and readable
        "text-field": ["get", "number"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9, BUS_3D_MIN_ZOOM, 12],
        "text-offset": [0, 1.5],
        "text-optional": true,
        "text-allow-overlap": false,
      },
      paint: { "text-color": "#2B1A1F", "text-halo-color": "#FFC72C", "text-halo-width": 2 },
    });
    const onMissing = (e: { id: string }) => {
      const img = topBusImage(e.id);
      if (img && !map.hasImage(e.id)) map.addImage(e.id, img, { pixelRatio: 2 });
    };
    map.on("styleimagemissing", onMissing);
    // add the two flat bus images up front so the map never asks for them before they exist
    for (const id of ["bus-top-y", "bus-top-s"]) onMissing({ id });
    map.on("mouseenter", "buses-2d", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "buses-2d", () => (map.getCanvas().style.cursor = ""));
    return () => {
      map.off("styleimagemissing", onMissing);
    };
  }, [map, ready, beforeId]);

  // The streets as drawn on the map, so every route shape is moved onto the road (bus-track.ts snapToRoads).
  useEffect(() => {
    if (!ready || !on) return;
    let alive = true;
    fetch("/data/ground/major.json")
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        if (!alive) return;
        const lines: [number, number][][] = [];
        const widths: number[] = [];
        for (const f of fc.features) {
          const g = f.geometry;
          // drawn width of the street (style.ts realRoadMeters): motorway, trunk/primary, secondary/tertiary
          const w = ROAD_W[(f.properties?.r as number) ?? 1] ?? 12;
          const parts = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
          for (const l of parts) {
            lines.push(l as [number, number][]);
            widths.push(w);
          }
        }
        animRef.current.setRoads(makeRoadNet(lines, 42.36, widths));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, on]);

  // Show or hide.
  useEffect(() => {
    if (!ready || !map || !map.getLayer("buses-2d")) return;
    if (layerRef.current) layerRef.current.visible = on;
    map.setLayoutProperty("buses-2d", "visibility", on ? "visible" : "none");
    if (!on) setBus(null);
    map.triggerRepaint();
  }, [map, ready, on]);

  // Feed: live MBTA every 15 s. After two failures, sample buses (moving every 4 s) while
  // live is retried once a minute.
  useEffect(() => {
    if (!ready || !on) return;
    let alive = true;
    let fails = 0;
    let fake: SampleBuses | null = null;
    let lastLiveTry = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (!fake || Date.now() - lastLiveTry > 60_000) {
        lastLiveTry = Date.now();
        try {
          const list = await fetchBuses();
          if (!alive) return;
          if (fake) animRef.current.clear();
          fake = null;
          fails = 0;
          setSample(false);
          loadShapes(list);
          animRef.current.ingest(list, BUS_INTERVAL_MS + 1500);
          setCount(list.length);
        } catch {
          if (!fake && ++fails >= 2) {
            fake = new SampleBuses(await loadSampleRoutes());
            fake.shapes().forEach(([route, line]) => animRef.current.setShapes(route, [line]));
            setSample(true);
            animRef.current.clear();
            animRef.current.ingest(fake.step(0), 0);
          }
        }
      }
      if (fake && alive) {
        const list = fake.step(4);
        animRef.current.ingest(list, 4300);
        setCount(list.length);
      }
      if (alive) timer = setTimeout(tick, fake ? 4000 : BUS_INTERVAL_MS);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ready, on]);

  // Mini bus positions, refreshed about once a second while zoomed far out.
  useEffect(() => {
    if (!ready || !map || !on) return;
    const t = setInterval(() => {
      if (map.getZoom() >= BUS_3D_MIN_ZOOM + 0.2) return;
      // (refreshed every 500 ms so the flat buses glide instead of hopping)
      const src = map.getSource("buses-2d") as GeoJSONSource | undefined;
      src?.setData(toGeo(animRef.current.now(performance.now(), 0))); // on the street line: the flat icon is about one street wide
    }, 500);
    return () => clearInterval(t);
  }, [map, ready, on]);

  // Keep the open card's bus moving with it.
  useEffect(() => {
    if (!bus) return;
    const t = setInterval(() => {
      const next = animRef.current.now().find((x) => x.bus.id === bus.bus.id);
      if (next) setBus(next);
    }, 2000);
    return () => clearInterval(t);
  }, [bus?.bus.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The bus under a tap, if any: the mini bus symbol far out, the nearest 3D bus up close. */
  const busAt = (point: { x: number; y: number }): BusNow | null => {
    if (!map || !on) return null;
    if (map.getZoom() < BUS_3D_MIN_ZOOM) {
      const f = map.getLayer("buses-2d") ? map.queryRenderedFeatures([point.x, point.y], { layers: ["buses-2d"] })[0] : undefined;
      const id = f?.properties?.id as string | undefined;
      return id ? (animRef.current.now().find((x) => x.bus.id === id) ?? null) : null;
    }
    const drawn = layerRef.current?.drawn ?? [];
    const hitPx = Math.max(22, 26 * (map.getZoom() - 11) * 0.5);
    let best: BusNow | null = null, bestD = hitPx;
    for (const x of drawn) {
      const p = map.project([x.lng, x.lat]);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestD) {
        bestD = d;
        best = x;
      }
    }
    return best;
  };

  return { bus, setBus, busAt, sample, count };
}
