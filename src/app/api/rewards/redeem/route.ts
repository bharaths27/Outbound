// POST /api/rewards/redeem  { "signature": "<tx sig>", "wallet": "<address>", "percent": 10 | 20 | 30 }
// (header: Authorization: Bearer <token>)
// The player first sends OUT to the Outbound treasury from Phantom (with the memo from redeemMemo()).
// We check that transaction on Solana, then hand back a coupon code. Each transaction works once.
// -> { coupon, percent, explorer }
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { playerFromRequest, rewardsSecret, serverDb } from "@/lib/rewards-server";
import { explorerTx, redeemMemo, tierFor } from "@/lib/rewards";
import { parseWallet, verifyRedeem } from "@/lib/solana-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const player = await playerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Sign in first", hint: "NOT_SIGNED_IN" }, { status: 401 });
  const limited = rateLimit(req, "redeem", 10, 10 * 60_000, player.userId);
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const wallet = parseWallet(body?.wallet);
  const tier = tierFor(Number(body?.percent));
  const signature = typeof body?.signature === "string" && /^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(body.signature) ? body.signature : null;
  if (!wallet || !tier || !signature) return NextResponse.json({ error: "Missing wallet, tier or signature" }, { status: 400 });

  const problem = await verifyRedeem(signature, wallet, tier.cost, redeemMemo(player.userId, tier.percent)).catch(
    (e) => `Couldn't check Solana: ${(e as Error).message}`,
  );
  if (problem) return NextResponse.json({ error: problem, hint: "BAD_TX" }, { status: 400 });

  const coupon = `OUT-${tier.percent}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const { error } = await serverDb().rpc("reward_record_redeem", {
    p_user: player.userId, p_wallet: wallet.toBase58(), p_amount: tier.cost, p_tier: tier.percent,
    p_tx: signature, p_coupon: coupon, p_secret: rewardsSecret(),
  });
  if (error) return NextResponse.json({ error: error.message, hint: error.hint }, { status: error.hint === "TX_ALREADY_USED" ? 409 : 500 });
  return NextResponse.json({ coupon, percent: tier.percent, explorer: explorerTx(signature) });
}
