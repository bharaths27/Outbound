"use client";

// The Grok guide launcher, shown with the app shell only: full-screen flows (login,
// onboarding, squad invite) keep their bottom buttons clear. On phones the launcher steps
// aside for the station hub drawer (which has its own Ask Guide button) and for the quest
// page's Check in bar.

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";
import GrokGuide from "@/components/guide/GrokGuide";
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
  // Phones: the hub drawer and the quest page's sticky Check in bar own the bottom edge.
  const bottomTaken = hubOpen || pathname.startsWith("/q/");
  return <GrokGuide hideLauncher={bottomTaken && !desktop} />;
}
