// MapLibre 6 loads its web worker from a separate file that bundlers don't copy.
// Copy it into public/ so the map can load it from /maplibre-gl-worker.mjs (runs before dev and build).
import { copyFileSync } from "node:fs";
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
