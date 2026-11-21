"use client";

// First-run onboarding: what Outbound is, your school team, then your name and who sees
// your visits. Every step can be skipped; nothing here is required to play.

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
import type { Privacy, Profile, School } from "@/lib/data/types";
import { cn } from "@/lib/utils";

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

  async function finish() {
    if (load.status !== "ready") return;
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== load.profile.display_name) await data.updateDisplayName(trimmed);
      if (privacy !== load.profile.privacy) await data.updatePrivacy(privacy);
      router.push("/");
    } catch {
      toast.error("Couldn't save that. You can change it later in your profile.");
      setSaving(false);
    }
  }

  const skip = (
    <Button variant="ghost" asChild>
      <Link href="/">Skip</Link>
    </Button>
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 py-10">
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
                <li key={i} className={cn("h-1.5 w-8 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
              ))}
            </ol>
            {step < STEPS - 1 && skip}
          </div>

          {step === 0 && (
            <section className="flex flex-1 flex-col gap-4">
              <h1 className="type-display">Every stop is a quest</h1>
              <ul className="type-body flex flex-col gap-3 text-muted-foreground">
                <li>Tap a station on the map to see food, events, and views a short walk away.</li>
                <li>Filter by what you&apos;re craving, your budget, and how much time you have.</li>
                <li>Check in at the spot to earn XP and a stamp. Collect enough in a neighborhood to go from Bronze to Gold.</li>
              </ul>
            </section>
          )}

          {step === 1 && (
            <section className="flex flex-1 flex-col gap-4">
              <h1 className="type-display">You play for {load.school?.name ?? "your school"}</h1>
              <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full bg-muted-foreground"
                  style={load.school?.color ? { backgroundColor: load.school.color } : undefined}
                />
                <p className="type-body">
                  Your XP counts toward your school&apos;s weekly total. Schools need 5 active players to rank, and the
                  board resets every Monday.
                </p>
              </div>
              <p className="type-body text-muted-foreground">
                Squads can mix schools. Checking in together earns bonus XP, and a squad from different schools earns
                double.
              </p>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-1 flex-col gap-6">
              <h1 className="type-display">Make it yours</h1>
              <div className="flex flex-col gap-2">
                <label htmlFor="display-name" className="type-heading">
                  Your name on Outbound
                </label>
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name or a nickname"
                  maxLength={40}
                  autoComplete="nickname"
                  className="h-11"
                />
              </div>
              <PrivacyChoice value={privacy} onChange={setPrivacy} />
            </section>
          )}

          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < STEPS - 1 ? (
              <Button className="flex-1" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button className="flex-1" onClick={finish} disabled={saving}>
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
