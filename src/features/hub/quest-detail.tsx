"use client";

// Quest detail, shown inside the hub and on the full-page /q/[questId] route. The gold
// "Check in" button runs a basic check-in with a toast; the orchestrated stamp and XP
// sequence (DESIGN.md "Motion") replaces the toast in the next milestone.

import { ArrowLeft, Clock, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { data } from "@/lib/data";
import type { CheckInError, Deal, Quest, Station } from "@/lib/data/types";
import { formatSchedule } from "./hours";
import { QuestMeta, Reward, TagList } from "./quest-card";
import { lastVisit, tierIn, type Player } from "./use-player";

export interface QuestDetailProps {
  quest: Quest;
  station: Station;
  player: Player;
  now: Date;
  /** Shown as a back arrow (inside the hub). */
  onBack?: () => void;
  /** Called after a successful check-in, so the caller can reload progress. */
  onCheckedIn?: () => void;
  /** Shown as a link to the station (on the full page). */
  stationHref?: string;
}

/** Plain copy per error code: what happened, then what to do. */
export function checkInErrorCopy(e: CheckInError): string {
  switch (e.code) {
    case "TOO_FAR":
      return e.distanceM && e.radiusM
        ? `You're ${e.distanceM} m away. Get within ${e.radiusM} m of the spot to check in.`
        : "You're too far away. Get closer to the spot to check in.";
    case "ALREADY_CHECKED_IN_TODAY":
      return "You already checked in here today. Come back tomorrow for another stamp.";
    case "LOCATION_REQUIRED":
      return "We need your location to check you in. Allow location access and try again.";
    case "NOT_SIGNED_IN":
      return "Sign in to check in.";
    case "QUEST_NOT_FOUND":
      return "This quest isn't available anymore.";
    case "NOT_IN_SQUAD":
      return "You're not in that squad anymore. Check in solo or rejoin the squad.";
    default:
      return "Check-in didn't go through. Try again in a moment.";
  }
}

function currentPosition(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    ),
  );
}

export function QuestDetail({ quest, station, player, now, onBack, onCheckedIn, stationHref }: QuestDetailProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [checkingIn, setCheckingIn] = useState(false);
  const visit = lastVisit(player, quest.id);
  const tier = tierIn(player, station.neighborhood);
  const hours = formatSchedule(quest.hours);

  useEffect(() => {
    let cancelled = false;
    data
      .getDeals([quest.id])
      .then((d) => !cancelled && setDeals(d))
      .catch(() => {}); // deals are optional extras
    return () => {
      cancelled = true;
    };
  }, [quest.id]);

  async function checkIn() {
    if (!player.profile) return;
    setCheckingIn(true);
    try {
      // Demo accounts skip location; the backend decides whether to accept null.
      const location = player.profile.is_demo ? null : await currentPosition();
      const outcome = await data.checkIn(quest.id, location);
      if (outcome.ok) {
        toast.success(`Checked in. +${outcome.result.xp_awarded} XP`);
        onCheckedIn?.();
      } else {
        toast.error(checkInErrorCopy(outcome.error));
      }
    } catch {
      toast.error("Check-in didn't go through. Check your connection and try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="-ml-3 self-start">
            <ArrowLeft aria-hidden />
            All quests
          </Button>
        )}
        <h2 className="type-title">{quest.title}</h2>
        {stationHref ? (
          <Link
            href={stationHref}
            className="type-small inline-flex items-center gap-1 self-start text-accent underline-offset-4 hover:underline"
          >
            <MapPin className="size-4" strokeWidth={1.75} aria-hidden />
            {station.name} · {station.neighborhood}
          </Link>
        ) : (
          <p className="type-small inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-4" strokeWidth={1.75} aria-hidden />
            {station.neighborhood}
          </p>
        )}
        <QuestMeta quest={quest} now={now} />
      </div>

      {quest.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={quest.photo_url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
      )}

      {quest.description && <p className="type-body max-w-[70ch]">{quest.description}</p>}

      <TagList tags={quest.vibe_tags} max={6} />

      <dl className="type-small grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {hours && (
          <>
            <dt className="text-muted-foreground">Hours</dt>
            <dd className="flex items-start gap-1 tabular-nums">
              <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="flex flex-col">
                {hours.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Time</dt>
        <dd className="tabular-nums">
          About {quest.duration_min} min there, {quest.walk_min} min walk each way
        </dd>
      </dl>

      {deals.length > 0 && (
        <section aria-label="Student deals" className="flex flex-col gap-2 rounded-xl bg-muted p-3">
          {deals.map((d) => (
            <p key={d.id} className="type-small flex items-center gap-2">
              {d.is_sample && <Badge variant="outline">Sample</Badge>}
              {d.text.replace(/^SAMPLE:\s*/i, "")}
            </p>
          ))}
        </section>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <Reward xp={quest.xp} tier={tier} neighborhood={station.neighborhood} />
        {visit && (
          <p className="type-small text-muted-foreground">
            You have this stamp. Check in again on another day for more XP.
          </p>
        )}
        {player.profile ? (
          <Button variant="gold" onClick={checkIn} disabled={checkingIn} className="w-full">
            {checkingIn && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {checkingIn ? "Checking in…" : "Check in"}
          </Button>
        ) : (
          <Button variant="gold" asChild className="w-full">
            <Link href="/login">Sign in to check in</Link>
          </Button>
        )}
      </div>
    </article>
  );
}
