// POST /api/rewards/claim  { "wallet": "<Phantom address>" }   (header: Authorization: Bearer <token>)
// Mints every OUT the player has earned (1 per XP) but not claimed yet to their wallet on Solana devnet.
// -> { minted: number, signature?: string, explorer?: string }
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { playerFromRequest, rewardsSecret, serverDb } from "@/lib/rewards-server";
import { explorerTx } from "@/lib/rewards";
import { mintOut, parseWallet } from "@/lib/solana-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const player = await playerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Sign in first", hint: "NOT_SIGNED_IN" }, { status: 401 });
  const limited = rateLimit(req, "claim", 10, 10 * 60_000, player.userId);
  if (limited) return limited;
  const wallet = parseWallet((await req.json().catch(() => ({})))?.wallet);
  if (!wallet) return NextResponse.json({ error: "Connect a Solana wallet first", hint: "BAD_WALLET" }, { status: 400 });

  const db = serverDb();
  const secret = rewardsSecret();
  const { data: res, error } = await db
    .rpc("reward_reserve_mint", { p_user: player.userId, p_wallet: wallet.toBase58(), p_secret: secret })
    .single<{ event_id: number | null; amount: number }>();
  if (error) return NextResponse.json({ error: error.message, hint: error.hint }, { status: 500 });
  if (!res?.event_id || res.amount <= 0) return NextResponse.json({ minted: 0 });

  try {
    const signature = await mintOut(wallet, res.amount);
    await db.rpc("reward_finish_mint", { p_event: res.event_id, p_tx: signature, p_ok: true, p_secret: secret });
    return NextResponse.json({ minted: res.amount, signature, explorer: explorerTx(signature) });
  } catch (e) {
    console.error("[rewards] mint failed:", (e as Error).message);
    await db.rpc("reward_finish_mint", { p_event: res.event_id, p_tx: null, p_ok: false, p_secret: secret });
    return NextResponse.json({ error: "Minting on Solana failed. Try again in a minute.", hint: "MINT_FAILED" }, { status: 502 });
  }
}
