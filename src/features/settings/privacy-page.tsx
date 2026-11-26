"use client";

// Privacy settings: who can see my visits (including ghost mode), and hiding single
// visits. Changes save as you make them.

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { data } from "@/lib/data";
import type { Privacy, Profile, Quest, Visit } from "@/lib/data/types";
import { PrivacyChoice } from "./privacy-choice";
import { PageHeader } from "@/features/shell/page-header";

type Load =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "error" }
  | { status: "ready"; profile: Profile; visits: Visit[]; quests: Map<string, Quest> };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export function PrivacyPage() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await data.getCurrentUser();
      if (!profile) return { status: "signed-out" } as const;
      const [visits, quests] = await Promise.all([data.getVisits(profile.id), data.getAllQuests()]);
      return {
        status: "ready",
        profile,
        visits: [...visits].sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at)),
        quests: new Map(quests.map((q) => [q.id, q])),
      } as const;
    })()
      .then((l) => !cancelled && setLoad(l))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function changePrivacy(p: Privacy) {
    if (load.status !== "ready") return;
    const before = load.profile;
    setLoad({ ...load, profile: { ...before, privacy: p } });
    setSaving(true);
    try {
      await data.updatePrivacy(p);
      toast.success("Saved");
    } catch {
      setLoad((l) => (l.status === "ready" ? { ...l, profile: before } : l));
      toast.error("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function setHidden(visit: Visit, hidden: boolean) {
    const patch = (h: boolean) =>
      setLoad((l) => (l.status === "ready" ? { ...l, visits: l.visits.map((v) => (v.id === visit.id ? { ...v, hidden: h } : v)) } : l));
    patch(hidden);
    try {
      await data.setVisitHidden(visit.id, hidden);
    } catch {
      patch(!hidden);
      toast.error("Couldn't change that visit. Try again.");
    }
  }

  return (
    <>
    <PageHeader title="Privacy" back={{ href: "/profile", label: "Profile" }} />
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6 md:px-6 desk:px-8">

      {load.status === "loading" && <Skeleton className="h-72 w-full rounded-xl" />}
      {load.status === "error" && <p className="type-body text-muted-foreground">Your settings didn&apos;t load. Refresh to try again.</p>}
      {load.status === "signed-out" && (
        <Button asChild className="self-start">
          <Link href="/login?next=/settings/privacy">Sign in</Link>
        </Button>
      )}
      {load.status === "ready" && (
        <>
          <PrivacyChoice value={load.profile.privacy} onChange={changePrivacy} disabled={saving} />

          <section aria-labelledby="visits-heading" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="visits-heading" className="type-heading">
                Hide single visits
              </h2>
              <p className="type-small text-muted-foreground">
                Hidden visits stay in your passport but nobody else sees them.
              </p>
            </div>
            {load.visits.length === 0 ? (
              <p className="type-body text-muted-foreground">No visits yet.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-xl border">
                {load.visits.map((v) => {
                  const q = load.quests.get(v.quest_id);
                  const id = `hide-${v.id}`;
                  return (
                    <li key={v.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                      <label htmlFor={id} className="flex min-w-0 flex-col">
                        <span className="type-body truncate">{q?.title ?? "A quest that was removed"}</span>
                        <span className="type-small text-muted-foreground tabular-nums">
                          {dateFormat.format(new Date(v.checked_in_at))}
                          {v.hidden && " · Hidden"}
                        </span>
                      </label>
                      <Switch id={id} checked={v.hidden} onCheckedChange={(h) => setHidden(v, h)} aria-label="Hide this visit" />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
    </>
  );
}
