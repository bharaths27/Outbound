// POST /api/rewards/gas  { "wallet": "<address>" }   (header: Authorization: Bearer <token>)
// Redeeming means the player sends OUT from Phantom, which costs a tiny devnet SOL fee. If their wallet
// is nearly out of SOL, this sends 0.02 devnet SOL (devnet SOL has no value). -> { topUp: string | null }
import { NextResponse } from "next/server";
import { playerFromRequest } from "@/lib/rewards-server";
import { parseWallet, topUpSol } from "@/lib/solana-server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const player = await playerFromRequest(req);
  if (!player) return NextResponse.json({ error: "Sign in first", hint: "NOT_SIGNED_IN" }, { status: 401 });
  const wallet = parseWallet((await req.json().catch(() => ({})))?.wallet);
  if (!wallet) return NextResponse.json({ error: "Connect a Solana wallet first", hint: "BAD_WALLET" }, { status: 400 });
  try {
    return NextResponse.json({ topUp: await topUpSol(wallet) });
  } catch (e) {
    console.error("[rewards] SOL top-up failed:", (e as Error).message);
    return NextResponse.json({ error: "Couldn't top up devnet SOL. Try again in a minute.", hint: "GAS_FAILED" }, { status: 502 });
  }
}
