// GET /api/rewards/status -> what the Rewards page needs and whether this server has it.
// Booleans and public addresses only: never a key or secret.
// { dataSource, supabase, mint, mintKey, signer, signerKey, rewardsSecret, devnet, signerSol }
import { NextResponse } from "next/server";
import { connection, outMint, serverKeypair } from "@/lib/solana-server";

export const dynamic = "force-dynamic";

const tryOr = <T,>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

export async function GET() {
  const mint = tryOr(() => outMint().toBase58());
  const signer = tryOr(() => serverKeypair().publicKey);
  let devnet = false;
  let signerSol: number | null = null;
  try {
    const conn = connection();
    const ok = await Promise.race([conn.getLatestBlockhash().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 5000))]);
    devnet = ok;
    if (ok && signer) signerSol = (await conn.getBalance(signer)) / 1e9;
  } catch {
    devnet = false;
  }
  return NextResponse.json({
    dataSource: process.env.NEXT_PUBLIC_DATA_SOURCE === "supabase" ? "supabase" : "mock",
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    mint: !!mint,
    mintKey: mint,
    signer: !!signer,
    signerKey: signer?.toBase58() ?? null,
    rewardsSecret: !!process.env.REWARDS_SECRET?.trim(),
    devnet,
    signerSol,
  });
}
