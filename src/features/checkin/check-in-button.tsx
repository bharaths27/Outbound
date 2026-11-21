"use client";

// The gold "Check in" button and everything after it (DESIGN.md §8; reference check-in*.html).
// Steps appear only when they apply: a closed-hours check, options (event code and/or "Who
// are you with?"), finding the player, sending check_in(), then the celebration or an error
// with next steps. Phones: bottom sheets, and a full-screen maroon celebration. Desktop:
// 480 px dialogs, and a 520 px maroon dialog for the celebration. Signed-out players get
// "Sign in to check in" instead.

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isCrossSchool, squadName } from "@/features/compete/compete";
import { openState } from "@/features/hub/hours";
import { notifyPlayerChanged } from "@/features/shell/use-shell-player";
import { data } from "@/lib/data";
import type { Profile, Quest, SquadWithMembers, Tier } from "@/lib/data/types";
import { cn } from "@/lib/utils";
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

// Bottom sheet on phones, centered dialog from 1024 px.
const SHEET =
  "max-desk:top-auto max-desk:bottom-0 max-desk:left-0 max-desk:max-w-none max-desk:translate-x-0 max-desk:translate-y-0 max-desk:rounded-t-[26px] max-desk:rounded-b-none max-desk:px-5 max-desk:pt-3 max-desk:pb-[calc(28px+env(safe-area-inset-bottom))] max-desk:data-open:slide-in-from-bottom-10 bg-background desk:max-w-[480px]";
const CELEBRATION =
  "max-desk:inset-0 max-desk:top-0 max-desk:left-0 max-desk:h-dvh max-desk:max-w-none max-desk:translate-x-0 max-desk:translate-y-0 max-desk:overflow-y-auto max-desk:rounded-none bg-maroon px-6 pt-4 pb-[calc(28px+env(safe-area-inset-bottom))] text-on-maroon desk:max-w-[520px] desk:px-8";

function SheetTitle({ children }: { children: ReactNode }) {
  return <DialogTitle className="pr-10 font-display text-2xl leading-8 font-semibold">{children}</DialogTitle>;
}

function Body({ children }: { children: ReactNode }) {
  return <DialogDescription className="mt-1.5 text-[15px] leading-[1.5] text-muted-2">{children}</DialogDescription>;
}

/** Pulsing location mark (finding you) or a spinner (checking you in). */
function Working({ locating }: { locating: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center" aria-busy>
      <span className="relative flex size-16 items-center justify-center rounded-full bg-gold text-gold-foreground">
        {locating && <span className="absolute inset-0 animate-ping rounded-full bg-gold opacity-60 motion-reduce:hidden" />}
        {locating ? (
          <MapPin className="relative size-7" strokeWidth={2.2} aria-hidden />
        ) : (
          <svg className="size-7 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M12 3a9 9 0 1 1-9 9" />
          </svg>
        )}
      </span>
      <SheetTitle>{locating ? "Finding you…" : "Checking you in…"}</SheetTitle>
      <DialogDescription className="max-w-[300px] text-sm leading-[1.5] text-muted-2">
        {locating ? "Your location is checked once, for this check-in, and never shared." : "Hang tight. This takes a second."}
      </DialogDescription>
    </div>
  );
}

const SOLO = "solo";

