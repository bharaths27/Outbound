"use client";

// Profile: avatar with school ring, level and XP, latest stamps, squads, privacy, sign out.

import { ChevronRight, LogOut, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials, squadName } from "@/features/compete/compete";
import { buildPassport, type EarnedStamp } from "@/features/passport/build-passport";
import { Stamp } from "@/features/passport/stamp";
import { privacyLabel } from "@/features/settings/privacy-choice";
import { data } from "@/lib/data";
import type { Profile, School, SquadWithMembers, Tier } from "@/lib/data/types";
import { PageHeader } from "@/features/shell/page-header";

type Ready = {
  status: "ready";
  profile: Profile;
  school: School | null;
  latest: (EarnedStamp & { neighborhood: string; tier: Tier })[];
  stampCount: number;
  squads: SquadWithMembers[];
};
type Load = { status: "loading" } | { status: "signed-out" } | { status: "error" } | Ready;

async function loadProfile(): Promise<Load> {
  const profile = await data.getCurrentUser();
  if (!profile) return { status: "signed-out" };
  const [schools, rows, quests, stations, squads] = await Promise.all([
    data.getSchools(),
    data.getPassport(profile.id),
    data.getAllQuests(),
    data.getStations(),
    data.getMySquads(),
  ]);
  const view = buildPassport(rows, quests, stations);
  const latest = view.visited
    .flatMap((n) => n.earned.map((e) => ({ ...e, neighborhood: n.neighborhood, tier: n.tier })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);
  return {
    status: "ready",
    profile,
    school: schools.find((s) => s.id === profile.school_id) ?? null,
    latest,
    stampCount: view.totalStamps,
    squads,
  };
}

export function ProfilePage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((l) => !cancelled && setLoad(l))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await data.signOut().catch(() => {});
    router.push("/login");
  }

  return (
    <>
    <PageHeader title="Profile" />
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-6 md:px-6 desk:max-w-[1360px] desk:px-8">
      {load.status === "loading" && (
        <div className="flex flex-col gap-4" aria-busy aria-label="Loading your profile">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}
      {load.status === "error" && <p className="type-body text-muted-foreground">Your profile didn&apos;t load. Refresh to try again.</p>}
      {load.status === "signed-out" && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <h2 className="type-title">Sign in to see your profile</h2>
          <p className="type-body max-w-sm text-muted-foreground">Your level, stamps, and squads live here.</p>
          <Button asChild>
            <Link href="/login?next=/profile">Sign in</Link>
          </Button>
        </div>
      )}
      {load.status === "ready" && <ProfileView load={load} onSignOut={signOut} />}
    </div>
    </>
  );
}

function ProfileView({ load, onSignOut }: { load: Ready; onSignOut: () => void }) {
  const { profile, school, latest, stampCount, squads } = load;
  return (
    <>
      <header className="flex items-center gap-4">
        <Avatar
          size="lg"
          className="size-20 ring-3 ring-offset-2 ring-offset-background"
          // School colors appear only as small marks, like this ring (DESIGN.md).
          style={{ ["--tw-ring-color" as string]: school?.color ?? "var(--border)" }}
        >
          {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
          <AvatarFallback className="type-title">{initials(profile.display_name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="type-title truncate">{profile.display_name ?? "New player"}</h2>
          <p className="type-body text-muted-foreground">{school?.name ?? "Your school"}</p>
          {profile.is_demo && <p className="type-small text-muted-foreground">Demo account</p>}
        </div>
      </header>

      <section aria-label="Level" className="flex items-end justify-between gap-3 rounded-xl bg-muted p-4">
        <div className="flex flex-col">
          <p className="type-small text-muted-foreground">Level</p>
          <p className="type-display tabular-nums">{profile.level}</p>
        </div>
        <div className="flex flex-col items-end">
          <p className="type-heading text-xp tabular-nums">{profile.xp.toLocaleString("en-US")} XP</p>
          <p className="type-small text-muted-foreground tabular-nums">
            {profile.xp_to_next_level} XP to level {profile.level + 1}
          </p>
        </div>
      </section>

      <section aria-labelledby="stamps-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="stamps-heading" className="type-heading">
            Latest stamps <span className="type-small text-muted-foreground tabular-nums">· {stampCount} total</span>
          </h2>
          <Link href="/passport" className="type-small text-accent underline-offset-4 hover:underline">
            Your passport
          </Link>
        </div>
        {latest.length === 0 ? (
          <p className="type-body text-muted-foreground">No stamps yet. Pick a quest near you to earn your first.</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2">
            {latest.map((e) => (
              <li key={e.quest.id}>
                <Link href={`/q/${e.quest.id}`} className="flex flex-col items-center gap-1 text-center">
                  <Stamp
                    questId={e.quest.id}
                    title={e.quest.title}
                    neighborhood={e.neighborhood}
                    stationId={e.quest.station_id}
                    type={e.quest.type}
                    tier={e.tier}
                    crossSchool={e.crossSchool}
                    size={72}
                  />
                  <span className="type-tiny line-clamp-2 text-muted-foreground">{e.quest.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="squads-heading" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="squads-heading" className="type-heading">
            Your squads
          </h2>
          <Link href="/leaderboard?tab=squads" className="type-small text-accent underline-offset-4 hover:underline">
            Manage
          </Link>
        </div>
        {squads.length === 0 ? (
          <p className="type-body text-muted-foreground">Not in a squad yet. Start one from Compete.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {squads.map((s) => (
              <li key={s.id} className="type-small rounded-full border px-3 py-1.5">
                {squadName(s)} <span className="text-muted-foreground tabular-nums">· {s.members.length}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Settings" className="flex flex-col divide-y rounded-xl border">
        <Link href="/settings/privacy" className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted">
          <Shield className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="flex flex-1 flex-col">
            <span className="type-body">Privacy</span>
            <span className="type-small text-muted-foreground">{privacyLabel(profile.privacy)}</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
        </Link>
        <button type="button" onClick={onSignOut} className="flex min-h-14 items-center gap-3 px-4 py-3 text-left hover:bg-muted">
          <LogOut className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="type-body">Sign out</span>
        </button>
      </section>
    </>
  );
}
