"use client";

// The Grok guide launcher, shown with the app shell only, and floating only where
// src/features/guide/placement.ts says so: full-screen flows (login,
// onboarding, squad invite) keep their bottom buttons clear. On phones the launcher steps
// aside for the station hub drawer (which has its own Ask Guide button) and for the quest
// page's Check in bar.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";
import GrokGuide from "@/components/guide/GrokGuide";
import { guideFloatsOn } from "@/features/guide/placement";
import { isBareRoute } from "./app-shell";

export function ShellGuide() {
  return (
    <Suspense fallback={null}>
      <Guide />
    </Suspense>
  );
}

const DESKTOP = "(min-width: 1024px)";

function useDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(DESKTOP);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}

function Guide() {
  const pathname = usePathname();
  const hubOpen = useSearchParams().has("station");
  const desktop = useDesktop();
  if (isBareRoute(pathname)) return null;
  // Pages without the floating button open the chat from their header (placement.ts).
  // Phones: the hub drawer and the quest page's sticky Check in bar own the bottom edge.
  const bottomTaken = hubOpen || pathname.startsWith("/q/");
  const floats = guideFloatsOn(pathname);
  return <GrokGuide hideLauncher={!floats || (bottomTaken && !desktop)} openFromHeader={!floats} />;
}
