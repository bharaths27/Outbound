"use client";
// Live 3D map of the T. Owner: Person 1 (map frontend).
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { openStationHub } from "@/features/hub/open-hub";
import type { LineLateness, Station, Train } from "@/lib/types";
import { LINE_COLORS } from "@/lib/lines";
import { TrackNetwork } from "./track";
import { TrainAnimator, Trains3DLayer, TrainNow } from "./trains3d";
import { loadBaseStyle, groundLayerIds, registerFontProtocol } from "./style";
import { CityBuildingsLayer, fetchBpdaManifest, fetchRegionManifest, inBpda, inRegion } from "./buildings3d";
import { GOOGLE_KEY, GoogleTilesLayer } from "./googleTiles";
import SearchBox, { pointInRing } from "./SearchBox";
import Explorer, { type ExplorerHandle } from "./Explorer";
import { addWaves } from "./waves";
import { fetchWeather, type Weather } from "./weather";
import WeatherFx from "./WeatherFx";
import { BookOpen, Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Landmark, Moon, Soup, Star, Sun, Sunset, Trophy, Waves } from "lucide-react";
import { createElement, Landmark as LandmarkN, Waves as WavesN, Soup as SoupN, BookOpen as BookOpenN, Sunset as SunsetN, Trophy as TrophyN } from "lucide";

const QUEST_ICONS = { Landmark, Waves, Soup, BookOpen, Sunset, Trophy };
const QUEST_NODES = { Landmark: LandmarkN, Waves: WavesN, Soup: SoupN, BookOpen: BookOpenN, Sunset: SunsetN, Trophy: TrophyN };
const svgOf = (node: (typeof QUEST_NODES)[keyof typeof QUEST_NODES], size: number) => {
  const el = createElement(node);
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  el.setAttribute("stroke-width", "2.2");
  return el.outerHTML;
};
import {
  LIVE_INTERVAL_MS, ReplayFrame, DemoFeed, fetchLive, fetchReplay, fetchLateness,
  destinationOf, LATENESS_HEX,
} from "./feed";
import { CAMPUSES, SAMPLE_FRIEND_VISITS, SAMPLE_QUESTS, initials, type FriendVisit, type Quest } from "./places";

type FeedMode = "live" | "replay" | "demo";
interface CrStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routes: string[];
  town: string;
}
/** Commuter Rail lines and stations (purple) are off for now; set true to show them again. */
const SHOW_COMMUTER_RAIL = false;
const CR_VIS = SHOW_COMMUTER_RAIL ? "visible" : "none";
const CR_NAMES: Record<string, string> = {
  "CR-Fairmount": "Fairmount", "CR-NewBedford": "Fall River/New Bedford", "CR-Fitchburg": "Fitchburg", "CR-Worcester": "Framingham/Worcester",
  "CR-Franklin": "Franklin/Foxboro", "CR-Greenbush": "Greenbush", "CR-Haverhill": "Haverhill", "CR-Kingston": "Kingston", "CR-Lowell": "Lowell",
  "CR-Needham": "Needham", "CR-Newburyport": "Newburyport/Rockport", "CR-Providence": "Providence/Stoughton",
};

interface StationData extends Pick<Station, "id" | "name" | "lat" | "lon"> {
  lines: string[];
  branches: string[];
  platforms: string[];
}

