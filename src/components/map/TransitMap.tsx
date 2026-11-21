"use client";
// Live 3D map of the T. Owner: Person 1 (map frontend).
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import type { Arrival, LineLateness, Station, Train } from "@/lib/types";
import { LINE_COLORS } from "@/lib/lines";
import { TrackNetwork } from "./track";
import { TrainAnimator, Trains3DLayer, TrainNow } from "./trains3d";
import { loadBaseStyle, groundLayerIds } from "./style";
import { CityBuildingsLayer, fetchBpdaManifest, inBpda } from "./buildings3d";
import { GOOGLE_KEY, GoogleTilesLayer } from "./googleTiles";
import SearchBox, { pointInRing } from "./SearchBox";
import Explorer, { type ExplorerHandle } from "./Explorer";
import { FlyControls, type FlyAction } from "./flyControls";
import {
  LIVE_INTERVAL_MS, ReplayFrame, DemoFeed, fetchLive, fetchReplay, fetchLateness, fetchArrivals,
  sampleArrivals, destinationOf, LATENESS_HEX,
} from "./feed";
import { CAMPUSES, SAMPLE_FRIEND_VISITS, initials } from "./places";

type FeedMode = "live" | "replay" | "demo";
interface StationData extends Pick<Station, "id" | "name" | "lat" | "lon"> {
  lines: string[];
  branches: string[];
  platforms: string[];
}

const VIEWS = {
  usa: { center: [-96.5, 39.2] as [number, number], zoom: 2.9, pitch: 0, bearing: 0 },
  mass: { center: [-71.55, 42.25] as [number, number], zoom: 7.6, pitch: 30, bearing: 0 },
  boston: { center: [-71.0805, 42.3555] as [number, number], zoom: 13.4, pitch: 58, bearing: -18 },
};
const TRAIN_3D_MIN_ZOOM = 12.3;
const LOCAL_REPLAY_KEY = "outbound.replay.v1";
const LOCAL_REPLAY_MAX = 60; // ~12 minutes of live frames saved in this browser

const inMass = ([lng, lat]: [number, number]) => lng > -73.6 && lng < -69.8 && lat > 41.2 && lat < 42.95;

const lineColorExpr = (colors: Record<string, string>) =>
  ["match", ["get", "line"], ...Object.entries(colors).flat(), "#888"] as unknown as maplibregl.ExpressionSpecification;

