// Server-only Solana helpers for Outbound Rewards (devnet). Never import this in a client component:
// it reads SOLANA_SECRET_KEY, the key that can mint OUT.
import "server-only";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
  type ParsedInstruction, type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";
import { DEFAULT_RPC, MEMO_PROGRAM_ID } from "@/lib/rewards";

export function connection() {
  return new Connection(process.env.SOLANA_RPC_URL || DEFAULT_RPC, "confirmed");
}

// SOLANA_SECRET_KEY may be base58 (Phantom export style) or a JSON array (solana-keygen style).
export function serverKeypair(): Keypair {
  const raw = process.env.SOLANA_SECRET_KEY?.trim();
  if (!raw) throw new Error("SOLANA_SECRET_KEY not set");
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  return Keypair.fromSecretKey(bytes);
}

export function outMint(): PublicKey {
  const m = process.env.NEXT_PUBLIC_OUT_MINT;
  if (!m) throw new Error("NEXT_PUBLIC_OUT_MINT not set");
  return new PublicKey(m);
}

export const ata = (owner: PublicKey, mint = outMint()) =>
  getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);

export function treasury() {
  return ata(serverKeypair().publicKey);
}

export function parseWallet(s: unknown): PublicKey | null {
  try {
    const pk = new PublicKey(String(s));
    return PublicKey.isOnCurve(pk.toBytes()) ? pk : null;
  } catch {
    return null;
  }
}

// Mint OUT to a player's wallet. Also tops up a little devnet SOL so they can pay fees to redeem.
export async function mintOut(wallet: PublicKey, amount: number): Promise<string> {
  const conn = connection();
  const payer = serverKeypair();
  const mint = outMint();
  const dest = ata(wallet, mint);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, dest, wallet, mint, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint, dest, payer.publicKey, BigInt(amount), [], TOKEN_2022_PROGRAM_ID),
  );
  if ((await conn.getBalance(wallet)) < 0.005 * LAMPORTS_PER_SOL) {
    tx.add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: wallet, lamports: 0.02 * LAMPORTS_PER_SOL }));
  }
  return sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
}

// Check that `sig` is a confirmed transaction in which `wallet` sent exactly `amount` OUT to our
// treasury with the memo we expect. Retries briefly because a just-sent transaction may lag.
export async function verifyRedeem(sig: string, wallet: PublicKey, amount: number, memo: string): Promise<string | null> {
  const conn = connection();
  const mint = outMint().toBase58();
  const dest = treasury().toBase58();
  for (let attempt = 0; attempt < 6; attempt++) {
    const tx = await conn.getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (tx.meta?.err) return "That transaction failed on Solana.";
    const ixs = tx.transaction.message.instructions as (ParsedInstruction | PartiallyDecodedInstruction)[];
    const parsed = ixs.filter((i): i is ParsedInstruction => "parsed" in i);
    const transfer = parsed.find(
      (i) =>
        i.programId.equals(TOKEN_2022_PROGRAM_ID) &&
        i.parsed?.type === "transferChecked" &&
        i.parsed.info?.mint === mint &&
        i.parsed.info?.destination === dest &&
        i.parsed.info?.authority === wallet.toBase58() &&
        i.parsed.info?.tokenAmount?.amount === String(amount),
    );
    if (!transfer) return "That transaction isn't an OUT payment of the right amount to Outbound.";
    const hasMemo = parsed.some((i) => i.programId.toBase58() === MEMO_PROGRAM_ID && String(i.parsed) === memo);
    if (!hasMemo) return "That transaction is missing the Outbound memo.";
    return null; // valid
  }
  return "Couldn't find that transaction yet. Try again in a few seconds.";
}
