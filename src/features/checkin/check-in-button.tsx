"use client";

// The gold "Check in" button and everything after it, in one dialog: a closed-hours
// check, a squad pick and/or event code when they matter, finding the player, sending
// check_in(), then the celebration or an error with a next step. Signed-out players get
// "Sign in to check in" instead.

import { Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isCrossSchool, squadName } from "@/features/compete/compete";
import { openState } from "@/features/hub/hours";
import { data } from "@/lib/data";
import type { Profile, Quest, SquadWithMembers, Tier } from "@/lib/data/types";
import { Celebration } from "./celebration";
import { directionsUrl, errorCopy, type NextStep } from "./errors";
import { useCheckIn, type CheckInOptions } from "./use-check-in";

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

const SOLO = "solo";

/** Squad pick and event code, before sending. */
function OptionsStep({
  quest,
  squads,
  onSubmit,
  onCancel,
}: {
  quest: Quest;
  squads: SquadWithMembers[];
  onSubmit: (opts: CheckInOptions) => void;
  onCancel: () => void;
}) {
  const [squad, setSquad] = useState(SOLO);
  const [code, setCode] = useState("");
  const needsCode = quest.qr_code !== null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (needsCode && !code.trim()) return;
    // Codes are printed in capitals; check_in() compares them exactly.
    onSubmit({ squadId: squad === SOLO ? undefined : squad, qr: needsCode ? code.trim().toUpperCase() : undefined });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <DialogTitle className="type-title">Check in</DialogTitle>
        <DialogDescription className="type-body text-muted-foreground">{quest.title}</DialogDescription>
      </div>

      {needsCode && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="checkin-code" className="type-heading">
            Event code
          </label>
          <p className="type-small text-muted-foreground">Find it on the sign or the table at the spot.</p>
          <Input
            id="checkin-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            className="h-11 uppercase placeholder:normal-case"
            placeholder="Code at the spot"
          />
        </div>
      )}

      {squads.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="type-heading mb-1">Who are you with?</legend>
          <RadioGroup value={squad} onValueChange={setSquad} className="gap-2">
            {[{ id: SOLO, label: "Just me", note: "" }, ...squads.map((s) => ({
              id: s.id,
              label: squadName(s),
              note: isCrossSchool(s) ? "+20%, or double XP if a squad-mate from another school checks in within an hour" : "+20% squad bonus",
            }))].map((o) => (
              <label
                key={o.id}
                htmlFor={`squad-${o.id}`}
                className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 has-data-checked:border-primary has-data-checked:bg-muted/60"
              >
                <RadioGroupItem id={`squad-${o.id}`} value={o.id} className="mt-1" />
                <span className="flex flex-col gap-0.5">
                  <span className="type-body font-medium">{o.label}</span>
                  {o.note && <span className="type-small text-muted-foreground">{o.note}</span>}
                </span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="gold" disabled={needsCode && !code.trim()}>
          Check in
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </form>
  );
}

export function CheckInButton({ quest, profile, tier, now, onCheckedIn }: CheckInButtonProps) {
  const [squads, setSquads] = useState<SquadWithMembers[]>([]);
  const needsOptions = squads.length > 0 || quest.qr_code !== null;
  const { state, start, confirm, submitOptions, retry, reset } = useCheckIn(quest, profile, needsOptions);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    data
      .getMySquads()
      .then((s) => !cancelled && setSquads(s))
      .catch(() => {}); // squads are optional here; solo check-in still works
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (!profile) {
    return (
      <Button variant="gold" asChild className="w-full">
        <Link href={`/login?next=${encodeURIComponent(`/q/${quest.id}`)}`}>Sign in to check in</Link>
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
            <Link href={`/login?next=${encodeURIComponent(`/q/${quest.id}`)}`}>Sign in</Link>
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

          {state.step === "options" && (
            <OptionsStep quest={quest} squads={squads} onSubmit={submitOptions} onCancel={close} />
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
