import { THEME_SCRIPT } from "@/features/theme/theme-script";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { StationHubHost } from "@/features/hub";
import { AppShell } from "@/features/shell/app-shell";
import "./globals.css";
import { ShellGuide } from "@/features/shell/shell-guide";

// Fraunces for display headings, DM Sans for UI (DESIGN.md §3 Type).
// Bundled from src/app/fonts (latin, variable weight, SIL OFL) so builds never
// fetch Google Fonts. Files come from @fontsource-variable/{fraunces,dm-sans} 5.3.0.
const fraunces = localFont({
  variable: "--font-fraunces",
  src: [
    { path: "./fonts/fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  display: "swap",
  fallback: ["Georgia", "serif"],
});
const dmSans = localFont({
  variable: "--font-dm-sans",
  src: [{ path: "./fonts/dm-sans-latin-wght-normal.woff2", weight: "100 1000", style: "normal" }],
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "Outbound", template: "%s · Outbound" },
  description: "Explore Boston on the T",
};

export const viewport: Viewport = {
  viewportFit: "cover", // lets the tab bar and drawer use safe-area insets
  themeColor: "#6b1f33", // maroon header
  colorScheme: "light", // light only; there is no dark theme
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables go on <html>, where the font family is applied (globals.css).
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        {/* The station hub opens over any page from ?station=<id> (src/features/hub). */}
        <StationHubHost />
        <Toaster />
        <ShellGuide />
      </body>
    </html>
  );
}
