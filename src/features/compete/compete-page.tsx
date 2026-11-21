"use client";

// Compete (/leaderboard): Schools and Squads tabs. Tournaments are out of scope.
// /leaderboard?tab=squads opens the Squads tab (the join page sends players there).

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { data } from "@/lib/data";
import type { Profile } from "@/lib/data/types";
import { SchoolsTab } from "./schools-tab";
import { SquadsTab } from "./squads-tab";

export function CompetePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <h1 className="type-display">Compete</h1>
      <Suspense fallback={null}>
        <CompeteTabs />
      </Suspense>
    </div>
  );
}

function CompeteTabs() {
  const initial = useSearchParams().get("tab") === "squads" ? "squads" : "schools";
  const [tab, setTab] = useState(initial);
  // undefined while loading; null when signed out
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    data
      .getCurrentUser()
      .then((p) => !cancelled && setProfile(p))
      .catch(() => !cancelled && setProfile(null));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <TabsList>
        <TabsTrigger value="schools">Schools</TabsTrigger>
        <TabsTrigger value="squads">Squads</TabsTrigger>
      </TabsList>
      <TabsContent value="schools">
        {profile !== undefined && <SchoolsTab mySchoolId={profile?.school_id ?? null} />}
      </TabsContent>
      <TabsContent value="squads">
        {profile === null && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="type-heading">Sign in to make a squad</p>
            <p className="type-body max-w-sm text-muted-foreground">
              Squads can mix schools. Check in together for bonus XP.
            </p>
            <Button asChild>
              <Link href="/login?next=/leaderboard?tab=squads">Sign in</Link>
            </Button>
          </div>
        )}
        {profile && <SquadsTab myId={profile.id} />}
      </TabsContent>
    </Tabs>
  );
}
