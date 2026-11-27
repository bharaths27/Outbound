// GET /auth/callback?code=…&next=/  — finishes Google sign-in (Supabase OAuth, PKCE): swaps the
// code for a session cookie, then sends the player on. A non-school Google account never gets
// a profile: the signup trigger rejects it, and we send them back to /login with a message.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeNext } from "@/features/auth/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const fail = (why: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(why)}`, url.origin));
  if (url.searchParams.get("error")) return fail("school_only");
  if (!code || !supaUrl || !key) return fail("google_unavailable");

  const store = await cookies();
  const supabase = createServerClient(supaUrl, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail("school_only");
  return NextResponse.redirect(new URL(next, url.origin));
}
