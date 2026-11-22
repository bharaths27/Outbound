"use client";

// A quest photo that swaps to the tinted category placeholder if it fails to load
// (offline, venue wifi, or a dead link).

import { type ReactNode, useState } from "react";

export function PhotoOrFallback({ src, className, fallback }: { src: string; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return fallback;
  // Remote photos come from the content team; next/image needs their hosts configured first.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={className} />;
}
