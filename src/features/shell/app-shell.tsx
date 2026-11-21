"use client";

import { CircleUser, Map as MapIcon, Stamp, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Map", icon: MapIcon },
  { href: "/passport", label: "Passport", icon: Stamp },
  { href: "/leaderboard", label: "Compete", icon: Trophy },
  { href: "/profile", label: "Profile", icon: CircleUser },
];

/** Routes that render without navigation (full-screen flows and dev pages). */
const BARE_ROUTES = ["/login", "/onboarding", "/dev"];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/**
 * App frame: bottom tab bar on mobile, left rail from 768 px. The page area fills the
 * remaining space, so the map at "/" can be full-bleed.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return <>{children}</>;

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <nav
        aria-label="Main"
        className="hidden w-20 shrink-0 flex-col items-center gap-2 border-r bg-background pt-6 pl-[env(safe-area-inset-left)] md:flex"
      >
        {TABS.map((tab) => (
          <NavItem key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}
      </nav>

      <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>

      <nav
        aria-label="Main"
        className="grid shrink-0 grid-cols-4 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.map((tab) => (
          <NavItem key={tab.href} {...tab} active={isActive(pathname, tab.href)} />
        ))}
      </nav>
    </div>
  );
}

function NavItem({ href, label, icon: Icon, active }: (typeof TABS)[number] & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ease-out",
          active ? "bg-secondary text-secondary-foreground" : "group-hover:bg-muted",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="type-tiny">{label}</span>
    </Link>
  );
}
