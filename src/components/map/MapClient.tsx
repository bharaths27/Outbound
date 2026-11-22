"use client";
import dynamic from "next/dynamic";

// MapLibre and three.js need the browser, so the map is never server-rendered.
const TransitMap = dynamic(() => import("./TransitMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#dfe9f3] text-sm text-[var(--ob-muted)]">Loading map…</div>,
});

export default function MapClient() {
  return <TransitMap />;
}
