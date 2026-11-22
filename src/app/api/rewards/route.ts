// GET /api/rewards   (header: Authorization: Bearer <Supabase access token>)
// -> { summary: { earned, minted, pending, redeemed, claimable }, events: [...], mint, treasury, tiers }
import { NextResponse } from "next/server";
import { playerFromRequest } from "@/lib/rewards-server";
import { TIERS } from "@/lib/rewards";
import { treasury } from "@/lib/solana-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const player = await playerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Sign in first", hint: "NOT_SIGNED_IN" }, { status: 401 });
  const [{ data: summary, error: se }, { data: events, error: ee }] = await Promise.all([
    player.db.rpc("reward_summary", { p_user: player.userId }).single(),
    player.db
      .from("reward_events")
      .select("id, kind, amount, wallet, status, tx_sig, tier, coupon, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (se || ee) return NextResponse.json({ error: (se ?? ee)!.message }, { status: 500 });
  let treasuryAddr: string | null = null;
  try {
    treasuryAddr = treasury().toBase58();
  } catch {
    /* Solana env not set yet */
  }
  return NextResponse.json({
    summary, events, tiers: TIERS, mint: process.env.NEXT_PUBLIC_OUT_MINT ?? null, treasury: treasuryAddr,
  });
}