/** Span of the subway lines (from mbta-lines.geojson) with a little room around it. */
const T_BOUNDS: [[number, number], [number, number]] = [[-71.275, 42.193], [-70.97, 42.452]];
/** The subway lines themselves, end to end. */
const T_LINES: [[number, number], [number, number]] = [[-71.2526, 42.2075], [-70.9914, 42.439]];
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
  const animRef = useRef<TrainAnimator | null>(null);
  const layerRef = useRef<Trains3DLayer | null>(null);
  const cityRef = useRef<CityBuildingsLayer | null>(null);
  const [friend, setFriend] = useState<FriendVisit | null>(null);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [crStation, setCrStation] = useState<CrStation | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [isNight, setIsNight] = useState(false);
  const googleRef = useRef<GoogleTilesLayer | null>(null);
  const setRealisticRef = useRef<(on: boolean) => void>(() => {});
  const stationsRef = useRef<StationData[]>([]);
  const markersRef = useRef<{ campus: maplibregl.Marker[]; friends: maplibregl.Marker[]; quests: maplibregl.Marker[] }>({ campus: [], friends: [], quests: [] });
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
  const [train, setTrain] = useState<TrainNow | null>(null);
  const [now, setNow] = useState(Date.now());
  const [replay, setReplay] = useState<{ frames: ReplayFrame[]; source: string; i: number; playing: boolean; speed: number } | null>(null);

  // ---------- map setup ----------
  useEffect(() => {
    let disposed = false;
    let stopWaves = () => {};
    let map: MlMap | null = null;
    (async () => {
      const [manifest, region] = await Promise.all([fetchBpdaManifest(), fetchRegionManifest()]);
      const [{ style, offline }, linesGeo, stations, cambridgeOutline, crStations] = await Promise.all([
        loadBaseStyle(manifest),
        fetch("/data/mbta-lines.geojson").then((r) => r.json()),
        fetch("/data/mbta-stations.json").then((r) => r.json()) as Promise<StationData[]>,
        fetch("/data/cambridge/outline.geojson").then((r) => r.json()).catch(() => null),
        fetch("/data/cr-stations.json").then((r) => r.json()).catch(() => []) as Promise<CrStation[]>,
      ]);
      if (disposed || !box.current) return;
      setOfflineBasemap(offline);
      stationsRef.current = stations;
      groundRef.current = groundLayerIds(style as StyleSpecification);
      const net = new TrackNetwork(linesGeo);
      const animator = new TrainAnimator(net);
      animRef.current = animator;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __obAnim: TrainAnimator }).__obAnim = animator; // for tests

      registerFontProtocol(maplibregl);
      maplibregl.setWorkerUrl(`${new URL("/maplibre-gl-worker.mjs", document.baseURI).href}?v=${maplibregl.getVersion()}`); // copied by scripts/copy-maplibre-worker.mjs
      map = new maplibregl.Map({
        container: box.current,
        style,
        center: VIEWS.boston.center,
        zoom: VIEWS.boston.zoom - 0.6,
        pitch: 50,
        bearing: VIEWS.boston.bearing + 25,
        maxPitch: 85, // tilt almost to street level
        // the map only covers the T network: Riverside/Alewife/Oak Grove/Wonderland/Braintree/Mattapan plus ~1.5 km
        maxBounds: T_BOUNDS,
        minZoom: 10,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      });
      mapRef.current = map;
      // the farthest you can zoom out is the whole T network filling the screen
      const m0 = map;
      const fitMinZoom = () => {
        const cam = m0.cameraForBounds(T_LINES, { padding: 24, bearing: 0 });
        if (cam?.zoom != null) m0.setMinZoom(Math.max(9, Math.min(12, cam.zoom)));
      };
      fitMinZoom();
      map.on("resize", fitMinZoom);
      map.on("zoomend", () => { if (m0.getZoom() < m0.getMinZoom() - 0.01) m0.easeTo({ zoom: m0.getMinZoom(), duration: 200 }); });
      if (process.env.NODE_ENV !== "production") (window as unknown as { __obMap: MlMap }).__obMap = map; // for tests
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
      map.on("error", (e) => console.warn("[map]", e.error?.message ?? e)); // e.g. a tile or font that failed to load

      map.on("style.load", () => {
        const m = map!;
        m.setProjection({ type: "mercator" }); // flat map: the view is locked to the T network, so no globe
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

        // Commuter Rail (purple, thinner, under the subway lines) out to Brandeis, Salem, Worcester, Providence...
        m.addSource("cr-lines", { type: "geojson", data: "/data/cr-lines.geojson" });
        m.addLayer({
          id: "cr-casing",
          type: "line",
          source: "cr-lines",
          layout: { "line-cap": "round", "line-join": "round", visibility: CR_VIS },
          paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.2, 13, 2.4, 17, 4.5], "line-opacity": 0.85 },
        }, beforeLines);
        m.addLayer({
          id: "cr-lines",
          type: "line",
          source: "cr-lines",
          layout: { "line-cap": "round", "line-join": "round", visibility: CR_VIS },
          paint: { "line-color": "#80276C", "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 13, 1.3, 17, 2.6], "line-dasharray": [3, 1.2] },
        }, beforeLines);
        m.addSource("mbta-lines", { type: "geojson", data: linesGeo });
        m.addLayer({
          id: "lines-delay-glow",
          type: "line",
          source: "mbta-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#999", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, 9, 10, 11, 13, 13, 16, 18, 18, 34, 20, 110], "line-blur": 4, "line-opacity": 0.55 },
        }, beforeLines);
        m.addLayer({
          id: "lines-casing",
          type: "line",
          source: "mbta-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, 4.5, 10, 6, 13, 7.5, 16, 11, 18, 26, 20, 96], "line-opacity": 0.9 },
        }, beforeLines);
        m.addLayer({
          id: "lines",
          type: "line",
          source: "mbta-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": lineColorExpr(LINE_COLORS), "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 7, 3, 10, 4.2, 13, 5.5, 16, 8, 18, 20, 20, 84] },
        }, beforeLines);

        // campuses: one outline + see-through fill per school (real campus areas from OpenStreetMap via Overture Maps)
        m.addSource("campuses", { type: "geojson", data: "/data/campuses.geojson" });
        m.addLayer({ id: "campus-fill", type: "fill", source: "campuses", paint: { "fill-color": ["get", "color"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0.22, 16, 0.14] } }, beforeLines);
        m.addLayer({ id: "campus-halo", type: "line", source: "campuses", layout: { "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 16, 5], "line-opacity": 0.85 } }, beforeLines);
        m.addLayer({ id: "campus-line", type: "line", source: "campuses", layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.2, 16, 2.4], "line-dasharray": [3, 2] } }, beforeLines);

        // game-style 3D city: Boston's own building models (BPDA), Cambridge footprints + heights, trees
        const city = new CityBuildingsLayer(manifest, region);
        cityRef.current = city;
        m.addLayer(city, labelsStart);
        // night: a blue wash over the ground (under the T lines, campuses and buildings), matching the 3D city's light
        m.addLayer({ id: "night-tint", type: "background", paint: { "background-color": "#1c2448", "background-opacity": 0 } }, "cr-casing");
        city.onNight = (n) => {
          if (m.getLayer("night-tint")) m.setPaintProperty("night-tint", "background-opacity", n * 0.42);
          setIsNight(n > 0.5);
        };
        city.updateSun();
        // detailed streets and sidewalks near the view (offline ground: one file per ~6 km cell)
        if (m.getSource("ov-minor")) {
          const cache = new Map<string, GeoJSON.Feature[]>();
          let cells: { file: string; bbox: [number, number, number, number] }[] = [];
          fetch("/data/ground/manifest.json").then((r) => r.json()).then((j) => ((cells = j.minor), loadMinor())).catch(() => {});
          const loadMinor = async () => {
            if (m.getZoom() < 13) return;
            const b = m.getBounds();
            const want = cells.filter((c) => c.bbox[0] < b.getEast() + 0.02 && c.bbox[2] > b.getWest() - 0.02 && c.bbox[1] < b.getNorth() + 0.02 && c.bbox[3] > b.getSouth() - 0.02).slice(0, 12);
            const missing = want.filter((c) => !cache.has(c.file));
            if (!missing.length) return;
            await Promise.all(missing.map(async (c) => cache.set(c.file, (await (await fetch(`/data/ground/${c.file}`)).json()).features)));
            for (const k of [...cache.keys()]) if (!want.some((c) => c.file === k)) cache.delete(k); // keep memory small
            (m.getSource("ov-minor") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [...cache.values()].flat() });
          };
          m.on("moveend", loadMinor);
          // crosswalks: one small file for the whole area, fetched the first time you get close to street level
          let xwalk = false;
          const loadXwalk = () => {
            if (xwalk || m.getZoom() < 15.5) return;
            xwalk = true;
            fetch("/data/ground/crosswalks.json").then((r) => r.json()).then((j) => (m.getSource("ov-xwalk") as GeoJSONSource | undefined)?.setData(j)).catch(() => (xwalk = false));
          };
          m.on("moveend", loadXwalk);
          loadXwalk();
        }
        // moving water on the river, harbor and ponds
        const styleIds = m.getStyle().layers.map((l) => l.id);
        stopWaves = addWaves(m, styleIds.filter((id) => id === "water" || id === "cam-water"));
        // near street level, flat street names would float over the buildings in front: hide them there
        const streetLabels = styleIds.filter((id) => id.startsWith("street-names") || /^highway[-_]name/.test(id));
        const syncLabels = () => {
          const v = m.getPitch() > 72 && m.getZoom() > 17 ? "none" : "visible";
          for (const id of streetLabels) if (m.getLayoutProperty(id, "visibility") !== v) m.setLayoutProperty(id, "visibility", v);
        };
        m.on("pitchend", syncLabels);
        m.on("zoomend", syncLabels);
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
          const real = (manifest && inBpda(c.lng, c.lat)) || (region && inRegion(c.lng, c.lat)) || (cambRing && pointInRing([c.lng, c.lat], cambRing));
          // (the 3D city layer draws the whole T area itself; Google's 3D draws everything)
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
            "circle-radius": ["interpolate", ["exponential", 1.6], ["zoom"], 9, ["case", ["get", "transfer"], 3.4, 2.6], 13, ["case", ["get", "transfer"], 5.2, 4.2], 17, ["case", ["get", "transfer"], 9, 7.5], 20, ["case", ["get", "transfer"], 30, 26]],
            "circle-color": "#ffffff",
            "circle-stroke-color": ["case", ["get", "transfer"], "#1f2937", lineColorExpr(LINE_COLORS)],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 14, 2.2, 20, 5],
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

        // Commuter Rail stations
        m.addSource("cr-stations", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: crStations.map((s) => ({ type: "Feature", properties: { id: s.id, name: s.name, town: s.town }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })),
          },
        });
        m.addLayer({
          id: "cr-stations",
          type: "circle",
          source: "cr-stations",
          minzoom: 8.5,
          layout: { visibility: CR_VIS },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.4, 13, 3, 17, 5],
            "circle-color": "#ffffff",
            "circle-stroke-color": "#80276C",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 14, 1.6],
            "circle-pitch-alignment": "map",
          },
        });
        m.addLayer({
          id: "cr-station-labels",
          type: "symbol",
          source: "cr-stations",
          minzoom: 12,
          layout: {
            visibility: CR_VIS,
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9.5, 17, 12],
            "text-offset": [0, 1.0],
            "text-anchor": "top",
            "text-optional": true,
          },
          paint: { "text-color": "#5b1d4e", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
        });
        m.on("click", "cr-stations", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          setTrain(null);
          setCrStation(crStations.find((x) => x.id === f.properties?.id) ?? null);
        });
        m.on("mouseenter", "cr-stations", () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", "cr-stations", () => (m.getCanvas().style.cursor = ""));

        // 2D train dots (also the click target for 3D trains)
        m.addSource("trains-2d", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "trains-2d",
          type: "circle",
          source: "trains-2d",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 6.5, 15, 8, 18, 12],
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
            openStationHub(s.id); // the hub (src/features/hub) shows the station, arrivals and quests
          }
        });
        m.on("click", "trains-2d", (e) => {
          const id = e.features?.[0]?.properties?.id as string;
          const t = animRef.current?.snapshot().find((x) => x.id === id);
          if (t) {
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
      stopWaves();
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
      el.onclick = (ev) => {
        ev.stopPropagation();
        setQuest(null);
        setFriend(f);
        map.easeTo({ center: [f.lng, f.lat], zoom: Math.max(map.getZoom(), 15.4), duration: 1400 });
      };
      return new maplibregl.Marker({ element: el }).setLngLat([f.lng, f.lat]).addTo(map);
    });
    markersRef.current.quests = SAMPLE_QUESTS.map((q) => {
      const el = document.createElement("div");
      el.className = "ob-quest";
      el.title = q.title;
      el.innerHTML = `<span class="ob-quest-icon">${svgOf(QUEST_NODES[q.icon], 15)}</span><span class="ob-quest-pts">+${q.points}</span>`;
      el.onclick = (ev) => {
        ev.stopPropagation();
        setFriend(null);
        setQuest(q);
        map.easeTo({ center: [q.lng, q.lat], zoom: Math.max(map.getZoom(), 15.6), duration: 1400 });
      };
      return new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([q.lng, q.lat]).addTo(map);
    });
    const markers = markersRef.current;
    return () => {
      markers.campus.forEach((m) => m.remove());
      markers.friends.forEach((m) => m.remove());
      markers.quests.forEach((m) => m.remove());
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
      markersRef.current.quests.forEach((m) => (m.getElement().style.display = show.friends && z >= 12.5 ? "" : "none"));
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
    if (layerRef.current) layerRef.current.visible = show.trains; // 2D shows the same train models from above
    // 2D is the same city seen straight from above (roofs), with tilting locked. In 3D, tilt is limited when zoomed
    // out so the horizon never shows land past the T lines; full tilt comes back as you zoom in.
    const pitchCap = () => {
      if (!is3D) return map.setMaxPitch(0);
      const t = Math.min(1, Math.max(0, (map.getZoom() - map.getMinZoom()) / 2.5));
      const cap = 25 + t * 60;
      if (Math.abs(map.getMaxPitch() - cap) > 0.5) map.setMaxPitch(cap);
    };
    pitchCap();
    map.on("zoom", pitchCap);
    map.setPaintProperty(
      "trains-2d",
      "circle-opacity",
      !show.trains ? 0 : ["interpolate", ["linear"], ["zoom"], TRAIN_3D_MIN_ZOOM - 0.3, 1, TRAIN_3D_MIN_ZOOM, 0],
    );
    map.setPaintProperty(
      "trains-2d",
      "circle-stroke-opacity",
      !show.trains ? 0 : ["interpolate", ["linear"], ["zoom"], TRAIN_3D_MIN_ZOOM - 0.3, 1, TRAIN_3D_MIN_ZOOM, 0],
    );
    if (map.getZoom() > 5 && is3D) map.easeTo({ pitch: 58, duration: 900 });
    map.triggerRepaint();
    return () => {
      map.off("zoom", pitchCap);
    };
  }, [ready, is3D, show.trains]);

  // ---------- weather outside (light, clouds, rain/snow), refreshed every 15 min ----------
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = async () => {
      const w = await fetchWeather();
      if (!alive) return;
      setWeather(w);
      cityRef.current?.setWeather(w);
    };
    load();
    const t = setInterval(load, 15 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ready]);

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

  // ---------- UI ----------
  const ago = lastUpdate ? Math.max(0, Math.round((now - lastUpdate) / 1000)) : null;
  const statusText =
    feedMode === "live"
      ? lastUpdate ? `Live · ${trainCount} trains · ${ago}s ago` : "Connecting to MBTA…"
      : feedMode === "replay"
        ? `Replay · ${replay?.source} · ${replay ? fmtTime(replay.frames[replay.i].t) : ""}`
        : `Sample trains · MBTA feed unreachable`;

  return (
    <div className="ob-map absolute inset-0 overflow-hidden bg-[#dfe9f3]">
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <WeatherFx weather={weather} active={loaded && is3D} />
      {/* top-left: feed status, Tiger Data badges (the app shell shows the logo) */}
      <div className="absolute left-3 top-3 flex max-w-[calc(100vw-212px)] sm:max-w-[calc(100vw-24px)] flex-col gap-2 sm:left-4 sm:top-4">
        <div className="ob-panel flex items-center gap-3 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs text-[var(--ob-ink-2)]">
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white ${feedMode === "live" && lastUpdate ? "bg-emerald-600" : feedMode === "replay" ? "bg-sky-600" : "bg-amber-500"}`}
              title={feedMode === "live" ? "Real MBTA positions" : "Not real-time: MBTA feed unreachable"}
            >
              {feedMode === "live" && lastUpdate ? "LIVE" : feedMode === "replay" ? "REPLAY" : "DEMO"}
            </span>
            {statusText}
          </span>
          {weather && <WeatherChip w={weather} night={isNight} />}
        </div>
        <SearchBox
          map={ready ? mapRef.current : null}
          stations={stationsRef.current}
          online={!offlineBasemap}
          onStation={(id) => {
            const s = stationsRef.current.find((x) => x.id === id);
            if (!s) return;
            setTrain(null);
            openStationHub(s.id);
          }}
          onTextSearch={(q) => explorer.current?.search(q)}
          onPlace={(p) => explorer.current?.show(p)}
        />
        <Explorer ref={explorer} map={ready ? mapRef.current : null} userLoc={userLoc} />
        {autoFallback && feedMode !== "live" && (
          <div className="ob-panel px-3 py-1.5 text-xs text-amber-800">Live feed is down. Showing {feedMode === "replay" ? "saved trains" : "demo trains"}; retrying every 30 s.</div>
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
          className="mt-1 rounded-lg bg-[var(--ob-maroon)] px-2 py-1.5 font-medium text-white hover:bg-[var(--ob-maroon-dark)]"
          onClick={() => (feedMode === "live" ? startReplay() : (setAutoFallback(false), goLive()))}
        >
          {feedMode === "live" ? "Replay saved trains" : "Back to live"}
        </button>
      </div>

      {/* replay bar */}
      {feedMode === "replay" && replay && (
        <div className="ob-panel absolute bottom-20 left-1/2 flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 items-center gap-3 px-3 py-2 text-xs">
          <button className="w-14 rounded-md bg-[var(--ob-maroon)] px-2 py-1 text-white" onClick={() => setReplay({ ...replay, playing: !replay.playing })}>
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
          <span className="w-16 tabular-nums text-[var(--ob-ink-2)]">{fmtTime(replay.frames[replay.i].t)}</span>
          <select value={replay.speed} onChange={(e) => setReplay({ ...replay, speed: Number(e.target.value) })} className="rounded border border-[var(--ob-line)] bg-white px-1 py-0.5">
            {[1, 4, 16].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </div>
      )}

      {/* friend profile: who, where, their rating and note */}
      {friend && (
        <Card onClose={() => setFriend(null)}>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-2 ring-white" style={{ background: friend.color, boxShadow: `0 0 0 3px ${friend.color}55` }}>
              {initials(friend.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[var(--ob-ink)]">{friend.name}</h2>
              <p className="text-xs text-[var(--ob-muted)]">
                {friend.school}
                {friend.year ? ` · ${friend.year}` : ""}
                {friend.visits ? ` · ${friend.visits} places` : ""}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-[var(--ob-cream)] p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-[var(--ob-ink)]">{friend.place}</span>
              <span className="shrink-0 text-xs text-[var(--ob-muted)]">{friend.when}</span>
            </div>
            <Stars value={friend.rating} />
            <p className="mt-1 text-[13px] italic text-[var(--ob-ink-2)]">“{friend.note}”</p>
          </div>
          {!!friend.recent?.length && (
            <div className="mt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ob-muted)]">Also went to</p>
              {friend.recent.map((r) => (
                <div key={r.place} className="flex items-center justify-between py-0.5 text-[13px]">
                  <span className="text-[var(--ob-ink-2)]">{r.place}</span>
                  <Stars value={r.rating} small />
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              explorer.current?.show({ id: `friend-${friend.id}`, name: friend.place, address: `${friend.name} went here ${friend.when}`, lng: friend.lng, lat: friend.lat, types: [], category: "", rating: null, ratings: 0, price: null, openNow: null, url: null });
              setFriend(null);
            }}
            className="mt-3 w-full rounded-lg bg-[var(--ob-maroon)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ob-maroon-dark)]"
          >
            Directions to {friend.place}
          </button>
          <p className="mt-1.5 text-[10px] uppercase tracking-wide text-[var(--ob-muted)]">sample friends until the friends feed is live</p>
        </Card>
      )}

      {/* commuter rail station card */}
      {crStation && (
        <Card onClose={() => setCrStation(null)}>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: "#80276C" }}>
            Commuter Rail
          </span>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ob-ink)]">{crStation.name}</h2>
          <p className="text-[var(--ob-ink-2)]">{crStation.town}</p>
          <p className="mt-1 text-[13px] text-[var(--ob-ink-2)]">{crStation.routes.map((r) => CR_NAMES[r] ?? r).join(" · ")} Line</p>
          <button
            onClick={() => {
              explorer.current?.show({ id: `cr-${crStation.id}`, name: `${crStation.name} station`, address: `Commuter Rail, ${crStation.town}`, lng: crStation.lon, lat: crStation.lat, types: [], category: "", rating: null, ratings: 0, price: null, openNow: null, url: null });
              setCrStation(null);
            }}
            className="mt-3 w-full rounded-lg bg-[var(--ob-maroon)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ob-maroon-dark)]"
          >
            Directions
          </button>
        </Card>
      )}

      {/* quest card */}
      {quest && (
        <Card onClose={() => setQuest(null)}>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              {(() => {
                const I = QUEST_ICONS[quest.icon];
                return <I size={22} strokeWidth={2} aria-hidden />;
              })()}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Passport quest · +{quest.points} pts</p>
              <h2 className="truncate text-base font-semibold text-[var(--ob-ink)]">{quest.title}</h2>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-[var(--ob-ink-2)]">
            Go to <b>{quest.place}</b>. {quest.hint}.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                explorer.current?.show({ id: `quest-${quest.id}`, name: quest.place, address: `Quest: ${quest.title}`, lng: quest.lng, lat: quest.lat, types: [], category: "", rating: null, ratings: 0, price: null, openNow: null, url: null });
                setQuest(null);
              }}
              className="flex-1 rounded-lg bg-[var(--ob-maroon)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ob-maroon-dark)]"
            >
              Directions
            </button>
            <Link href="/passport" className="rounded-lg bg-[var(--ob-sand)] px-3 py-2 text-sm font-medium text-[var(--ob-ink-2)] hover:bg-[var(--ob-line)]">
              Passport
            </Link>
          </div>
          <p className="mt-1.5 text-[10px] uppercase tracking-wide text-[var(--ob-muted)]">sample quests</p>
        </Card>
      )}

      {/* train card */}
      {train && (
        <Card onClose={() => setTrain(null)}>
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: LINE_COLORS[train.line] }}>
            {train.info.route.replace("-", " ")}
          </span>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ob-ink)]">
            To {destinationOf(train.info.route, train.info.directionId ?? 0)}
          </h2>
          <p className="text-[var(--ob-ink-2)]">
            {statusLabel(train.info.status)} {stationName(train.info.stopId) ?? "next stop"}
          </p>
          {train.info.occupancy && <p className="mt-1 text-xs text-[var(--ob-muted)]">Crowding: {train.info.occupancy.replaceAll("_", " ").toLowerCase()}</p>}
          <button
            className="mt-3 w-full rounded-lg border border-[var(--ob-line)] px-3 py-1.5 text-sm font-medium text-[var(--ob-ink)] hover:bg-[var(--ob-cream)]"
            onClick={() => mapRef.current?.flyTo({ center: [train.lng, train.lat], zoom: 16.4, pitch: 62, duration: 1800 })}
          >
            Follow closer
          </button>
        </Card>
      )}

    </div>
  );
}

function Seg<T>({ options, value, onChange }: { options: [string, T][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-[var(--ob-sand)] p-0.5">
      {options.map(([label, v]) => (
        <button
          key={label}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1 font-medium ${value === v ? "bg-white text-[var(--ob-ink)] shadow-sm" : "text-[var(--ob-muted)]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, on, set, small }: { label: string; on: boolean; set: (v: boolean) => void; small?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-2 ${small ? "pl-3 text-[11px] text-[var(--ob-muted)]" : "text-[var(--ob-ink-2)]"}`}>
      {label}
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-[var(--ob-maroon)]" />
    </label>
  );
}

