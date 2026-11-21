"use client";
// Rain, snow and fog over the map when it's like that outside (a light canvas overlay, no clicks).
import { useEffect, useRef } from "react";
import type { Weather } from "./weather";

export default function WeatherFx({ weather, active }: { weather: Weather | null; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const kind = weather?.kind;
  const intensity = weather?.intensity ?? 0;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !active || !(kind === "rain" || kind === "snow" || kind === "storm")) return;
    const ctx = cv.getContext("2d")!;
    const snow = kind === "snow";
    let raf = 0;
    let parts: { x: number; y: number; v: number; s: number }[] = [];
    const resize = () => {
      cv.width = cv.clientWidth;
      cv.height = cv.clientHeight;
      const n = Math.round((cv.width * cv.height) / (snow ? 9000 : 6000) * (0.4 + intensity));
      parts = Array.from({ length: n }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, v: 0.6 + Math.random() * 0.8, s: Math.random() }));
    };
    resize();
    window.addEventListener("resize", resize);
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = "rgba(210,225,245,0.55)";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of parts) {
        if (snow) {
          p.y += 40 * p.v * dt;
          p.x += Math.sin(t / 900 + p.s * 6) * 12 * dt;
          ctx.moveTo(p.x + 1.6, p.y);
          ctx.arc(p.x, p.y, 1 + p.s * 1.4, 0, Math.PI * 2);
        } else {
          p.y += 900 * p.v * dt;
          p.x -= 120 * p.v * dt;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 2.5, p.y - 14 * p.v);
        }
        if (p.y > cv.height + 20) {
          p.y = -20;
          p.x = Math.random() * (cv.width + 100);
        }
      }
      if (snow) ctx.fill();
      else ctx.stroke();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, cv.width, cv.height);
    };
  }, [kind, intensity, active]);
  return (
    <>
      <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      {active && kind === "fog" && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 via-white/20 to-white/10" aria-hidden />}
      {active && (kind === "rain" || kind === "storm") && <div className="pointer-events-none absolute inset-0 bg-slate-700/10" aria-hidden />}
    </>
  );
}
