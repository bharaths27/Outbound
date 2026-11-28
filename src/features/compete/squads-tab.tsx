"use client";

// The player's squads: create one, join with a code, copy invite links, leave (with a
// confirm). Squads can mix schools; checking in together earns the squad and
// cross-school bonuses (computed by check_in()).

import { Loader2, Plus, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { data } from "@/lib/data";
import type { SquadWithMembers } from "@/lib/data/types";
import { normalizeCode, squadName } from "./compete";
import { SquadCard, copyInvite } from "./squad-card";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; squads: SquadWithMembers[] };

export function SquadsTab({ myId }: { myId: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState<SquadWithMembers | null>(null);

  useEffect(() => {
    let cancelled = false;
    data
      .getMySquads()
      .then((squads) => !cancelled && setLoad({ status: "ready", squads }))
      .catch(() => !cancelled && setLoad({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const squads = load.status === "ready" ? load.squads : [];

  async function leave(squad: SquadWithMembers) {
    try {
      await data.leaveSquad(squad.id);
      toast.success(`Left ${squadName(squad)}`);
      reload();
    } catch {
      toast.error("Couldn't leave the squad. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 md:grid-cols-2">
        <CreateSquad
          onCreated={(s) => {
            reload();
            void copyInvite(s.code);
          }}
        />
        <JoinSquad
          onJoined={reload}
          isMember={(code) => squads.some((s) => s.code === code)}
        />
      </div>

      <section aria-label="Your squads" className="flex flex-col gap-3">
        <h2 className="type-title">Your squads</h2>
        {load.status === "loading" &&
          [0, 1].map((i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}
        {load.status === "error" && (
          <div className="flex flex-col items-start gap-2">
            <p className="type-body text-muted-foreground">Your squads didn&apos;t load.</p>
            <Button
              variant="outline"
              onClick={() => {
                setLoad({ status: "loading" });
                reload();
              }}
            >
              Try again
            </Button>
          </div>
        )}
        {load.status === "ready" && squads.length === 0 && (
          <p className="type-body text-muted-foreground">
            No squads yet. Start one and send the link to friends, from any school.
          </p>
        )}
        {squads.length > 0 && (
          <div className="grid grid-cols-1 gap-3 desk:grid-cols-2">
            {squads.map((s) => (
              <SquadCard key={s.id} squad={s} myId={myId} onLeave={() => setLeaving(s)} />
            ))}
          </div>
        )}
      </section>

      <AlertDialog open={leaving !== null} onOpenChange={(o) => !o && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {leaving ? squadName(leaving) : "this squad"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your stamps and XP stay. You can rejoin later with the code{leaving ? ` ${leaving.code}` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (leaving) void leave(leaving);
                setLeaving(null);
              }}
            >
              Leave squad
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateSquad({ onCreated }: { onCreated: (squad: SquadWithMembers) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const squad = await data.createSquad(name.trim());
      setName("");
      onCreated(squad);
    } catch {
      toast.error("Couldn't create the squad. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-muted p-4">
      <label htmlFor="squad-name" className="type-heading">
        Start a squad
      </label>
      <p className="type-small text-muted-foreground">Name it, then send the invite link.</p>
      <div className="flex gap-2">
        <Input
          id="squad-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Late-night dumpling crew"
          maxLength={40}
          className="h-9 bg-background"
        />
        <Button type="submit" disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Plus aria-hidden />}
          Create squad
        </Button>
      </div>
    </form>
  );
}

function JoinSquad({ onJoined, isMember }: { onJoined: () => void; isMember: (code: string) => boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (clean.length !== 6) return setError("Codes are 6 letters and numbers, like K7Q2XA.");
    if (isMember(clean)) return setError("You're already in that squad.");
    setBusy(true);
    setError(null);
    try {
      const squad = await data.joinSquad(clean);
      setCode("");
      toast.success(`Joined ${squadName(squad)}`);
      onJoined();
    } catch {
      setError("No squad has that code. Check it with whoever sent it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-muted p-4" noValidate>
      <label htmlFor="squad-code" className="type-heading">
        Join with a code
      </label>
      <p className="type-small text-muted-foreground">Paste a code or an invite link.</p>
      <div className="flex gap-2">
        <Input
          id="squad-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="K7Q2XA"
          autoCapitalize="characters"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "squad-code-error" : undefined}
          className="h-9 bg-background uppercase tabular-nums placeholder:normal-case"
        />
        <Button type="submit" variant="outline" disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus aria-hidden />}
          Join
        </Button>
      </div>
      {error && (
        <p id="squad-code-error" className="type-small text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
