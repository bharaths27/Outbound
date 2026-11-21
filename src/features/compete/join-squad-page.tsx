"use client";

// Where a squad invite link lands. Shows who's in the squad, then joins on one tap and
// goes to the Squads tab. Signed-out players are asked to sign in first.

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { data } from "@/lib/data";
import type { Profile, SquadWithMembers } from "@/lib/data/types";
import { normalizeCode, squadName } from "./compete";
import { SquadCard } from "./squad-card";

type Load =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; squad: SquadWithMembers; profile: Profile | null };

export function JoinSquadPage({ code }: { code: string }) {
  const clean = normalizeCode(decodeURIComponent(code));
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([data.getSquadByCode(clean), data.getCurrentUser()])
      .then(([squad, profile]) => {
        if (cancelled) return;
        setLoad(squad ? { status: "ready", squad, profile } : { status: "missing" });
      })
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [clean]);

  async function join(squad: SquadWithMembers) {
    setJoining(true);
    try {
      await data.joinSquad(squad.code);
      toast.success(`Joined ${squadName(squad)}`);
      router.push("/leaderboard?tab=squads");
    } catch {
      toast.error("Couldn't join the squad. Try again.");
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <h1 className="type-title">You&apos;re invited to a squad</h1>
      {load.status === "loading" && <Skeleton className="h-48 w-full rounded-xl" />}
      {(load.status === "missing" || load.status === "error") && (
        <div className="flex flex-col items-start gap-3">
          <p className="type-body text-muted-foreground">
            {load.status === "missing"
              ? `No squad has the code ${clean || code}. The link may be old, or the squad was emptied.`
              : "The invite didn't load. Check your connection, then try again."}
          </p>
          <Button variant="outline" asChild>
            <Link href="/leaderboard?tab=squads">Go to your squads</Link>
          </Button>
        </div>
      )}
      {load.status === "ready" &&
        (() => {
          const { squad, profile } = load;
          const member = profile && squad.members.some((m) => m.user_id === profile.id);
          return (
            <>
              <SquadCard squad={squad} myId={profile?.id}>
                {!profile ? (
                  <Button asChild>
                    <Link href={`/login?next=${encodeURIComponent(`/squad/join/${squad.code}`)}`}>Sign in to join</Link>
                  </Button>
                ) : member ? (
                  <Button asChild>
                    <Link href="/leaderboard?tab=squads">You&apos;re in this squad</Link>
                  </Button>
                ) : (
                  <Button onClick={() => join(squad)} disabled={joining}>
                    {joining && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                    Join squad
                  </Button>
                )}
              </SquadCard>
              <p className="type-small text-muted-foreground">
                Squads can mix schools. Check in at a quest together for bonus XP.
              </p>
            </>
          );
        })()}
    </div>
  );
}
