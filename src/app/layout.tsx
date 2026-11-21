import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { StationHubHost } from "@/features/hub";
import { AppShell } from "@/features/shell/app-shell";
import { ThemeProvider } from "@/features/shell/theme-provider";
import "./globals.css";

// Fraunces for display headings, DM Sans for UI (DESIGN.md §3 Type).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Outbound", template: "%s · Outbound" },
  description: "Explore Boston on the T",
};

export const viewport: Viewport = {
  viewportFit: "cover", // lets the tab bar and drawer use safe-area insets
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6b1f33" }, // maroon header (light only for now)
    { media: "(prefers-color-scheme: dark)", color: "#6b1f33" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables go on <html>, where the font family is applied (globals.css).
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          {/* The station hub opens over any page from ?station=<id> (src/features/hub). */}
          <StationHubHost />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
