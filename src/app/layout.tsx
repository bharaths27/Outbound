import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { StationHubHost } from "@/features/hub";
import { AppShell } from "@/features/shell/app-shell";
import "./globals.css";
import GrokGuide from "@/components/guide/GrokGuide";

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
  themeColor: "#6b1f33", // maroon header
  colorScheme: "light", // light only; there is no dark theme
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Font variables go on <html>, where the font family is applied (globals.css).
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
        {/* The station hub opens over any page from ?station=<id> (src/features/hub). */}
        <StationHubHost />
        <Toaster />
        <GrokGuide />
      </body>
    </html>
  );
}
