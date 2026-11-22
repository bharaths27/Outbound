"use client";

// Pieces of the shell shared by the mobile header, desktop top bar, and page headers:
// nav items, the XP pill, the Ask Guide button, the notifications bell, and the player avatar (DESIGN.md §4–5).

import { Bell, Sparkles } from "lucide-react";
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
] as const satisfies readonly { href: string; label: string; d: string; desktopOnly?: boolean }[];

/** The phone tab bar keeps 5 items (DESIGN.md §4); Events (not designed yet) is desktop only. */
export const PHONE_NAV = NAV.filter((item) => !("desktopOnly" in item && item.desktopOnly));

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export function NavIcon({ d, size = 22 }: { d: string; size?: number }) {
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
    size === "sm" ? "h-[34px] text-sm" : "h-9 text-sm",
  );
  if (player === undefined) return <span className={cn(base, "w-24 opacity-60")} aria-hidden />;
  if (player === null) {
    return (
      <Link href="/login" className={base}>
        Sign in
      </Link>
    );
  }
  return (
    <Link href="/leaderboard" className={base} aria-label={`${player.profile.xp.toLocaleString("en-US")} XP, see the leaderboard`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d={STAR} />
      </svg>
      {player.profile.xp.toLocaleString("en-US")} XP
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
      <button type="button" onClick={() => openGuide()} aria-label="Ask Guide" title="Ask Guide" className={cn(base, "size-11")}>
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

/** Notifications aren't in the backend yet (DESIGN.md §12): a simple panel for now. */
export function NotificationsBell({ tint = false }: { tint?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Notifications"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md text-on-maroon outline-none focus-visible:ring-2 focus-visible:ring-gold",
          tint ? "bg-white/12" : "bg-transparent",
        )}
      >
        <Bell className="size-[22px]" aria-hidden />
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

export function ProfileLink({ player, size = 44 }: { player: ShellPlayer | null | undefined; size?: number }) {
  if (!player) return null;
  return (
    <Link href="/profile" aria-label="Your profile" className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-gold">
      <PlayerAvatar player={player} size={size} />
    </Link>
  );
}
