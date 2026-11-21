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
      router.push(next);
    } catch {
      toast.error("That demo account isn't available right now.");
      setDemoBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            setFormError(null);
          }}
        >
          <TabsList>
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="type-small font-medium">
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
            className="h-11"
          />
          {hint && (
            <p id="email-hint" className={hint.error ? "type-small text-destructive" : "type-small text-muted-foreground"}>
              {hint.text}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="type-small font-medium">
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
            className="h-11"
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

        <Button type="submit" disabled={busy} className="mt-1">
          {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <section aria-labelledby="demo-heading" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="demo-heading" className="type-heading">
            Try a demo account
          </h2>
          <p className="type-small text-muted-foreground">No password needed. Demo players can check in from anywhere.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.id}>
              <Button
                variant="outline"
                onClick={() => demo(a.id)}
                disabled={demoBusy !== null}
                className="h-auto w-full flex-col items-start gap-0.5 py-3 text-left whitespace-normal"
              >
                <span className="type-body font-medium">
                  {demoBusy === a.id && <Loader2 className="mr-1.5 inline size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
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
