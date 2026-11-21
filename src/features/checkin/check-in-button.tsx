"use client";

// The gold "Check in" button and everything after it, in one dialog: a closed-hours
// check, finding the player, sending check_in(), then the celebration or an error with a
// next step. Signed-out players get "Sign in to check in" instead.

import { Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { openState } from "@/features/hub/hours";
import type { Profile, Quest, Tier } from "@/lib/data/types";
import { Celebration } from "./celebration";
import { directionsUrl, errorCopy, type NextStep } from "./errors";
import { useCheckIn } from "./use-check-in";

export interface CheckInButtonProps {
  quest: Quest;
  profile: Profile | null;
  /** The player's tier in the quest's neighborhood right now (null if none yet). */
  tier: Tier | null;
  now: Date;
  /** Called when the dialog closes after a successful check-in. */
  onCheckedIn?: () => void;
}

function Working({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" aria-busy>
      <Loader2 className="size-8 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
      <DialogTitle className="type-heading">{title}</DialogTitle>
      <DialogDescription className={body ? "type-small text-muted-foreground" : "sr-only"}>
        {body ?? title}
      </DialogDescription>
    </div>
  );
}

export function CheckInButton({ quest, profile, tier, now, onCheckedIn }: CheckInButtonProps) {
  const { state, start, confirm, retry, reset } = useCheckIn(quest, profile);

  if (!profile) {
    return (
      <Button variant="gold" asChild className="w-full">
        <Link href="/login">Sign in to check in</Link>
      </Button>
    );
  }

  const busy = state.step === "locating" || state.step === "sending";
  const close = () => {
    const succeeded = state.step === "success";
    reset();
    if (succeeded) onCheckedIn?.();
  };

  const stepButton = (step: NextStep, primary: boolean) => {
    const variant = primary ? "default" : "outline";
    switch (step) {
      case "retry":
        return (
          <Button key={step} variant={variant} onClick={retry}>
            Try again
          </Button>
        );
      case "directions":
        return (
          <Button key={step} variant={variant} asChild>
            <a href={directionsUrl(quest.lat, quest.lon)} target="_blank" rel="noreferrer">
              <MapPin aria-hidden />
              Directions
            </a>
          </Button>
        );
      case "passport":
        return (
          <Button key={step} variant={variant} asChild>
            <Link href="/passport" onClick={close}>
              See your passport
            </Link>
          </Button>
        );
      case "signin":
        return (
          <Button key={step} variant={variant} asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        );
      case "close":
        return (
          <Button key={step} variant={variant} onClick={close}>
            {primary ? "Done" : "Close"}
          </Button>
        );
    }
  };

  return (
    <>
      <Button
        variant="gold"
        className="w-full"
        disabled={busy}
        onClick={() => {
          const open = openState(quest.hours, now);
          start(open && !open.open ? open.label : null);
        }}
      >
        Check in
      </Button>

      <Dialog open={state.step !== "idle"} onOpenChange={(o) => !o && close()}>
        <DialogContent showCloseButton={!busy} className="max-w-sm" onInteractOutside={(e) => busy && e.preventDefault()}>
          {state.step === "closed" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <DialogTitle className="type-title">Looks closed right now</DialogTitle>
                <DialogDescription className="type-body text-muted-foreground">
                  {state.label}. If you&apos;re at the spot anyway, you can still check in.
                </DialogDescription>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="gold" onClick={confirm}>
                  Check in anyway
                </Button>
                <Button variant="ghost" onClick={close}>
                  Not now
                </Button>
              </div>
            </div>
          )}

          {state.step === "locating" && (
            <Working title="Finding you…" body="Your location is checked once, for this check-in, and never shared." />
          )}
          {state.step === "sending" && <Working title="Checking you in…" />}

          {state.step === "success" && (
            <div className="flex flex-col gap-5">
              <DialogTitle className="sr-only">Checked in</DialogTitle>
              <DialogDescription className="sr-only">{quest.title}</DialogDescription>
              <Celebration quest={quest} result={state.result} prevTier={tier} />
              <div className="flex flex-col gap-2">
                <Button onClick={close}>Done</Button>
                <Button variant="outline" asChild>
                  <Link href="/passport" onClick={close}>
                    See your passport
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {state.step === "error" &&
            (() => {
              const copy = errorCopy(state.error);
              return (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <DialogTitle className="type-title">{copy.title}</DialogTitle>
                    <DialogDescription className="type-body text-muted-foreground">{copy.body}</DialogDescription>
                  </div>
                  <div className="flex flex-col gap-2">{copy.steps.map((s, i) => stepButton(s, i === 0))}</div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