export default function TransitMap() {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const flyRef = useRef<FlyControls | null>(null);
  const animRef = useRef<TrainAnimator | null>(null);
  const layerRef = useRef<Trains3DLayer | null>(null);
  const cityRef = useRef<CityBuildingsLayer | null>(null);
  const googleRef = useRef<GoogleTilesLayer | null>(null);
  const setRealisticRef = useRef<(on: boolean) => void>(() => {});
  const stationsRef = useRef<StationData[]>([]);
  const markersRef = useRef<{ campus: maplibregl.Marker[]; friends: maplibregl.Marker[] }>({ campus: [], friends: [] });
  const groundRef = useRef<string[]>([]);

  const [ready, setReady] = useState(false);
  const [offlineBasemap, setOfflineBasemap] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [realistic, setRealistic] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const userLocRef = useRef<[number, number] | null>(null);
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const explorer = useRef<ExplorerHandle>(null);
  const [show, setShow] = useState({ trains: true, campuses: true, friends: true, delays: true });
  const [delayColors, setDelayColors] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>("live");
  const [autoFallback, setAutoFallback] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [trainCount, setTrainCount] = useState(0);
  const [lateness, setLateness] = useState<{ lines: LineLateness[]; sample: boolean } | null>(null);
  const [station, setStation] = useState<StationData | null>(null);
  const [arrivals, setArrivals] = useState<{ list: Arrival[]; sample: boolean } | null>(null);
  const [train, setTrain] = useState<TrainNow | null>(null);
  const [now, setNow] = useState(Date.now());
  const [replay, setReplay] = useState<{ frames: ReplayFrame[]; source: string; i: number; playing: boolean; speed: number } | null>(null);

  // ---------- map setup ----------
  useEffect(() => {
    let disposed = false;
    let map: MlMap | null = null;
    (async () => {
      const manifest = await fetchBpdaManifest();
      const [{ style, offline }, linesGeo, stations, cambridgeOutline] = await Promise.all([
        loadBaseStyle(manifest),
        fetch("data/mbta-lines.geojson").then((r) => r.json()),
        fetch("data/mbta-stations.json").then((r) => r.json()) as Promise<StationData[]>,
        fetch("data/cambridge/outline.geojson").then((r) => r.json()).catch(() => null),
      ]);
      if (disposed || !box.current) return;
      setOfflineBasemap(offline);
      stationsRef.current = stations;
      groundRef.current = groundLayerIds(style as StyleSpecification);
      const net = new TrackNetwork(linesGeo);
      const animator = new TrainAnimator(net);
      animRef.current = animator;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __obAnim: TrainAnimator }).__obAnim = animator; // for tests

      maplibregl.setWorkerUrl(`${new URL("maplibre-gl-worker.mjs", document.baseURI).href}?v=${maplibregl.getVersion()}`); // copied by scripts/copy-maplibre-worker.mjs
      map = new maplibregl.Map({
        container: box.current,
        style,
        center: VIEWS.boston.center,
        zoom: VIEWS.boston.zoom - 0.6,
        pitch: 50,
        bearing: VIEWS.boston.bearing + 25,
        maxPitch: 85, // tilt almost to street level
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      });
      mapRef.current = map;
      flyRef.current = new FlyControls(map);
      if (process.env.NODE_ENV !== "production") (window as unknown as { __obFly: FlyControls }).__obFly = flyRef.current; // for tests
      if (process.env.NODE_ENV !== "production") (window as unknown as { __obMap: MlMap }).__obMap = map; // for tests
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
      map.on("error", (e) => console.warn("[map]", e.error?.message ?? e)); // e.g. a tile or font that failed to load

      map.on("style.load", () => {
        const m = map!;
        m.setProjection({ type: "globe" });
        m.setSky({
          "sky-color": "#8ec5ff",
          "horizon-color": "#e3f1ff",
          "fog-color": "#eef4fb",
          "sky-horizon-blend": 0.6,
          "horizon-fog-blend": 0.6,
          "fog-ground-blend": 0.4,
          "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 0.8, 9, 0],
        });
        m.setLight({ anchor: "map", position: [1.3, 210, 35], intensity: 0.35, color: "#ffffff" });

        const firstSymbol = m.getStyle().layers.find((l) => l.type === "symbol")?.id;
        const firstBuilding = m.getStyle().layers.find((l) => l.type === "fill-extrusion")?.id;
        const beforeLines = firstBuilding ?? firstSymbol;
        // 3D layers go right above the basemap's buildings and under its labels (the first symbol layer in
        // Liberty is a one-way arrow below the bridges, which would paint roads over our buildings)
        const styleLayers = m.getStyle().layers;
        const lastExt = styleLayers.map((l) => l.type).lastIndexOf("fill-extrusion");
        const labelsStart = styleLayers.slice(lastExt + 1).find((l) => l.type === "symbol")?.id ?? firstSymbol;

        m.addSource("mbta-lines", { type: "geojson", data: linesGeo });
        m.addLayer({
          id: "lines-delay-glow",
          type: "line",
          source: "mbta-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#999", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 4, 13, 7, 17, 14], "line-blur": 4, "line-opacity": 0.55 },
        }, beforeLines);
        m.addLayer({
          id: "lines-casing",
          type: "line",
          source: "mbta-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 13, 2.8, 17, 5.5], "line-opacity": 0.9 },
        }, beforeLines);
        m.addLayer({
          id: "lines",
          type: "line",
          source: "mbta-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": lineColorExpr(LINE_COLORS), "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.9, 13, 1.7, 17, 3.4] },
        }, beforeLines);

        // campuses: outline + see-through fill, like a selection (real campus land from city parcel/building data)
        m.addSource("campuses", { type: "geojson", data: "data/campuses.geojson" });
        m.addLayer({ id: "campus-fill", type: "fill", source: "campuses", paint: { "fill-color": ["get", "color"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.22, 16, 0.14] } }, beforeLines);
        m.addLayer({ id: "campus-halo", type: "line", source: "campuses", layout: { "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 5], "line-opacity": 0.85 } }, beforeLines);
        m.addLayer({ id: "campus-line", type: "line", source: "campuses", layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 16, 2.4], "line-dasharray": [3, 2] } }, beforeLines);

        // game-style 3D city: Boston's own building models (BPDA), Cambridge footprints + heights, trees
        const city = new CityBuildingsLayer(manifest);
        cityRef.current = city;
        m.addLayer(city, labelsStart);
        // "Realistic" view: Google's photo-textured 3D (added only when switched on, so the default loads fast)
        let google: GoogleTilesLayer | null = null;
        setRealisticRef.current = (on: boolean) => {
          if (on && GOOGLE_KEY && !google) {
            google = new GoogleTilesLayer();
            google.onError = (msg) => {
              console.warn(msg);
              setNotice("Realistic 3D couldn't load from Google, so you're seeing the illustrated map.");
              setRealistic(false);
            };
            googleRef.current = google;
            if (process.env.NODE_ENV !== "production") (window as unknown as { __obGoogle: GoogleTilesLayer }).__obGoogle = google; // for tests
            m.addLayer(google, beforeLines);
          } else if (!on && google) {
            if (m.getLayer(google.id)) m.removeLayer(google.id);
            google = null;
            googleRef.current = null;
          }
          city.hidden = !!google;
          pickBuildings();
          m.triggerRepaint();
        };
        // OpenStreetMap's boxy buildings only where the real city models don't cover the view
        const cambRing = cambridgeOutline?.geometry?.coordinates?.[0] as [number, number][] | undefined;
        const osmBuildings = m.getStyle().layers.filter((l) => l.type === "fill-extrusion" && (l as { source?: string }).source === "openmaptiles").map((l) => l.id);
        const pickBuildings = () => {
          const c = m.getCenter();
          const real = (manifest && inBpda(c.lng, c.lat)) || (cambRing && pointInRing([c.lng, c.lat], cambRing));
          // (the 3D city layer draws Cambridge and central Boston itself; Google's 3D draws everything)
          for (const id of osmBuildings) m.setFilter(id, real || google ? ["==", ["get", "render_height"], -1] : null);
        };
        pickBuildings();
        m.on("moveend", pickBuildings);

        // 3D trains (depth-tested against buildings)
        const layer = new Trains3DLayer(animator);
        layer.minZoom = TRAIN_3D_MIN_ZOOM;
        layerRef.current = layer;
        m.addLayer(layer, labelsStart);

        // stations
        m.addSource("stations", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: stations.map((s) => ({
              type: "Feature",
              id: s.id,
              properties: { id: s.id, name: s.name, line: s.lines[0], transfer: s.lines.length > 1 },
              geometry: { type: "Point", coordinates: [s.lon, s.lat] },
            })),
          },
        });
        m.addLayer({
          id: "stations",
          type: "circle",
          source: "stations",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, ["case", ["get", "transfer"], 1.8, 1.2], 13, ["case", ["get", "transfer"], 3.6, 2.6], 17, ["case", ["get", "transfer"], 6, 4.5]],
            "circle-color": "#ffffff",
            "circle-stroke-color": ["case", ["get", "transfer"], "#1f2937", lineColorExpr(LINE_COLORS)],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 14, 1.6],
            "circle-pitch-alignment": "map",
          },
        });
        m.addLayer({
          id: "station-labels",
          type: "symbol",
          source: "stations",
          minzoom: 13.2,
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 17, 13],
            "text-offset": [0, 1.0],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": "#1f2937", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
        });

        // 2D train dots (also the click target for 3D trains)
        m.addSource("trains-2d", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "trains-2d",
          type: "circle",
          source: "trains-2d",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 12, 4, 15, 6, 18, 10],
            "circle-color": lineColorExpr(LINE_COLORS),
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-pitch-alignment": "map",
          },
        });

        // interactions
        m.on("click", "stations", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          const s = stationsRef.current.find((x) => x.id === id);
          if (s) {
            setTrain(null);
            setStation(s);
          }
        });
        m.on("click", "trains-2d", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          const t = animRef.current?.snapshot().find((x) => x.id === id);
          if (t) {
            setStation(null);
            setTrain(t);
          }
        });
        for (const id of ["stations", "trains-2d"]) {
          m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
        }
        setReady(true);
        // keep the loading screen up until the buildings around Boston are in, then glide in (no half-drawn stages)
        const t0 = performance.now();
        const reveal = () => {
          if (disposed) return;
          if (!city.settled() && performance.now() - t0 < 12_000) return void setTimeout(reveal, 250);
          setLoaded(true);
          // open on you if you're in Massachusetts, otherwise on Boston
          const me = userLocRef.current;
          if (me && inMass(me)) m.easeTo({ center: me, zoom: 15.6, pitch: 60, bearing: -20, duration: 2600, essential: true });
          else m.easeTo({ ...VIEWS.boston, duration: 2600, essential: true });
        };
        reveal();
      });
    })();
    return () => {
      disposed = true;
      flyRef.current?.dispose();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---------- campus + friend markers ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    markersRef.current.campus = CAMPUSES.map((c) => {
      const el = document.createElement("button");
      el.className = "ob-campus";
      el.style.setProperty("--c", c.color);
      el.innerHTML = `<span class="ob-campus-dot"></span><span class="ob-campus-name">${c.short}</span>`;
      el.title = c.name;
      el.onclick = (ev) => {
        ev.stopPropagation();
        map.flyTo({ center: [c.lng, c.lat], zoom: 15.6, pitch: 60, duration: 2200 });
      };
      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([c.lng, c.lat]).addTo(map);
    });
    markersRef.current.friends = SAMPLE_FRIEND_VISITS.map((f) => {
      const el = document.createElement("div");
      el.className = "ob-friend";
      el.style.setProperty("--c", f.color);
      el.innerHTML = `<span class="ob-friend-avatar">${initials(f.name)}</span>`;
      const popup = new maplibregl.Popup({ offset: 22, closeButton: false, className: "ob-popup" }).setHTML(
        `<b>${f.name}</b> <span style="color:#6b7280">· ${f.school}</span><br/>Visited <b>${f.place}</b><br/><span style="color:#6b7280">${f.when}</span>`,
      );
      return new maplibregl.Marker({ element: el }).setLngLat([f.lng, f.lat]).setPopup(popup).addTo(map);
    });
    const markers = markersRef.current;
    return () => {
      markers.campus.forEach((m) => m.remove());
      markers.friends.forEach((m) => m.remove());
    };
  }, [ready]);

  // show/hide markers by zoom + toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const update = () => {
      const z = map.getZoom();
      markersRef.current.campus.forEach((m) => (m.getElement().style.display = show.campuses && z >= 11 ? "" : "none"));
      markersRef.current.friends.forEach((m) => (m.getElement().style.display = show.friends && z >= 11.5 ? "" : "none"));
    };
    update();
    map.on("zoom", update);
    for (const id of ["campus-fill", "campus-halo", "campus-line"])
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show.campuses ? "visible" : "none");
    return () => {
      map.off("zoom", update);
    };
  }, [ready, show.campuses, show.friends]);

  // ---------- 3D / 2D ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (layerRef.current) layerRef.current.visible = is3D && show.trains;
    if (cityRef.current) cityRef.current.visible = is3D;
    if (googleRef.current) googleRef.current.visible = is3D;
    for (const l of map.getStyle().layers)
      if (l.type === "fill-extrusion") map.setLayoutProperty(l.id, "visibility", is3D ? "visible" : "none");
    map.setPaintProperty(
      "trains-2d",
      "circle-opacity",
      !show.trains ? 0 : is3D ? ["interpolate", ["linear"], ["zoom"], TRAIN_3D_MIN_ZOOM - 0.3, 1, TRAIN_3D_MIN_ZOOM, 0] : 1,
    );
    map.setPaintProperty(
      "trains-2d",
      "circle-stroke-opacity",
      !show.trains ? 0 : is3D ? ["interpolate", ["linear"], ["zoom"], TRAIN_3D_MIN_ZOOM - 0.3, 1, TRAIN_3D_MIN_ZOOM, 0] : 1,
    );
    if (map.getZoom() > 5) map.easeTo({ pitch: is3D ? 58 : 0, bearing: is3D ? map.getBearing() : 0, duration: 900 });
    map.triggerRepaint();
  }, [ready, is3D, show.trains]);

  // ---------- your location (blue dot), like a normal map ----------
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const loc: [number, number] = [p.coords.longitude, p.coords.latitude];
        userLocRef.current = loc;
        setUserLoc(loc);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !userLoc) return;
    if (!meMarker.current) {
      const el = document.createElement("div");
      el.className = "ob-me";
      el.title = "You are here";
      meMarker.current = new maplibregl.Marker({ element: el }).setLngLat(userLoc).addTo(map);
    } else meMarker.current.setLngLat(userLoc);
  }, [ready, userLoc]);
  const locateMe = () => {
    const map = mapRef.current;
    if (!map) return;
    if (userLoc) map.flyTo({ center: userLoc, zoom: Math.max(map.getZoom(), 15.6), pitch: map.getPitch(), duration: 1800 });
    else setNotice("Turn on location for this site to see where you are.");
  };

  // ---------- illustrated / realistic ----------
  useEffect(() => {
    if (!ready) return;
    if (GOOGLE_KEY) setRealisticRef.current(realistic);
    else if (!offlineBasemap) setSatellite(realistic); // no Google key: real satellite photos under the 3D city
  }, [ready, realistic, offlineBasemap]);

  // ---------- satellite ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !map.getLayer("satellite")) return;
    map.setLayoutProperty("satellite", "visibility", satellite ? "visible" : "none");
    for (const id of groundRef.current) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", satellite ? "none" : "visible");
  }, [ready, satellite]);

  // ---------- lateness (Tiger Data) ----------
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const l = await fetchLateness();
      if (alive) setLateness(l);
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !lateness) return;
    const delayHex: Record<string, string> = { Blue: LATENESS_HEX.gray };
    for (const l of lateness.lines) delayHex[l.line] = LATENESS_HEX[l.color];
    map.setPaintProperty("lines-delay-glow", "line-color", lineColorExpr(delayHex));
    map.setLayoutProperty("lines-delay-glow", "visibility", show.delays ? "visible" : "none");
    map.setPaintProperty("lines", "line-color", lineColorExpr(show.delays && delayColors ? delayHex : LINE_COLORS));
  }, [ready, lateness, show.delays, delayColors]);

  // ---------- train feeds ----------
  const pushFrame = (trains: Train[], durationMs: number) => {
    animRef.current?.ingest(trains, durationMs);
    setTrainCount(trains.length);
    setLastUpdate(Date.now());
  };

  // live polling (+ automatic fallback to replay / demo when the MBTA or wifi is down)
  useEffect(() => {
    if (!ready || feedMode !== "live") return;
    let alive = true;
    let fails = 0;
    const poll = async () => {
      try {
        const j = await fetchLive();
        if (!alive) return;
        fails = 0;
        pushFrame(j.trains, LIVE_INTERVAL_MS + 1500);
        saveLocalFrame({ t: j.updatedAt, trains: j.trains });
      } catch {
        fails++;
        if (alive && fails >= 2) {
          setAutoFallback(true);
          startReplay(true);
        }
      }
    };
    poll();
    const t = setInterval(poll, LIVE_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
     
  }, [ready, feedMode]);

  // while in auto-fallback, keep checking whether live data is back
  useEffect(() => {
    if (!autoFallback || feedMode === "live") return;
    const t = setInterval(async () => {
      try {
        await fetchLive();
        setAutoFallback(false);
        goLive();
      } catch {}
    }, 30_000);
    return () => clearInterval(t);
     
  }, [autoFallback, feedMode]);

  const goLive = () => {
    animRef.current?.clear();
    setReplay(null);
    setFeedMode("live");
  };

  const startReplay = async (auto = false) => {
    const file = await fetchReplay();
    const local = loadLocalFrames();
    const frames = file ?? (local.length > 1 ? local : null);
    animRef.current?.clear();
    if (frames) {
      setReplay({ frames, source: file ? "recorded" : "saved in this browser", i: 0, playing: true, speed: auto ? 1 : 4 });
      setFeedMode("replay");
    } else {
      setReplay(null);
      setFeedMode("demo");
    }
  };

  // replay playback
  useEffect(() => {
    if (feedMode !== "replay" || !replay || !replay.playing) return;
    const { frames, i, speed } = replay;
    const cur = frames[i];
    const next = frames[(i + 1) % frames.length];
    const gap = i + 1 < frames.length ? Math.max(1000, new Date(next.t).getTime() - new Date(cur.t).getTime()) : 3000;
    const dur = gap / speed;
    pushFrame(cur.trains, dur + 300);
    const t = setTimeout(() => setReplay((r) => (r ? { ...r, i: (r.i + 1) % r.frames.length } : r)), dur);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedMode, replay?.i, replay?.playing, replay?.speed]);

  // demo feed (only when nothing else is available)
  useEffect(() => {
    if (feedMode !== "demo" || !animRef.current) return;
    const demo = new DemoFeed(animRef.current.net);
    pushFrame(demo.step(0), 0);
    const t = setInterval(() => pushFrame(demo.step(4), 4300), 4000);
    return () => clearInterval(t);
     
  }, [feedMode]);

  // keep 2D dots in sync with the animation (~12 fps)
  useEffect(() => {
    if (!ready) return;
    let raf = 0, last = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < 80) return;
      last = ts;
      const map = mapRef.current, anim = animRef.current;
      if (!map || !anim) return;
      const snap = anim.snapshot();
      (map.getSource("trains-2d") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: snap.map((t) => ({ type: "Feature", properties: { id: t.id, line: t.line }, geometry: { type: "Point", coordinates: [t.lng, t.lat] } })),
      });
      setTrain((sel) => (sel ? snap.find((x) => x.id === sel.id) ?? sel : sel));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // ---------- station arrivals countdown ----------
  useEffect(() => {
    if (!station) return;
    let alive = true;
    setArrivals(null);
    const load = async () => {
      const a = feedMode === "live" ? await fetchArrivals(station.id) : null;
      if (!alive) return;
      setArrivals(a ? { list: a, sample: false } : { list: sampleArrivals(station.lines), sample: true });
    };
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [station, feedMode]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const stationName = useMemo(() => {
    const byPlatform = new Map<string, string>();
    for (const s of stationsRef.current) {
      byPlatform.set(s.id, s.name);
      for (const p of s.platforms) byPlatform.set(p, s.name);
    }
    return (id: string | null) => (id ? byPlatform.get(id) ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const fly = (v: keyof typeof VIEWS) => mapRef.current?.flyTo({ ...VIEWS[v], pitch: is3D ? VIEWS[v].pitch : 0, duration: 3500 });

  // ---------- UI ----------
  const ago = lastUpdate ? Math.max(0, Math.round((now - lastUpdate) / 1000)) : null;
  const statusText =
    feedMode === "live"
      ? lastUpdate ? `Live · ${trainCount} trains · ${ago}s ago` : "Connecting to MBTA…"
      : feedMode === "replay"
        ? `Replay · ${replay?.source} · ${replay ? fmtTime(replay.frames[replay.i].t) : ""}`
        : `Sample trains · MBTA feed unreachable`;

  return (
    <div className="fixed inset-0 bg-[#dfe9f3]">
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {/* one loading screen, then straight into the 3D city */}
      <div
        className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#ece6da] transition-opacity duration-700 ${loaded ? "opacity-0" : "opacity-100"}`}
        aria-hidden={loaded}
      >
        <div className="text-3xl font-semibold tracking-tight text-[#6b1d3a]">Outbound</div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-[#6b1d3a]" />
          Building Boston in 3D…
        </div>
      </div>

      {/* top-left: brand, feed status, Tiger Data badges */}
      <div className="absolute left-3 top-3 flex max-w-[calc(100vw-212px)] sm:max-w-[calc(100vw-24px)] flex-col gap-2 sm:left-4 sm:top-4">
        <div className="ob-panel flex items-center gap-3 px-3 py-2">
          <span className="text-base font-semibold tracking-tight text-slate-900">Outbound</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white ${feedMode === "live" && lastUpdate ? "bg-emerald-600" : feedMode === "replay" ? "bg-sky-600" : "bg-amber-500"}`}
              title={feedMode === "live" ? "Real MBTA positions" : "Not real-time: MBTA feed unreachable"}
            >
              {feedMode === "live" && lastUpdate ? "● LIVE" : feedMode === "replay" ? "REPLAY" : "DEMO"}
            </span>
            {statusText}
          </span>
        </div>
        <SearchBox
          map={ready ? mapRef.current : null}
          stations={stationsRef.current}
          online={!offlineBasemap}
          onStation={(id) => {
            const s = stationsRef.current.find((x) => x.id === id);
            if (!s) return;
            setTrain(null);
            setStation(s);
          }}
          onTextSearch={(q) => explorer.current?.search(q)}
          onPlace={(p) => explorer.current?.show(p)}
        />
        <Explorer ref={explorer} map={ready ? mapRef.current : null} userLoc={userLoc} />
        {autoFallback && feedMode !== "live" && (
          <div className="ob-panel px-3 py-1.5 text-xs text-amber-800">Live feed is down. Showing {feedMode === "replay" ? "saved trains" : "demo trains"}; retrying every 30 s.</div>
        )}
        {show.delays && lateness && (
          <div className="flex flex-wrap gap-1.5">
            {lateness.lines.map((l) => (
              <span key={l.line} className="ob-panel flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-800" title={`${l.method}, ${l.samples} samples`}>
                <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[l.line] }} />
                {l.badge}
                <span className="h-2 w-2 rounded-full" style={{ background: LATENESS_HEX[l.color] }} />
              </span>
            ))}
            {lateness.sample && <span className="ob-panel px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">sample</span>}
          </div>
        )}
        {notice && (
          <button className="ob-panel px-3 py-1.5 text-left text-xs text-amber-800" onClick={() => setNotice(null)}>
            {notice}
          </button>
        )}
      </div>

      {/* top-right: controls */}
      <div className="ob-panel absolute right-3 top-3 flex w-[176px] flex-col gap-2 p-2.5 text-xs sm:right-4 sm:top-4">
        <Seg options={[["3D", true], ["2D", false]]} value={is3D} onChange={setIs3D} />
        {(GOOGLE_KEY || !offlineBasemap) && <Seg options={[["Illustrated", false], ["Realistic", true]]} value={realistic} onChange={setRealistic} />}
        <div className="mt-1 flex flex-col gap-1">
          <Toggle label="Trains" on={show.trains} set={(v) => setShow({ ...show, trains: v })} />
          <Toggle label="Campuses" on={show.campuses} set={(v) => setShow({ ...show, campuses: v })} />
          <Toggle label="Friends" on={show.friends} set={(v) => setShow({ ...show, friends: v })} />
          <Toggle label="Delays" on={show.delays} set={(v) => setShow({ ...show, delays: v })} />
          {show.delays && <Toggle label="Color lines by delay" on={delayColors} set={setDelayColors} small />}
        </div>
        <button
          className="mt-1 rounded-lg bg-slate-900 px-2 py-1.5 font-medium text-white hover:bg-slate-700"
          onClick={() => (feedMode === "live" ? startReplay() : (setAutoFallback(false), goLive()))}
        >
          {feedMode === "live" ? "Replay saved trains" : "Back to live"}
        </button>
      </div>

      {/* bottom-left: jump to USA / Massachusetts / Boston */}
      <div className="ob-panel absolute bottom-8 left-3 flex gap-1 p-1 text-xs sm:left-4">
        {(["usa", "mass", "boston"] as const).map((v) => (
          <button key={v} onClick={() => fly(v)} className="rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
            {v === "usa" ? "USA" : v === "mass" ? "Massachusetts" : "Boston"}
          </button>
        ))}
        <button onClick={locateMe} className="rounded-lg px-2.5 py-1.5 font-medium text-sky-700 hover:bg-slate-100" title="Go to my location">
          ◎ Me
        </button>
      </div>

      {/* replay bar */}
      {feedMode === "replay" && replay && (
        <div className="ob-panel absolute bottom-20 left-1/2 flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-center gap-3 px-3 py-2 text-xs">
          <button className="w-14 rounded-md bg-slate-900 px-2 py-1 text-white" onClick={() => setReplay({ ...replay, playing: !replay.playing })}>
            {replay.playing ? "Pause" : "Play"}
          </button>
          <input
            type="range"
            min={0}
            max={replay.frames.length - 1}
            value={replay.i}
            onChange={(e) => {
              animRef.current?.clear();
              setReplay({ ...replay, i: Number(e.target.value) });
            }}
            className="flex-1"
          />
          <span className="w-16 tabular-nums text-slate-700">{fmtTime(replay.frames[replay.i].t)}</span>
          <select value={replay.speed} onChange={(e) => setReplay({ ...replay, speed: Number(e.target.value) })} className="rounded border border-slate-300 bg-white px-1 py-0.5">
            {[1, 4, 16].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </div>
      )}

      {/* station card with live countdown */}
      {station && (
        <Card onClose={() => setStation(null)}>
          <div className="flex items-center gap-2">
            {station.lines.map((l) => (
              <span key={l} className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: LINE_COLORS[l as keyof typeof LINE_COLORS] }}>
                {l}
              </span>
            ))}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{station.name}</h2>
          <div className="mt-2 flex flex-col divide-y divide-slate-100">
            {!arrivals && <span className="py-2 text-slate-500">Loading arrivals…</span>}
            {arrivals?.list.length === 0 && <span className="py-2 text-slate-500">No trains predicted right now.</span>}
            {arrivals?.list.slice(0, 6).map((a, i) => {
              const secs = Math.round((new Date(a.arrivalTime).getTime() - now) / 1000);
              return (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LINE_COLORS[a.line] }} />
                    <span className="text-slate-800">{destinationOf(a.route, a.directionId)}</span>
                    {a.route.startsWith("Green-") && <span className="text-[10px] text-slate-500">{a.route.slice(6)}</span>}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{fmtCountdown(secs)}</span>
                </div>
              );
            })}
          </div>
          {arrivals?.sample && <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">sample times (MBTA unreachable)</p>}
          <Link href={`/station/${station.id}`} className="mt-3 block rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-slate-700">
            Open station hub
          </Link>
        </Card>
      )}

      {/* train card */}
      {train && (
        <Card onClose={() => setTrain(null)}>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: LINE_COLORS[train.line] }}>
            {train.info.route.replace("-", " ")}
          </span>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            To {destinationOf(train.info.route, train.info.directionId ?? 0)}
          </h2>
          <p className="text-slate-600">
            {statusLabel(train.info.status)} {stationName(train.info.stopId) ?? "next stop"}
          </p>
          {train.info.occupancy && <p className="mt-1 text-xs text-slate-500">Crowding: {train.info.occupancy.replaceAll("_", " ").toLowerCase()}</p>}
          <button
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => mapRef.current?.flyTo({ center: [train.lng, train.lat], zoom: 16.4, pitch: 62, duration: 1800 })}
          >
            Follow closer
          </button>
        </Card>
      )}

      {/* free camera pad (keys: W A S D move, Q E turn, R F tilt, Space/Shift up/down) */}
      <FlyPad fly={flyRef} />

      {/* app nav */}
      <nav className="ob-panel absolute bottom-8 right-14 hidden gap-1 p-1 text-xs sm:flex">
        {[["Passport", "/passport"], ["Leaderboard", "/leaderboard"], ["Login", "/login"]].map(([l, h]) => (
          <Link key={h} href={h} className="rounded-lg px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100">{l}</Link>
        ))}
      </nav>
    </div>
  );
}

const PAD: [FlyAction, string, string][] = [
  ["turnL", "⟲", "Turn left (Q)"], ["fwd", "▲", "Forward (W)"], ["turnR", "⟳", "Turn right (E)"],
  ["left", "◀", "Left (A)"], ["back", "▼", "Back (S)"], ["right", "▶", "Right (D)"],
  ["tiltUp", "⤒", "Tilt up (R)"], ["up", "＋", "Rise (Space)"], ["tiltDown", "⤓", "Tilt down (F)"],
];
function FlyPad({ fly }: { fly: React.RefObject<FlyControls | null> }) {
  const [open, setOpen] = useState(false);
  const hold = (a: FlyAction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      fly.current?.press(a);
    },
    onPointerUp: () => fly.current?.release(a),
    onPointerCancel: () => fly.current?.release(a),
    onLostPointerCapture: () => fly.current?.release(a),
  });
  return (
    <div className="absolute bottom-[132px] right-3 z-10 flex flex-col items-end gap-1.5">
      {open && (
        <div className="ob-panel grid select-none grid-cols-3 gap-1 p-1.5 touch-none">
          {PAD.map(([a, icon, label]) => (
            <button key={a} {...hold(a)} title={label} aria-label={label} className="h-9 w-9 rounded-lg bg-slate-100 text-sm text-slate-700 active:bg-slate-300">
              {icon}
            </button>
          ))}
          <button {...hold("down")} title="Sink (Shift)" aria-label="Sink (Shift)" className="col-span-3 h-7 rounded-lg bg-slate-100 text-xs text-slate-700 active:bg-slate-300">
            － lower
          </button>
          <p className="col-span-3 hidden max-w-[120px] text-[9px] leading-tight text-slate-500 sm:block">Keys: WASD move, Q/E turn, R/F tilt, Space/Shift up/down. Right-drag to orbit.</p>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="ob-panel px-2.5 py-1.5 text-xs font-medium text-slate-700" aria-expanded={open}>
        🎮 {open ? "Hide" : "Fly"}
      </button>
    </div>
  );
}

function Seg<T>({ options, value, onChange }: { options: [string, T][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {options.map(([label, v]) => (
        <button
          key={label}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1 font-medium ${value === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, on, set, small }: { label: string; on: boolean; set: (v: boolean) => void; small?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-2 ${small ? "pl-3 text-[11px] text-slate-500" : "text-slate-700"}`}>
      {label}
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-slate-900" />
    </label>
  );
}

function Card({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="ob-panel absolute bottom-24 left-3 w-[min(300px,calc(100vw-24px))] p-3.5 text-sm sm:left-4">
      <button onClick={onClose} className="absolute right-2.5 top-2 text-lg leading-none text-slate-400 hover:text-slate-700" aria-label="Close">
        ×
      </button>
      {children}
    </div>
  );
}

const statusLabel = (s: string | null) =>
  s === "STOPPED_AT" ? "Stopped at" : s === "INCOMING_AT" ? "Arriving at" : "Heading to";

function fmtCountdown(secs: number) {
  if (secs <= 30) return "Now";
  if (secs < 600) return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return `${Math.round(secs / 60)} min`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
}

function saveLocalFrame(frame: ReplayFrame) {
  try {
    const frames = loadLocalFrames();
    if (frames.length && frames[frames.length - 1].t === frame.t) return;
    frames.push({ t: frame.t, trains: frame.trains.map(({ id, line, route, lat, lon, bearing, status, stopId, directionId }) => ({ id, line, route, lat, lon, bearing, status, stopId, directionId, occupancy: null })) });
    localStorage.setItem(LOCAL_REPLAY_KEY, JSON.stringify(frames.slice(-LOCAL_REPLAY_MAX)));
  } catch {}
}

function loadLocalFrames(): ReplayFrame[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_REPLAY_KEY) ?? "[]");
  } catch {
    return [];
  }
}
