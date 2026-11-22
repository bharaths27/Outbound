"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NAV, NavIcon, PHONE_NAV, NotificationsBell, ProfileLink, XpPill, isActive } from "./shell-parts";
import { useShellPlayer } from "./use-shell-player";

/** Routes that render without the shell (full-screen flows and dev pages). */
const BARE_ROUTES = ["/login", "/onboarding", "/squad/join", "/dev"];

export const isBareRoute = (pathname: string) => BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/**
 * App frame (DESIGN.md §4). Phones and tablets (< 1024 px): a maroon header on Explore
 * (logo, XP, bell, avatar), page content, and a 5-item bottom tab bar. Desktop: a maroon
 * top bar with the logo, nav pills, XP, bell, and avatar. Other pages draw their own
 * title band with <PageHeader/>.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const player = useShellPlayer();
  if (isBareRoute(pathname)) return <>{children}</>;
  const onExplore = pathname === "/";

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Desktop top bar */}
      <header className="hidden bg-maroon text-on-maroon desk:block">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-7 gap-y-3 px-8 py-3">
          <Link href="/" className="flex items-center py-2" aria-label="Outbound home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/outbound-wordmark.svg" alt="" className="block h-7 w-auto" />
          </Link>
          <nav aria-label="Primary" className="flex flex-1 flex-wrap gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center rounded-full px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    active ? "bg-paper font-bold text-maroon shadow-nav" : "font-semibold text-on-maroon-muted hover:bg-white/10",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <XpPill player={player} />
            <NotificationsBell tint />
            <ProfileLink player={player} />
          </div>
        </div>
      </header>

      {/* Mobile header: Explore only; other pages bring their own title band. */}
      {onExplore && (
        <header className="flex items-center gap-1.5 bg-maroon px-3 pt-[calc(14px+env(safe-area-inset-top))] pb-3 text-on-maroon desk:hidden">
          <div className="flex flex-1 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/outbound-wordmark.svg" alt="Outbound" className="block h-[22px] w-auto" />
          </div>
          <XpPill player={player} size="sm" />
          <NotificationsBell />
          <ProfileLink player={player} size={34} />
        </header>
      )}

      {/* Bottom padding keeps the floating Ask Guide button off the last row of every page. */}
      <main className="relative min-h-0 flex-1 overflow-y-auto pb-20">{children}</main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Primary"
        className="flex shrink-0 justify-around border-t border-divider bg-paper px-1.5 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] desk:hidden"
      >
        {PHONE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[54px] min-w-[66px] flex-col items-center justify-center gap-[3px] rounded-2xl px-1.5 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-maroon",
                active ? "bg-maroon text-on-maroon" : "text-muted-foreground",
              )}
            >
              <NavIcon d={item.d} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
