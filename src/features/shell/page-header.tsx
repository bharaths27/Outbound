"use client";

// Page title (DESIGN.md §4). Phones: a maroon band with the title (or a back arrow and the
// title on sub-pages), Ask Guide (see src/features/guide/placement.ts) and the profile avatar on the right, and optional extra content inside
// the band (a segmented control, a podium). Desktop: the shell's top bar is the chrome, so
// the title sits on the page in Fraunces 40 with an optional back link above it.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { guideInHeaderOn } from "@/features/guide/placement";
import { cn } from "@/lib/utils";
import { AskGuideButton, ProfileLink } from "./shell-parts";
import { useShellPlayer } from "./use-shell-player";

export interface PageHeaderProps {
  title: string;
  /** Sub-pages: where the back arrow goes ("← Profile"). */
  back?: { href: string; label: string };
  /** Optional icon before the title (mobile band). */
  icon?: ReactNode;
  /** Content under the title, inside the maroon band on phones. */
  children?: ReactNode;
  /** Right side of the desktop title row (e.g. a segmented control). */
  desktopAside?: ReactNode;
  /** Desktop shows only the back link (the page has its own big title). */
  desktopBackOnly?: boolean;
  className?: string;
}

export function PageHeader({ title, back, icon, children, desktopAside, desktopBackOnly, className }: PageHeaderProps) {
  const player = useShellPlayer();
  const guideInHeader = guideInHeaderOn(usePathname());
  return (
    <>
      {/* Phones */}
      <header
        className={cn(
          "bg-maroon px-4 pt-[calc(14px+env(safe-area-inset-top))] pb-4 text-on-maroon desk:hidden",
          className,
        )}
      >
        <div className="flex min-h-11 items-center gap-2.5">
          {back ? (
            <Link
              href={back.href}
              aria-label={`Back to ${back.label}`}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <ArrowLeft className="size-6" aria-hidden />
            </Link>
          ) : (
            icon
          )}
          <h1 className="min-w-0 flex-1 truncate font-display text-[26px] leading-8 font-semibold">{title}</h1>
          {guideInHeader && <AskGuideButton compact />}
          <ProfileLink player={player} size={34} />
        </div>
        {children && <div className="mt-3">{children}</div>}
      </header>

      {/* Desktop */}
      <div className={cn("mx-auto hidden w-full max-w-[1360px] px-8 pt-8 desk:block", className)}>
        {back && (
          <Link
            href={back.href}
            className="type-small mb-2 inline-flex items-center gap-1 font-semibold text-maroon underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {back.label}
          </Link>
        )}
        {!desktopBackOnly && (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="type-display text-ink">{title}</h1>
            {desktopAside}
          </div>
        )}
      </div>
    </>
  );
}
