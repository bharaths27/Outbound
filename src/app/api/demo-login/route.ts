// POST /api/demo-login  { "email": "outbound-demo1@bu.edu" }
// Signs in one of the team's demo accounts with DEMO_PASSWORD (server-only env) and sets
// the Supabase session cookie, so judges get one-tap demo logins without the password
// ever reaching the browser. Only the demo emails in SUPABASE_DEMO_ACCOUNTS are accepted.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { DEMO_EMAILS } from "@/lib/data/supabase/demo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let email = "";
  try {
    email = String((await req.json())?.email ?? "").trim().toLowerCase();
  } catch {
    return Response.json({ error: 'Send JSON like { "email": "outbound-demo1@bu.edu" }' }, { status: 400 });
  }
  if (!DEMO_EMAILS.has(email)) return Response.json({ error: "Not a demo account" }, { status: 400 });

  const password = process.env.DEMO_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!password || !url || !key) {
    return Response.json({ error: "Demo logins aren't set up on this server" }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn("[demo-login] sign-in failed:", error.message);
    return Response.json({ error: "Demo sign-in failed" }, { status: 401 });
  }
  return Response.json({ ok: true });
}
