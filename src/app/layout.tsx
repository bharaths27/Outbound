import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { StationHubHost } from "@/features/hub";
import { AppShell } from "@/features/shell/app-shell";
import { ThemeProvider } from "@/features/shell/theme-provider";
import "./globals.css";

// Archivo variable font with the width axis (DESIGN.md: wide, heavy station-sign titles).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Outbound", template: "%s · Outbound" },
  description: "Explore Boston on the T",
};

export const viewport: Viewport = {
  viewportFit: "cover", // lets the tab bar and drawer use safe-area insets
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" }, // --background (light)
    { media: "(prefers-color-scheme: dark)", color: "#1c1f30" }, // --background (dark)
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variable goes on <html>, where the font family is applied (globals.css).
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
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
