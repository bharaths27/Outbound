"use client";

// The Grok guide launcher, shown with the app shell only: full-screen flows (login,
// onboarding, squad invite) keep their bottom buttons clear.

import { usePathname } from "next/navigation";
import GrokGuide from "@/components/guide/GrokGuide";
import { isBareRoute } from "./app-shell";

export function ShellGuide() {
  const pathname = usePathname();
  return isBareRoute(pathname) ? null : <GrokGuide />;
}
