"use client";

// The signed-in player for the shell's XP pill and avatar. Refreshes on navigation and when
// anything announces a change (a check-in, sign-in, or profile edit) via notifyPlayerChanged().

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { data } from "@/lib/data";
import type { Profile, School } from "@/lib/data/types";

const EVENT = "outbound:player-changed";

/** Call after anything that changes the player's XP, name, or session. */
export function notifyPlayerChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export interface ShellPlayer {
  profile: Profile;
  school: School | null;
}

/** undefined while loading, null when signed out. */
export function useShellPlayer(): ShellPlayer | null | undefined {
  const pathname = usePathname();
  const [player, setPlayer] = useState<ShellPlayer | null | undefined>(undefined);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, bump);
    return () => window.removeEventListener(EVENT, bump);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await data.getCurrentUser();
      if (!profile) return null;
      const schools = await data.getSchools();
      return { profile, school: schools.find((s) => s.id === profile.school_id) ?? null };
    })()
      .then((p) => !cancelled && setPlayer(p))
      .catch(() => !cancelled && setPlayer(null));
    return () => {
      cancelled = true;
    };
  }, [pathname, version]);

  return player;
}
