"use client";

// Pieces of the shell shared by the mobile header, desktop top bar, and page headers:
// nav items, the XP pill, the Ask Guide button, the notifications bell, and the player avatar (DESIGN.md §4–5).

import { Bell, Moon, Sparkles, Sun } from "lucide-react";
import { setTheme, useTheme } from "@/features/theme/theme";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openGuide } from "@/features/guide/open-guide";
import { cn } from "@/lib/utils";
import type { ShellPlayer } from "./use-shell-player";

/** Icon paths from the reference designs (24 × 24, 1.8 stroke). */
export const NAV = [
  { href: "/", label: "Explore", d: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { href: "/quests", label: "Quests", d: "M5 21V4M5 4h11l-2 4 2 4H5" },
  {
    href: "/passport",
    label: "Passport",
    d: "M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11.5 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 17h5",
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    d: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8",
  },
  {
    href: "/rewards",
    label: "Rewards",
    d: "M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3 7h18v4H3zM12 7v14M12 7c-1.4-2.8-5-3.2-5-1.2C7 7 9.5 7 12 7zm0 0c1.4-2.8 5-3.2 5-1.2C17 7 14.5 7 12 7z",
  },
  { href: "/events", label: "Events", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", desktopOnly: true },
  // Host (BU Spark! track): publish an event that shows on the map. Phones reach it from the map.
  { href: "/host", label: "Host", d: "M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8zM5 21h14", desktopOnly: true },
  // Pipeline: how the app works (tracks, agents, tools), for the demo.
  { href: "/pipeline", label: "Pipeline", d: "M4 6h5v4H4zM15 14h5v4h-5zM9 8h3a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2M4 18h5M6.5 10v8", desktopOnly: true },
] as const satisfies readonly { href: string; label: string; d: string; desktopOnly?: boolean }[];

/** The phone tab bar keeps 5 items (DESIGN.md §4); Events and Host are desktop only (phones reach Host from the map). */
export const PHONE_NAV = NAV.filter((item) => !("desktopOnly" in item && item.desktopOnly));

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function NavIcon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const STAR = "M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z";

/** Gold XP pill, links to the leaderboard. Signed out: a "Sign in" pill. */
export function XpPill({ player, size = "md" }: { player: ShellPlayer | null | undefined; size?: "sm" | "md" }) {
  const base = cn(
    "flex shrink-0 items-center gap-1.5 rounded-full bg-gold px-3 font-bold text-gold-foreground tabular-nums",
    size === "sm" ? "h-8 text-[13px]" : "h-8 text-[13px]",
  );
  if (player === undefined) return <span className={cn(base, "w-24 opacity-60")} aria-hidden />;
  if (player === null) {
    return (
      <Link href="/login" className={base}>
        Sign in
      </Link>
    );
  }
  // Level and progress to the next one, next to the XP (250 XP a level, profiles.level).
  const { level, xp, xp_to_next_level: toNext } = player.profile;
  const into = Math.max(0, Math.min(250, 250 - (toNext ?? 250)));
  return (
    <Link
      href="/leaderboard"
      className={cn(base, "gap-2 pl-1.5")}
      aria-label={`Level ${level}, ${xp.toLocaleString("en-US")} XP, ${toNext} XP to level ${level + 1}. See the leaderboard`}
      title={`Level ${level} · ${toNext} XP to level ${level + 1}`}
    >
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-maroon text-[11px] font-extrabold text-white">{level}</span>
      <span className="flex flex-col items-start leading-none">
        <span className="flex items-center gap-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d={STAR} />
          </svg>
          {xp.toLocaleString("en-US")} XP
        </span>
        <span className="mt-1 h-[3px] w-full min-w-14 overflow-hidden rounded-full bg-gold-foreground/20" aria-hidden>
          <span className="block h-full rounded-full bg-maroon" style={{ width: `${(100 * into) / 250}%` }} />
        </span>
      </span>
    </Link>
  );
}

/**
 * "Ask Guide" in a page header, for pages where the floating button is hidden
 * (src/features/guide/placement.ts). Opens the same chat as the floating button.
 */
export function AskGuideButton({ compact = false }: { compact?: boolean }) {
  const base =
    "flex shrink-0 items-center justify-center rounded-full border border-gold/70 bg-white/12 text-on-maroon outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-gold";
  // Compact (phone title bands): icon only, so long titles like "Today's Quests" still fit.
  if (compact) {
    return (
      <button type="button" onClick={() => openGuide()} aria-label="Ask Guide" title="Ask Guide" className={cn(base, "size-9")}>
        <Sparkles className="size-5 text-gold" aria-hidden />
      </button>
    );
  }
  return (
    <button type="button" onClick={() => openGuide()} className={cn(base, "h-9 gap-1.5 px-3.5 text-sm font-bold")}>
      <Sparkles className="size-4 text-gold" aria-hidden />
      Ask Guide
    </button>
  );
}

/** Light / dark mode switch for the whole app and the map. */
export function ThemeToggle({ tint = false }: { tint?: boolean }) {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md text-on-maroon outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-gold",
        tint ? "bg-white/12" : "bg-transparent",
      )}
    >
      {dark ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
    </button>
  );
}

/** Notifications aren't in the backend yet (DESIGN.md §12): a simple panel for now. */
export function NotificationsBell({ tint = false }: { tint?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md text-on-maroon outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-gold",
          tint ? "bg-white/12" : "bg-transparent",
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl p-2">
        <DropdownMenuLabel className="type-heading px-2 pt-1">Notifications</DropdownMenuLabel>
        <p className="type-small px-2 pb-2 text-muted-foreground">
          Nothing new yet. Squad invites and tier-ups will show up here.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Gold circle with the initial in Fraunces, ringed in the school color (DESIGN.md §5 Avatar). */
export function PlayerAvatar({
  player,
  size = 44,
  className,
}: {
  player: ShellPlayer;
  size?: number;
  className?: string;
}) {
  const initial = (player.profile.display_name ?? player.profile.email).trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gold font-display font-bold text-gold-foreground",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.41,
        // 2 px white gap, then the school color (DESIGN.md §5 Avatar).
        boxShadow: `0 0 0 2px var(--paper), 0 0 0 4px ${player.school?.color ?? "var(--border-strong)"}`,
      }}
    >
      {initial}
    </span>
  );
}

export function ProfileLink({ player, size = 36 }: { player: ShellPlayer | null | undefined; size?: number }) {
  if (!player) return null;
  return (
    <Link href="/profile" aria-label="Your profile" className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold">
      <PlayerAvatar player={player} size={size} className="transition-transform duration-200 hover:scale-105" />
    </Link>
  );
}
