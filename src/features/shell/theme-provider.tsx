"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Light only for now: dark mode isn't designed yet (DESIGN.md §12). The class-based
 * plumbing stays so a dark theme can be switched on later by removing `forcedTheme`.
 */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" forcedTheme="light" defaultTheme="light" disableTransitionOnChange {...props} />
  );
}