function WeatherChip({ w, night }: { w: Weather; night: boolean }) {
  const Icon = { clear: night ? Moon : Sun, cloudy: w.cloud > 0.75 ? Cloud : CloudSun, fog: CloudFog, rain: CloudRain, snow: CloudSnow, storm: CloudLightning }[w.kind];
  const label = { clear: "Clear", cloudy: w.cloud > 0.75 ? "Cloudy" : "Partly cloudy", fog: "Fog", rain: "Rain", snow: "Snow", storm: "Storm" }[w.kind];
  return (
    <span className="ml-auto flex items-center gap-1 text-xs text-[var(--ob-ink-2)]" title={`${label} in Boston now. The 3D light follows the time and weather outside.`}>
      <Icon size={15} strokeWidth={2} className="text-[var(--ob-muted)]" aria-hidden />
      {w.tempF}°
    </span>
  );
}

function Stars({ value, small }: { value: number; small?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${small ? "text-[11px]" : "mt-0.5 text-sm"}`} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={small ? 11 : 14} strokeWidth={1.5} className={value >= i ? "fill-amber-400 text-amber-500" : value >= i - 0.5 ? "fill-amber-200 text-amber-400" : "fill-[var(--ob-line)] text-[var(--ob-muted)]"} aria-hidden />
      ))}
      <span className="ml-1 text-[var(--ob-muted)]">{value.toFixed(1)}</span>
    </span>
  );
}

function Card({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="ob-panel absolute bottom-24 left-3 w-[min(300px,calc(100vw-24px))] p-3.5 text-sm sm:left-4">
      <button onClick={onClose} className="absolute right-2.5 top-2 text-lg leading-none text-[var(--ob-muted)] hover:text-[var(--ob-ink-2)]" aria-label="Close">
        ×
      </button>
      {children}
    </div>
  );
}

const statusLabel = (s: string | null) =>
  s === "STOPPED_AT" ? "Stopped at" : s === "INCOMING_AT" ? "Arriving at" : "Heading to";

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
