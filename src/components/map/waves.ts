// Gently moving water: a small wave pattern drawn on a canvas and shifted every frame of a slow timer,
// laid over the basemap's water as a fill-pattern (works for the online and the offline basemap).
import type { Map as MlMap, FillLayerSpecification } from "maplibre-gl";

const S = 64;

function draw(ctx: CanvasRenderingContext2D, t: number) {
  ctx.clearRect(0, 0, S, S);
  ctx.lineCap = "round";
  // short wave crests in a staggered grid, bobbing and drifting
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 2; col++) {
      const phase = t * 1.6 + row * 1.7 + col * 2.3;
      const x0 = ((col * 32 + (row % 2) * 16 + t * 3) % S + S) % S;
      const y0 = row * 16 + 8 + Math.sin(phase) * 1.5;
      const a = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(phase));
      ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.lineWidth = 1.6;
      for (const dx of [0, -S]) {
        ctx.beginPath();
        ctx.moveTo(x0 + dx - 6, y0);
        ctx.quadraticCurveTo(x0 + dx - 3, y0 - 2.5, x0 + dx, y0);
        ctx.quadraticCurveTo(x0 + dx + 3, y0 + 2.5, x0 + dx + 6, y0);
        ctx.stroke();
      }
    }
  }
}

/** Adds a "<id>-waves" layer over each water fill layer. Returns a stop function. */
export function addWaves(map: MlMap, waterIds: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  draw(ctx, 0);
  map.addImage("ob-waves", ctx.getImageData(0, 0, S, S), { pixelRatio: 2 });
  const style = map.getStyle();
  for (const id of waterIds) {
    const w = style.layers.find((l) => l.id === id) as FillLayerSpecification | undefined;
    if (!w || w.type !== "fill") continue;
    const idx = style.layers.findIndex((l) => l.id === id);
    const next = style.layers[idx + 1]?.id;
    map.addLayer(
      {
        id: `${id}-waves`,
        type: "fill",
        source: w.source,
        ...(w["source-layer"] ? { "source-layer": w["source-layer"] } : {}),
        ...(w.filter ? { filter: w.filter } : {}),
        minzoom: 11.5,
        paint: { "fill-pattern": "ob-waves", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, 0, 13, 0.8] },
      },
      next,
    );
  }
  let last = 0;
  const t0 = performance.now();
  const timer = window.setInterval(() => {
    if (document.hidden || map.getZoom() < 11.5) return;
    const t = (performance.now() - t0) / 1000;
    if (t - last < 0.09) return;
    last = t;
    draw(ctx, t);
    map.updateImage("ob-waves", ctx.getImageData(0, 0, S, S));
  }, 100);
  return () => clearInterval(timer);
}
