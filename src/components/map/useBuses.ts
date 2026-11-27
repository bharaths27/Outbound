// Live buses on the map: polls /api/buses, draws the 3D layer and the far-out mini buses,
// and finds the bus you tapped. Falls back to sample buses when the MBTA feed isn't reachable.
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import type { Bus } from "@/lib/bus";
import { decodePolyline } from "./bus-track";
import { BUS_3D_MIN_ZOOM, BusAnimator, Buses3DLayer, SampleBuses, miniBusId, miniBusImage, type BusNow } from "./buses3d";

const BUS_INTERVAL_MS = 15_000;

async function fetchBuses(): Promise<Bus[]> {
  const r = await fetch("/api/buses", { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || j.error || !Array.isArray(j.buses)) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j.buses;
}

const toGeo = (list: BusNow[], mapBearing: number): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: list.map((x) => {
    // Which way the bus points on screen (map rotation included), so the mini bus faces that way.
    const screenX = Math.cos(x.heading + (mapBearing * Math.PI) / 180);
    return {
      type: "Feature",
      properties: { id: x.bus.id, icon: miniBusId(x.bus.number, x.bus.silver, screenX < 0) },
      geometry: { type: "Point", coordinates: [x.lng, x.lat] },
    };
  }),
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
        "icon-image": ["get", "icon"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.42, 11, 0.56, BUS_3D_MIN_ZOOM, 0.66],
        "icon-allow-overlap": false, // overlapping buses hide, so far out doesn't turn into a yellow blur
        "icon-padding": 1,
        "symbol-sort-key": 1,
      },
    });
    const onMissing = (e: { id: string }) => {
      const img = miniBusImage(e.id);
      if (img && !map.hasImage(e.id)) map.addImage(e.id, img, { pixelRatio: 2 });
    };
    map.on("styleimagemissing", onMissing);
    map.on("mouseenter", "buses-2d", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "buses-2d", () => (map.getCanvas().style.cursor = ""));
    return () => {
      map.off("styleimagemissing", onMissing);
    };
  }, [map, ready, beforeId]);

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
            fake = new SampleBuses();
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
      const src = map.getSource("buses-2d") as GeoJSONSource | undefined;
      src?.setData(toGeo(animRef.current.now(), map.getBearing()));
    }, 1000);
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
