"use client";

// First-run onboarding (new accounts land here from /login): what Outbound is, your school
// team, then your name and who sees your visits. Every step can be skipped; nothing here is
// required to play. Returns to ?next= when done.

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PrivacyChoice } from "@/features/settings/privacy-choice";
import { data } from "@/lib/data";
import { safeNext } from "./auth";
import type { Privacy, Profile, School } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { Stamp } from "@/features/passport/stamp";
import { schoolAbbr } from "@/features/compete/compete";

type Load = { status: "loading" } | { status: "signed-out" } | { status: "ready"; profile: Profile; school: School | null };

const STEPS = 3;

export function OnboardingPage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("friends");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([data.getCurrentUser(), data.getSchools()])
      .then(([profile, schools]) => {
        if (cancelled) return;
        if (!profile) return setLoad({ status: "signed-out" });
        setName(profile.display_name ?? "");
        setPrivacy(profile.privacy);
        setLoad({ status: "ready", profile, school: schools.find((s) => s.id === profile.school_id) ?? null });
      })
      .catch(() => !cancelled && setLoad({ status: "signed-out" }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Where to go after onboarding: ?next= from the login screen, else the map.
  const done = () => router.push(safeNext(new URLSearchParams(window.location.search).get("next")));

  async function finish() {
    if (load.status !== "ready") return;
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== load.profile.display_name) await data.updateDisplayName(trimmed);
      if (privacy !== load.profile.privacy) await data.updatePrivacy(privacy);
      done();
    } catch {
      toast.error("Couldn't save that. You can change it later in your profile.");
      setSaving(false);
    }
  }

  const skip = (
    <Button variant="ghost" onClick={done} className="min-h-11 px-2 text-[15px] font-bold text-maroon">
      Skip
    </Button>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 bg-page px-6 pt-3.5 pb-6 desk:max-w-[520px] desk:justify-center desk:py-14">
      {load.status === "loading" && <Skeleton className="h-64 w-full rounded-xl" />}
      {load.status === "signed-out" && (
        <div className="flex flex-col items-start gap-3">
          <h1 className="type-title">Sign in first</h1>
          <Button asChild>
            <Link href="/login?next=/onboarding">Sign in</Link>
          </Button>
        </div>
      )}
      {load.status === "ready" && (
        <>
          <div className="flex items-center justify-between">
            <ol className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS}`}>
              {Array.from({ length: STEPS }, (_, i) => (
                <li
                  key={i}
                  className={cn("h-2 rounded-full transition-all", i === step ? "w-6 bg-maroon" : "w-2 bg-stamp-dot-off")}
                />
              ))}
            </ol>
            {step < STEPS - 1 && skip}
          </div>

          {step === 0 && (
            <section className="flex flex-1 flex-col justify-center gap-[22px]">
              <div aria-hidden className="relative flex h-[220px] items-center justify-center gap-1 overflow-hidden rounded-[28px] bg-maroon">
                <Stamp questId="ob-1" title="Chinatown" neighborhood="Chinatown" stationId="place-chncl" tier="silver" size={92} rotate={-10} className="translate-y-3 rounded-full bg-page" />
                <Stamp questId="ob-2" title="Back Bay" neighborhood="Back Bay" stationId="place-coecl" tier="gold" size={120} rotate={4} className="z-10 rounded-full bg-page" />
                <Stamp questId="ob-3" title="North End" neighborhood="North End" stationId="place-haecl" tier="bronze" size={92} rotate={9} className="translate-y-4 rounded-full bg-page" />
              </div>
              <div>
                <h1 className="font-display text-[32px] leading-[1.1] font-bold text-maroon">Every stop is a quest</h1>
                <ol className="mt-3.5 flex flex-col gap-2.5 text-[15px] leading-[1.45] text-ink-2">
                  {[
                    "Tap any station on the map to see food, events and views a short walk away.",
                    "Filter by what you’re craving, your budget and the time you have.",
                    "Check in at the spot for XP and a passport stamp. Collect more to go from Bronze to Gold.",
                  ].map((t, i) => (
                    <li key={i} className="flex gap-2.5">
                      <b className="text-maroon">{i + 1}</b>
                      {t}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="flex flex-1 flex-col justify-center gap-[22px]">
              <div
                className="flex h-[220px] flex-col items-center justify-center gap-2.5 rounded-[28px] bg-maroon text-white"
                style={load.school?.color ? { backgroundColor: load.school.color } : undefined}
              >
                <span aria-hidden className="flex size-[88px] items-center justify-center rounded-full border-4 border-white/90 text-[28px] font-bold">
                  {load.school ? schoolAbbr(load.school.name) : "?"}
                </span>
                <p className="font-display text-[22px] font-semibold">{load.school?.name ?? "Your school"}</p>
              </div>
              <div>
                <h1 className="font-display text-[32px] leading-[1.1] font-bold text-maroon">
                  You play for {load.school ? schoolAbbr(load.school.name) : "your school"}
                </h1>
                <p className="mt-3 text-[15px] leading-normal text-ink-2">
                  Every check-in adds XP to your school’s weekly total. Schools need 5 active players to rank, and the
                  leaderboard resets every Monday.
                </p>
                <p className="mt-2.5 text-[15px] leading-normal text-ink-2">
                  Squads can mix schools. Check in together for +20% XP, or double XP if a squad-mate from another school checks in at the same quest within an hour.
                </p>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-1 flex-col gap-6">
              <h1 className="font-display text-[32px] leading-[1.1] font-bold text-maroon">Make it yours</h1>
              <div className="flex flex-col gap-2">
                <label htmlFor="display-name" className="text-sm font-bold">
                  Display name
                </label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name or a nickname"
                  maxLength={40}
                  autoComplete="nickname"
                  className="h-[50px] text-base"
                />
              </div>
              <PrivacyChoice value={privacy} onChange={setPrivacy} />
            </section>
          )}

          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" className="h-[52px] rounded-2xl px-6 text-base font-bold" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < STEPS - 1 ? (
              <Button className="h-[52px] flex-1 rounded-2xl text-base font-bold" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="gold" className="h-[52px] flex-1 rounded-2xl text-base font-bold" onClick={finish} disabled={saving}>
                {saving && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
                Start exploring
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
