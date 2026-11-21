"use client";

// Sign in with a school email (magic link), or try a demo account. The email's school is
// checked as you type so unsupported schools get a clear answer before anything is sent.
// ?next=/some/path returns there after a demo sign-in.

import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_ACCOUNTS, data } from "@/lib/data";
import type { School } from "@/lib/data/types";
import { isEmail, safeNext, schoolForEmail } from "./auth";

export function LoginPage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="type-small text-muted-foreground">Outbound</p>
        <h1 className="type-display">Explore Boston on the T</h1>
        <p className="type-body text-muted-foreground">
          Find food, events, and views near every stop. Earn stamps, level up your passport, and win the week for your
          school.
        </p>
      </div>
      <Suspense fallback={null}>
        <LoginForms />
      </Suspense>
    </div>
  );
}

function LoginForms() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [schools, setSchools] = useState<School[]>([]);
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState<string | null>(null);

  useEffect(() => {
    data.getSchools().then(setSchools).catch(() => setSchools([]));
  }, []);

  const valid = isEmail(email);
  const school = valid ? schoolForEmail(email, schools) : null;
  const unsupported = valid && schools.length > 0 && !school;
  let hint: { text: string; error: boolean } | null = null;
  if (touched && email && !valid) hint = { text: "Enter your full school email, like you@bu.edu.", error: true };
  else if (unsupported) {
    hint = {
      text: `Outbound is open to ${schools.map((s) => s.name).join(", ")}. Use your school email from one of those.`,
      error: true,
    };
  } else if (school) hint = { text: `You'll play for ${school.name}.`, error: false };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid || unsupported) return;
    setSending(true);
    try {
      const res = await data.signInWithEmail(email.trim());
      if (res.ok) setSentTo(email.trim());
      else if (res.error === "unsupported_school") toast.error("That school isn't on Outbound yet. Use a supported school email.");
      else toast.error("We couldn't send the sign-in link. Try again in a minute.");
    } catch {
      toast.error("We couldn't send the sign-in link. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function demo(userId: string) {
    setDemoBusy(userId);
    try {
      await data.signInDemo(userId);
      router.push(next);
    } catch {
      toast.error("That demo account isn't available right now.");
      setDemoBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {sentTo ? (
        <div className="flex flex-col gap-2 rounded-xl bg-muted p-4" role="status">
          <p className="type-heading">Check your inbox</p>
          <p className="type-body text-muted-foreground">
            We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>. Open it on this
            device to continue.
          </p>
          <Button variant="ghost" className="self-start" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <label htmlFor="email" className="type-heading">
            Sign in with your school email
          </label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={hint?.error ? true : undefined}
            aria-describedby={hint ? "email-hint" : undefined}
            className="h-11"
          />
          {hint && (
            <p id="email-hint" className={hint.error ? "type-small text-destructive" : "type-small text-muted-foreground"}>
              {hint.text}
            </p>
          )}
          <Button type="submit" disabled={sending} className="mt-1">
            {sending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Mail aria-hidden />}
            Send sign-in link
          </Button>
        </form>
      )}

      <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="demo-heading" className="type-heading">
            Try a demo account
          </h2>
          <p className="type-small text-muted-foreground">No email needed. Demo players can check in from anywhere.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.userId}>
              <Button
                variant="outline"
                onClick={() => demo(a.userId)}
                disabled={demoBusy !== null}
                className="h-auto w-full flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
              >
                <span className="type-body font-medium">
                  {demoBusy === a.userId && <Loader2 className="mr-1.5 inline size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                  {a.label}
                </span>
                <span className="type-small text-muted-foreground">{a.blurb}</span>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <p className="type-small text-muted-foreground">
        Just looking? <Link href="/" className="text-accent underline-offset-4 hover:underline">Browse the map</Link> without
        signing in.
      </p>
    </div>
  );
}
