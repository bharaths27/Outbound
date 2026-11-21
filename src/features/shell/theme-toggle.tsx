"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Light / Dark / System picker. Used on /dev/theme now, and in settings later. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known on the client; render a neutral state until mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <ToggleGroup
      type="single"
      variant="chip"
      value={mounted ? theme : undefined}
      onValueChange={(v) => v && setTheme(v)}
      aria-label="Color theme"
    >
      <ToggleGroupItem value="light" aria-label="Light">
        <Sun data-icon="inline-start" /> Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" aria-label="Dark">
        <Moon data-icon="inline-start" /> Dark
      </ToggleGroupItem>
      <ToggleGroupItem value="system" aria-label="System">
        <Monitor data-icon="inline-start" /> System
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
