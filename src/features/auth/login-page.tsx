"use client";

// Sign in or create an account with a school email and password (Supabase Auth), or try
// a demo account with one tap. The email's school is checked as you type, so unsupported
// schools get a clear answer before anything is sent. New accounts go to onboarding.
// ?next=/some/path returns there afterward (same-site paths only).

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_ACCOUNTS, data } from "@/lib/data";
import type { AuthError, School } from "@/lib/data/types";
import { Stamp } from "@/features/passport/stamp";
import { isEmail, safeNext, schoolForEmail } from "./auth";

type Mode = "signin" | "signup";

const MIN_PASSWORD = 6;

const AUTH_COPY: Record<AuthError, string> = {
  unsupported_school: "That school isn't on Outbound yet. Use a supported school email.",
  invalid_credentials: "That email and password don't match. Check them, or create an account.",
  already_registered: "There's already an account for that email. Sign in instead.",
  weak_password: `Use a password with at least ${MIN_PASSWORD} characters.`,
  failed: "Something went wrong. Try again in a moment.",
};

export function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-page desk:flex-row">
      {/* Intro: a maroon band on phones, the left half on desktop (DESIGN.md §6 Login). */}
      <section className="relative overflow-hidden bg-maroon px-6 pt-7 pb-[52px] text-white desk:flex desk:flex-1 desk:flex-col desk:px-14 desk:py-12">
        {/* eslint-disable-next-line @next/next/no-img-element -- static SVG wordmark */}
        <img src="/outbound-wordmark.svg" alt="Outbound" className="block h-[26px] w-auto self-start desk:h-8" />
        <div aria-hidden className="pointer-events-none absolute top-[150px] right-[120px] hidden rotate-[-8deg] rounded-full bg-page shadow-[0_12px_30px_rgb(0_0_0/0.25)] desk:block">
          <Stamp questId="login-hero" title="Kenmore" neighborhood="Fenway-Kenmore" stationId="place-kencl" type="scenic" tier="gold" size={150} />
        </div>
        <div className="relative desk:mt-auto">
          <h1 className="mt-[22px] font-display text-[30px] leading-[1.1] font-semibold text-gold desk:mt-0 desk:text-[56px] desk:leading-[1.05]">
            Explore Boston via T
          </h1>
          <p className="mt-2 max-w-[460px] text-[15px] leading-normal text-on-maroon-muted desk:mt-4 desk:text-lg">
            Tap a station, find food, events and views nearby, and check in for XP and passport stamps. Every check-in helps
            your school win the week.
          </p>
        </div>
      </section>
      <main className="-mt-8 flex flex-1 justify-center px-4 pb-8 desk:mt-0 desk:items-center desk:px-10 desk:py-14">
        <div className="w-full max-w-[440px]">
          <Suspense fallback={null}>
            <LoginForms />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function LoginForms() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<Mode>("signin");
  const [schools, setSchools] = useState<School[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
  } else if (school && mode === "signup") hint = { text: `You'll play for ${school.name}.`, error: false };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFormError(null);
    if (!valid || unsupported) return;
    if (mode === "signup" && password.length < MIN_PASSWORD) return setFormError(AUTH_COPY.weak_password);
    if (!password) return setFormError("Enter your password.");
    setBusy(true);
    try {
      const res = mode === "signin" ? await data.signIn(email, password) : await data.signUp(email, password);
      if (!res.ok) {
        setFormError(AUTH_COPY[res.error]);
        if (res.error === "already_registered") setMode("signin");
        return;
      }
      // New players (no name yet) get onboarding first.
      const fresh = mode === "signup" || !res.profile.display_name;
      router.push(fresh ? `/onboarding?next=${encodeURIComponent(next)}` : next);
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function demo(id: string) {
    setDemoBusy(id);
    try {
      await data.signInDemo(id);
      // Full load, so the Supabase client starts with the new session cookie.
      window.location.assign(next);
    } catch {
      toast.error("That demo account isn't available right now.");
      setDemoBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={submit}
        className="relative flex flex-col gap-3.5 rounded-[22px] border border-border bg-surface p-4 shadow-card desk:gap-4 desk:rounded-2xl desk:p-6"
        noValidate
      >
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            setFormError(null);
          }}
        >
          <TabsList className="h-10 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-bold">
            School email
          </label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@school.edu"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFormError(null);
            }}
            onBlur={() => setTouched(true)}
            aria-invalid={hint?.error ? true : undefined}
            aria-describedby={hint ? "email-hint" : undefined}
            className="h-[50px] text-base"
          />
          {hint && (
            <p id="email-hint" className={hint.error ? "type-small text-destructive" : "type-small text-muted-foreground"}>
              {hint.text}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-bold">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFormError(null);
            }}
            aria-describedby={mode === "signup" ? "password-hint" : undefined}
            className="h-[50px] text-base"
          />
          {mode === "signup" && (
            <p id="password-hint" className="type-small text-muted-foreground">
              At least {MIN_PASSWORD} characters.
            </p>
          )}
        </div>

        {formError && (
          <p className="type-small text-destructive" role="alert">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={busy} className="mt-1 h-11 rounded-2xl text-base font-bold">
          {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <section aria-labelledby="demo-heading" className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h2 id="demo-heading" className="text-[15px] font-bold">
            Try a demo account
          </h2>
          <p className="type-small text-muted-foreground">No password needed. Check-ins still need you at the spot.</p>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.id}>
              <Button
                variant="outline"
                onClick={() => demo(a.id)}
                disabled={demoBusy !== null}
                className="h-full min-h-[72px] w-full flex-col items-start justify-start gap-0.5 rounded-lg bg-surface px-3 py-3 text-left whitespace-normal"
              >
                <span className="text-[15px] font-bold">
                  {demoBusy === a.id && <Loader2 className="mr-1.5 inline size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
                  {a.label}
                </span>
                <span className="text-xs leading-snug font-normal text-muted-foreground">{a.blurb}</span>
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-sm text-muted-2">
        Just looking?{" "}
        <Link href="/" className="font-bold text-maroon underline-offset-4 hover:underline">
          Browse the map without signing in
        </Link>
      </p>
    </div>
  );
}
