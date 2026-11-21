// Server-only helpers shared by the /api/rewards routes.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = () => (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

export function rewardsSecret() {
  const s = process.env.REWARDS_SECRET?.trim();
  if (!s) throw new Error("REWARDS_SECRET not set");
  return s;
}

// A Supabase client that acts as the signed-in player (from the "Authorization: Bearer <token>" header).
// Returns null if the token is missing or invalid.
export async function playerFromRequest(req: Request): Promise<{ db: SupabaseClient; userId: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const db = createClient(url(), key(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { db, userId: data.user.id };
}

// A plain (anonymous) client for the secret-checked ledger functions.
export function serverDb() {
  return createClient(url(), key(), { auth: { persistSession: false, autoRefreshToken: false } });
}