/** Event code and "Who are you with?" radio cards, before sending (DESIGN.md §8.2). */
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
  const needsCode = quest.requires_qr;
  const options = [
    { id: SOLO, label: "Just me", note: "", cross: false },
    ...squads.map((s) => ({
      id: s.id,
      label: squadName(s),
      cross: isCrossSchool(s),
      note: isCrossSchool(s)
        ? "+20%, or double XP if a squad-mate from another school checks in within an hour"
        : "+20% squad bonus",
    })),
  ];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (needsCode && !code.trim()) return;
    // Codes are printed in capitals; check_in() compares them exactly.
    onSubmit({ squadId: squad === SOLO ? undefined : squad, qr: needsCode ? code.trim().toUpperCase() : undefined });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <SheetTitle>Check in at {quest.title}</SheetTitle>
        <DialogDescription className="sr-only">Choose who you&apos;re with{needsCode ? " and enter the event code" : ""}.</DialogDescription>
      </div>

      {needsCode && (
        <div>
          <label htmlFor="checkin-code" className="block text-sm font-bold">
            Event code
          </label>
          <p id="checkin-code-help" className="mt-1.5 text-[13px] text-muted-foreground">
            Find it on the sign or the table at the spot.
          </p>
          <Input
            id="checkin-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
            aria-describedby="checkin-code-help"
            className="mt-2 uppercase placeholder:normal-case"
            placeholder="Code at the spot"
          />
        </div>
      )}

      {squads.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Who are you with?</legend>
          <div role="radiogroup" aria-label="Who are you with?" className="flex flex-col gap-2">
            {options.map((o) => {
              const on = squad === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSquad(o.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl bg-surface px-3.5 py-3 text-left",
                    on ? "border-2 border-maroon" : "border border-border-strong",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                      on ? "border-maroon" : "border-border-strong",
                    )}
                  >
                    {on && <span className="size-2.5 rounded-full bg-maroon" />}
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
                      {o.label}
                      {o.cross && (
                        <span className="rounded-full bg-xp-chip px-2 py-0.5 text-[11px] font-bold text-xp-chip-ink">Cross-school</span>
                      )}
                    </span>
                    {o.note && <span className="text-[13px] text-muted-foreground">{o.note}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-2.5">
        <Button type="submit" variant="gold" size="xl" disabled={needsCode && !code.trim()}>
          Check in
        </Button>
        <Button type="button" variant="outline" size="xl" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </form>
  );
}

export function CheckInButton({ quest, profile, tier, now, onCheckedIn }: CheckInButtonProps) {
  const [squads, setSquads] = useState<SquadWithMembers[]>([]);
  const [chosenSquad, setChosenSquad] = useState<string | undefined>(undefined);
  const needsOptions = squads.length > 0 || quest.requires_qr;
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

  useEffect(() => {
    if (state.step === "success") notifyPlayerChanged(); // the header's XP pill
  }, [state.step]);

  const signInHref = `/login?next=${encodeURIComponent(`/q/${quest.id}`)}`;

  if (!profile) {
    return (
      <Button variant="gold" size="xl" asChild className="w-full">
        <Link href={signInHref}>Sign in to check in</Link>
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
    const variant = primary ? "gold" : "outline";
    switch (step) {
      case "retry":
        return (
          <Button key={step} variant={variant} size="xl" onClick={retry}>
            Try again
          </Button>
        );
      case "directions":
        return (
          <Button key={step} variant={variant} size="xl" asChild>
            <a href={directionsUrl(quest.lat, quest.lon)} target="_blank" rel="noreferrer">
              <MapPin aria-hidden />
              Directions
            </a>
          </Button>
        );
      case "passport":
        return (
          <Button key={step} variant={variant} size="xl" asChild>
            <Link href="/passport" onClick={close}>
              See your passport
            </Link>
          </Button>
        );
      case "signin":
        return (
          <Button key={step} variant={variant} size="xl" asChild>
            <Link href={signInHref}>Sign in</Link>
          </Button>
        );
      case "close":
        return (
          <Button key={step} variant={variant} size="xl" onClick={close}>
            Done
          </Button>
        );
    }
  };

  const squadLabel = chosenSquad ? squads.find((s) => s.id === chosenSquad) : undefined;

  return (
    <>
      <Button
        variant="gold"
        size="xl"
        className="w-full"
        disabled={busy}
        onClick={() => {
          const open = openState(quest.hours, now);
          start(open && !open.open ? open.label : null);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
          <path d="M9.5 10l2 2 3.5-3.5" />
        </svg>
        Check in
      </Button>

      <Dialog open={state.step !== "idle"} onOpenChange={(o) => !o && close()}>
        <DialogContent
          showCloseButton={!busy && state.step !== "success"}
          className={state.step === "success" ? CELEBRATION : SHEET}
          onInteractOutside={(e) => busy && e.preventDefault()}
        >
          {state.step === "closed" && (
            <div className="flex flex-col gap-4">
              <div>
                <SheetTitle>Looks closed right now</SheetTitle>
                <Body>
                  <b className="text-closed">{state.label}.</b> If you&apos;re at the spot anyway, you can still check in.
                </Body>
              </div>
              <div className="flex flex-col gap-2.5">
                <Button variant="gold" size="xl" onClick={confirm}>
                  Check in anyway
                </Button>
                <Button variant="outline" size="xl" onClick={close}>
                  Not now
                </Button>
              </div>
            </div>
          )}

          {state.step === "options" && (
            <OptionsStep
              quest={quest}
              squads={squads}
              onSubmit={(opts) => {
                setChosenSquad(opts.squadId);
                submitOptions(opts);
              }}
              onCancel={close}
            />
          )}

          {(state.step === "locating" || state.step === "sending") && <Working locating={state.step === "locating"} />}

          {state.step === "success" && (
            <>
              <DialogDescription className="sr-only">{quest.title}</DialogDescription>
              <Celebration
                quest={quest}
                result={state.result}
                prevTier={tier}
                squadName={squadLabel ? squadName(squadLabel) : undefined}
                renderTitle={(text) => (
                  <DialogTitle className="font-display text-[32px] leading-[1.15] font-bold">{text}</DialogTitle>
                )}
                actions={
                  <>
                    <Button variant="gold" size="xl" asChild className="desk:flex-1">
                      <Link href="/passport" onClick={close}>
                        See your passport
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="xl"
                      onClick={close}
                      className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white desk:flex-1"
                    >
                      Done
                    </Button>
                  </>
                }
              />
            </>
          )}

          {state.step === "error" &&
            (() => {
              const copy = errorCopy(state.error);
              return (
                <div className="flex flex-col gap-4">
                  <div>
                    <SheetTitle>{copy.title}</SheetTitle>
                    <Body>{copy.body}</Body>
                  </div>
                  <div className="flex flex-col gap-2.5">{copy.steps.map((s, i) => stepButton(s, i === 0))}</div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
